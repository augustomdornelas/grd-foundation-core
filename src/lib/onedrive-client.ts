// ============================================================
// Cliente do Microsoft Graph (OneDrive) — SÓ SERVIDOR
// ------------------------------------------------------------
// Nenhuma chamada ao Graph sai do navegador. O gatilho é
// /api/onedrive/sync, em src/server.ts; ele chama onedrive-sync.ts;
// onedrive-sync.ts chama este arquivo; este arquivo fala com a
// Microsoft. O client_secret nunca atravessa para o cliente.
//
// A DIVISÃO COM onedrive-sync.ts é a mesma de contaazul-client.ts com
// contaazul-tokens.ts, e vale de mão única: aqui mora o transporte
// (token, HTTP, paginação do delta); lá mora a regra de negócio (o que
// é uma pasta de orçamento, que cliente é esse, o que grava no banco).
// Este arquivo não conhece a tabela `orcamentos` e não sabe o que é um
// orçamento.
//
// AUTENTICAÇÃO É CLIENT CREDENTIALS, não código de usuário.
//
// O job roda de madrugada, chamado por um agendador; não há ninguém
// logado para autorizar nada. Então o Portal se apresenta como
// APLICAÇÃO (grant_type=client_credentials, scope .default) e usa a
// permissão de aplicação concedida pelo administrador do tenant. Isso
// tem uma consequência que aparece como erro e vale dizer antes: sem o
// consentimento do administrador, o token SAI NORMALMENTE e o 403
// aparece só na primeira chamada ao drive. Ver `descreverStatus()`.
//
// DIFERENÇA DELIBERADA PARA O CONTA AZUL: lá o refresh_token rotaciona
// e precisa de uma tabela. Aqui não existe refresh_token — o token de
// aplicação vale ~1h e é pedido de novo quando vence. Por isso o cache
// é de processo (memória), e não de banco: guardar no banco um segredo
// que se regenera com uma requisição só adicionaria uma tabela, um
// caminho de escrita e nenhuma garantia nova.
// ============================================================

// Guarda de segurança: se este módulo cair num bundle de tela, a falha
// tem que ser barulhenta e imediata, e não um vazamento silencioso do
// MS_CLIENT_SECRET para o navegador.
if (typeof window !== "undefined") {
  throw new Error(
    "onedrive-client.ts é código de servidor e foi importado no navegador. " +
      "Isto exporia o MS_CLIENT_SECRET.",
  );
}

const GRAPH = "https://graph.microsoft.com/v1.0";

const TIMEOUT_MS = 30_000;
const TENTATIVAS = 3;

/** Margem de renovação. Token que vence no meio da requisição vira 401. */
const MARGEM_MS = 5 * 60_000;

// ------------------------------------------------------------
// Erro
// ------------------------------------------------------------
export class OneDriveErro extends Error {
  readonly status: number;
  readonly corpo: string;
  /** true quando falta configuração ou permissão e repetir não resolve. */
  readonly precisaConfigurar: boolean;

  constructor(mensagem: string, status = 0, corpo = "", precisaConfigurar = false) {
    super(mensagem);
    this.name = "OneDriveErro";
    this.status = status;
    this.corpo = corpo;
    this.precisaConfigurar = precisaConfigurar;
  }
}

// ------------------------------------------------------------
// Credenciais, vindas do ambiente
// ------------------------------------------------------------
// NUNCA com prefixo VITE_ e nunca no .env versionado: os dois caminhos
// publicariam o client_secret no bundle do navegador. Em produção quem
// entrega estas variáveis é o painel do host; em `vite dev`, o
// carregarEnvDoServidor() do vite.config.ts.
export type CredenciaisOneDrive = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  driveId: string;
  /** Item id OU caminho da pasta dentro do drive. Ver `caminhoDaPasta()`. */
  pasta: string;
};

const NOMES_DAS_CREDENCIAIS = [
  "MS_TENANT_ID",
  "MS_CLIENT_ID",
  "MS_CLIENT_SECRET",
  "MS_DRIVE_ID",
  "MS_PASTA_ORCAMENTOS",
] as const;

export function lerCredenciais(): CredenciaisOneDrive | null {
  const tenantId = process.env.MS_TENANT_ID?.trim();
  const clientId = process.env.MS_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim();
  const driveId = process.env.MS_DRIVE_ID?.trim();
  const pasta = process.env.MS_PASTA_ORCAMENTOS?.trim();
  if (!tenantId || !clientId || !clientSecret || !driveId || !pasta) return null;
  return { tenantId, clientId, clientSecret, driveId, pasta };
}

export function credenciaisFaltando(): string {
  return NOMES_DAS_CREDENCIAIS.filter((nome) => !process.env[nome]?.trim()).join(", ");
}

export function exigirCredenciais(): CredenciaisOneDrive {
  const credenciais = lerCredenciais();
  if (!credenciais) {
    throw new OneDriveErro(
      `Faltam credenciais no ambiente do servidor: ${credenciaisFaltando()}. ` +
        "Cadastre no painel do host (nunca no .env versionado, nunca com prefixo VITE_).",
      0,
      "",
      true,
    );
  }
  return credenciais;
}

// ------------------------------------------------------------
// Endereçar a pasta: item id ou caminho, os dois servem
// ------------------------------------------------------------
/**
 * MS_PASTA_ORCAMENTOS aceita as duas formas porque as duas aparecem na
 * mão de quem configura: o item id (copiado de uma resposta do Graph,
 * imune a renome) e o caminho legível ("Comercial/ORÇAMENTOS 2026", que
 * é o que dá para ler na tela do OneDrive).
 *
 * A distinção é por formato, e não por adivinhação: item id do Graph é
 * uma cadeia sem espaço nem barra. Qualquer coisa com barra ou espaço
 * só pode ser caminho.
 *
 * PREFIRA O ITEM ID. O caminho quebra no dia em que alguém renomear a
 * pasta pai — e renomear pasta é justamente o que acontece na virada do
 * ano, quando "ORÇAMENTOS 2026" ganha companhia.
 */
export function caminhoDaPasta(c: CredenciaisOneDrive): string {
  const bruto = c.pasta.replace(/^\/+|\/+$/g, "");
  const pareceItemId = /^[A-Za-z0-9!._~%-]{8,}$/.test(bruto);
  if (pareceItemId) return `/drives/${encodeURIComponent(c.driveId)}/items/${bruto}`;

  // Encode por segmento: a barra separa e não pode ser escapada, mas
  // "ORÇAMENTOS 2026" tem cedilha e espaço, que precisam.
  const caminho = bruto.split("/").map(encodeURIComponent).join("/");
  return `/drives/${encodeURIComponent(c.driveId)}/root:/${caminho}:`;
}

// ------------------------------------------------------------
// Token de aplicação, com cache e renovação
// ------------------------------------------------------------
type TokenCache = { valor: string; expiraEm: number };

let cache: TokenCache | null = null;
/** Renovação em voo: sem isto, dez chamadas simultâneas pedem dez tokens. */
let renovacaoEmCurso: Promise<string> | null = null;

function urlDoToken(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

async function obterToken(c: CredenciaisOneDrive): Promise<string> {
  if (cache && Date.now() < cache.expiraEm - MARGEM_MS) return cache.valor;
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = (async () => {
    const corpo = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      // ".default" quer dizer "todas as permissões de APLICAÇÃO que o
      // administrador do tenant já consentiu". Pedir escopo item a item
      // é o formato do fluxo com usuário, e aqui não há usuário.
      scope: "https://graph.microsoft.com/.default",
    }).toString();

    let resposta: Response;
    try {
      resposta = await fetch(urlDoToken(c.tenantId), {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: corpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new OneDriveErro(`Falha ao autenticar na Microsoft: ${mensagemDeRede(e)}`);
    }

    const texto = await resposta.text();
    if (!resposta.ok) {
      // O corpo do erro da Microsoft NÃO contém o client_secret, e é
      // onde eles dizem o motivo real (AADSTS7000215 = segredo errado,
      // AADSTS700016 = client_id que não existe no tenant). Repassar em
      // vez de resumir: a frase deles aponta a causa, a nossa não.
      throw new OneDriveErro(
        `A Microsoft recusou o pedido de token (HTTP ${resposta.status}).`,
        resposta.status,
        texto.slice(0, 500),
        resposta.status === 400 || resposta.status === 401,
      );
    }

    let dados: { access_token?: string; expires_in?: number };
    try {
      dados = JSON.parse(texto) as typeof dados;
    } catch {
      throw new OneDriveErro("A Microsoft devolveu uma resposta de token ilegível.", 200);
    }
    if (!dados.access_token) {
      throw new OneDriveErro("A Microsoft respondeu sem access_token.", 200);
    }

    // Sem expires_in, assume 1h — que é o que eles documentam. A margem
    // de 5 min cuida do resto.
    const duracao = (dados.expires_in ?? 3600) * 1000;
    cache = { valor: dados.access_token, expiraEm: Date.now() + duracao };
    return dados.access_token;
  })();

  try {
    return await renovacaoEmCurso;
  } finally {
    renovacaoEmCurso = null;
  }
}

/** Descarta o token guardado. Existe para o teste manual e para o dia
 *  em que o segredo for trocado sem reiniciar o processo. */
export function invalidarToken(): void {
  cache = null;
}

// ------------------------------------------------------------
// Erros de rede e de status, em português
// ------------------------------------------------------------
function mensagemDeRede(e: unknown): string {
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return `a Microsoft não respondeu em ${TIMEOUT_MS / 1000}s`;
  }
  if (e instanceof Error) {
    const causa = (e as { cause?: { code?: string } }).cause;
    if (causa?.code === "ENOTFOUND") return "não foi possível resolver o endereço do Graph";
    if (causa?.code === "ECONNREFUSED") return "o Graph recusou a conexão";
    return e.message;
  }
  return String(e);
}

function descreverStatus(status: number, caminho: string): string {
  if (status === 401) {
    return (
      `O Graph recusou o token (HTTP 401) em ${caminho}. ` +
      "Com client credentials isto costuma ser MS_CLIENT_SECRET vencido — o segredo do App Registration tem prazo."
    );
  }
  if (status === 403) {
    return (
      `O Graph negou o acesso a ${caminho} (HTTP 403). ` +
      "Com client credentials o token sai mesmo sem permissão: confira se Files.Read.All (ou Sites.Read.All) " +
      "está concedida como permissão de APLICAÇÃO e se o administrador do tenant deu o consentimento."
    );
  }
  if (status === 404) {
    return (
      `Não encontrado no Graph: ${caminho}. ` +
      "Confira MS_DRIVE_ID e MS_PASTA_ORCAMENTOS — se a pasta foi informada por caminho, um renome na pasta pai já derruba."
    );
  }
  if (status === 429) {
    return "O Graph recusou por excesso de requisições (429). A espera segue o Retry-After que eles mandaram.";
  }
  return `O Graph recusou a requisição (HTTP ${status}) em ${caminho}.`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Quanto esperar antes da próxima tentativa. `Retry-After` manda quando
 * vem — o Graph é agressivo com throttling, e o número dele é o único
 * que evita levar 429 de novo na tentativa seguinte.
 */
function esperaDaTentativa(tentativa: number, resposta: Response | null): number {
  const cabecalho = resposta?.headers.get("retry-after");
  if (cabecalho) {
    const segundos = Number(cabecalho);
    if (Number.isFinite(segundos) && segundos >= 0) return Math.min(segundos * 1_000, 60_000);
  }
  return 500 * 2 ** (tentativa - 1);
}

// ------------------------------------------------------------
// A requisição
// ------------------------------------------------------------
/**
 * Uma chamada ao Graph, com Bearer válido e retry.
 *
 * `alvo` aceita caminho relativo ("/drives/x/items/y/delta") ou URL
 * absoluta — o delta devolve `@odata.nextLink` e `@odata.deltaLink`
 * como URLs inteiras, e reconstruí-las à mão seria reescrever o token
 * de continuação que eles mandaram.
 *
 * RETRY SÓ EM 429 E 5xx. Nos demais 4xx o Graph recusou o CONTEÚDO, e
 * não o momento: repetir um 403 por falta de consentimento multiplica o
 * erro e atrasa a mensagem que diz o que fazer.
 */
export async function graphFetch<T>(
  alvo: string,
  opcoes: { metodo?: string; corpo?: unknown } = {},
): Promise<T> {
  const c = exigirCredenciais();
  const url = alvo.startsWith("http") ? alvo : `${GRAPH}${alvo}`;
  // Só para a mensagem de erro: a URL do nextLink tem centenas de
  // caracteres de token de continuação e não ajuda ninguém a entender o
  // problema.
  const rotulo = alvo.startsWith("http") ? new URL(url).pathname : alvo;
  let ultimoErro: OneDriveErro | null = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const token = await obterToken(c);

    let resposta: Response;
    try {
      resposta = await fetch(url, {
        method: opcoes.metodo ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      // Falha de rede: nada chegou do outro lado, então repetir é seguro.
      ultimoErro = new OneDriveErro(`Falha ao chamar ${rotulo}: ${mensagemDeRede(e)}`);
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, null));
        continue;
      }
      throw ultimoErro;
    }

    if (resposta.ok) {
      const texto = await resposta.text();
      if (!texto) return undefined as T;
      try {
        return JSON.parse(texto) as T;
      } catch {
        throw new OneDriveErro(
          `Resposta ilegível de ${rotulo}.`,
          resposta.status,
          texto.slice(0, 300),
        );
      }
    }

    const texto = await resposta.text();

    if (resposta.status === 429 || resposta.status >= 500) {
      ultimoErro = new OneDriveErro(
        descreverStatus(resposta.status, rotulo),
        resposta.status,
        texto.slice(0, 500),
      );
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, resposta));
        continue;
      }
      throw ultimoErro;
    }

    throw new OneDriveErro(
      descreverStatus(resposta.status, rotulo),
      resposta.status,
      texto.slice(0, 500),
      resposta.status === 401 || resposta.status === 403 || resposta.status === 404,
    );
  }

  throw ultimoErro ?? new OneDriveErro(`Falha desconhecida em ${rotulo}.`);
}

// ------------------------------------------------------------
// O item do drive, só o que este projeto usa
// ------------------------------------------------------------
// O driveItem do Graph tem dezenas de campos. Declarar só os que a
// sincronização lê deixa explícito o que é contrato para nós — e o
// `folder` opcional é a diferença entre pasta e arquivo, que é como a
// etapa 1 separa uma pasta de orçamento do ORC.jpg que dorme no mesmo
// drive.
export type ItemDrive = {
  id: string;
  name?: string;
  webUrl?: string;
  /** Presente só em pasta. Ausente = arquivo. */
  folder?: { childCount?: number };
  file?: { mimeType?: string };
  /** Presente só quando o item foi apagado desde o último delta. */
  deleted?: { state?: string };
  parentReference?: { id?: string; driveId?: string; path?: string };
  createdDateTime?: string;
  lastModifiedDateTime?: string;
};

type RespostaDelta = {
  value?: ItemDrive[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export type ResultadoDelta = {
  itens: ItemDrive[];
  /** Guardar e devolver na próxima execução. `null` = o Graph não mandou. */
  deltaLink: string | null;
  /** Quantas requisições HTTP o delta custou. Vai para o diário. */
  requisicoes: number;
};

/** Teto de páginas. Delta que não termina é defeito do outro lado, e um
 *  laço infinito num job de madrugada não deixa rastro nenhum. */
const MAX_PAGINAS = 50;

/**
 * Percorre o delta da pasta e devolve tudo o que mudou.
 *
 * SEM `$select`: o delta aceita seleção de campos, mas a combinação de
 * `$select` com paginação já rendeu resposta sem a faceta `folder` — e
 * sem `folder` toda pasta vira arquivo e a sincronização não importa
 * nada, calada. São ~100 itens; o payload inteiro custa menos que esse
 * risco.
 *
 * O DELTA É RECURSIVO: devolve a subárvore, não os filhos diretos. Quem
 * decide o que é pasta de orçamento é onedrive-sync.ts — este arquivo
 * entrega o que veio.
 *
 * @param deltaLinkAnterior o `@odata.deltaLink` guardado da última
 *        execução bem-sucedida, ou null para varrer do zero.
 */
/**
 * Os filhos de um item qualquer, pelo id. É como se desce uma pasta de
 * orçamento para achar os documentos lá dentro.
 */
export async function lerFilhosDe(itemId: string): Promise<ItemDrive[]> {
  const c = exigirCredenciais();
  const itens: ItemDrive[] = [];
  let proxima: string | null =
    `/drives/${encodeURIComponent(c.driveId)}/items/${encodeURIComponent(itemId)}/children?$top=200`;
  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    const r: RespostaDelta = await graphFetch<RespostaDelta>(proxima);
    if (Array.isArray(r.value)) itens.push(...r.value);
    proxima = r["@odata.nextLink"] ?? null;
  }
  return itens;
}

/**
 * O CONTEÚDO de um arquivo, em bytes.
 *
 * Não passa por `graphFetch` porque aquele parseia JSON, e aqui o corpo é
 * um .docx ou .xlsx. O que se repete é o essencial: Bearer válido,
 * timeout e retry só em 429/5xx honrando Retry-After.
 *
 * `limiteBytes` existe porque o acervo tem projeto executivo de 16 MB
 * dormindo ao lado da proposta. Baixar isso por engano é minuto de job e
 * memória à toa, então quem chama declara o teto e o excesso vira recusa
 * explícita — nunca um download silencioso de dezenas de MB.
 */
export async function baixarArquivo(
  itemId: string,
  limiteBytes = 12 * 1024 * 1024,
): Promise<Uint8Array> {
  const c = exigirCredenciais();
  const url = `${GRAPH}/drives/${encodeURIComponent(c.driveId)}/items/${encodeURIComponent(itemId)}/content`;
  let ultimoErro: OneDriveErro | null = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const token = await obterToken(c);
    let resposta: Response;
    try {
      resposta = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        // Mais folgado que o de JSON: aqui trafegam megabytes.
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      ultimoErro = new OneDriveErro(`Falha ao baixar o arquivo: ${mensagemDeRede(e)}`);
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, null));
        continue;
      }
      throw ultimoErro;
    }

    if (resposta.status === 429 || resposta.status >= 500) {
      ultimoErro = new OneDriveErro(descreverStatus(resposta.status, "content"), resposta.status);
      if (tentativa < TENTATIVAS) {
        await esperar(esperaDaTentativa(tentativa, resposta));
        continue;
      }
      throw ultimoErro;
    }
    if (!resposta.ok) {
      throw new OneDriveErro(descreverStatus(resposta.status, "content"), resposta.status);
    }

    const declarado = Number(resposta.headers.get("content-length") ?? 0);
    if (declarado > limiteBytes) {
      throw new OneDriveErro(
        `Arquivo grande demais: ${(declarado / 1024 / 1024).toFixed(1)} MB, teto de ${(limiteBytes / 1024 / 1024).toFixed(0)} MB.`,
      );
    }
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.byteLength > limiteBytes) {
      throw new OneDriveErro(
        `Arquivo grande demais: ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB.`,
      );
    }
    return bytes;
  }

  throw ultimoErro ?? new OneDriveErro("Falha desconhecida ao baixar o arquivo.");
}

/**
 * As FILHAS DIRETAS da pasta, sem delta nenhum.
 *
 * É o estado, não a mudança — e é essa a diferença que importa. O delta
 * responde "o que mexeu desde a última vez" e, consumido o token, não
 * repete: uma pasta que o job deixou para trás por qualquer motivo nunca
 * mais aparece nele. `/children` responde "o que existe agora", toda vez,
 * e por isso é o que serve para duas coisas:
 *
 *   1. a VARREDURA COMPLETA, que reconcilia o que ficou para trás;
 *   2. a CONFERÊNCIA no fim de toda execução — inclusive das
 *      incrementais —, que é o que impede o diário de dizer "ok" com
 *      pasta faltando.
 *
 * Custa uma requisição por 200 itens. Com ~100 pastas, é uma.
 *
 * Só o primeiro nível, de propósito: pasta de orçamento é filha direta
 * da pasta do ano, e não descer poupa as centenas de arquivos e
 * subpastas de trabalho que o delta é obrigado a trazer.
 */
export async function lerFilhos(): Promise<{ itens: ItemDrive[]; requisicoes: number }> {
  const c = exigirCredenciais();
  const itens: ItemDrive[] = [];
  let requisicoes = 0;

  let proxima: string | null = `${caminhoDaPasta(c)}/children?$top=200`;
  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    const resposta: RespostaDelta = await graphFetch<RespostaDelta>(proxima);
    requisicoes += 1;
    if (Array.isArray(resposta.value)) itens.push(...resposta.value);
    proxima = resposta["@odata.nextLink"] ?? null;
  }

  return { itens, requisicoes };
}

export async function lerDelta(deltaLinkAnterior: string | null): Promise<ResultadoDelta> {
  const c = exigirCredenciais();
  const itens: ItemDrive[] = [];
  let requisicoes = 0;

  // $top=200 evita que a varredura inicial de ~100 pastas vire meia
  // dúzia de requisições.
  let proxima: string | null =
    deltaLinkAnterior && deltaLinkAnterior.startsWith("http")
      ? deltaLinkAnterior
      : `${caminhoDaPasta(c)}/delta?$top=200`;
  let deltaLink: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS && proxima; pagina++) {
    // A anotação não é redundante: sem ela o tipo de `resposta` depende
    // de `proxima`, que é reatribuído a partir de `resposta` — e o
    // compilador desiste no meio do círculo, entregando `any`.
    const resposta: RespostaDelta = await graphFetch<RespostaDelta>(proxima);
    requisicoes += 1;
    if (Array.isArray(resposta.value)) itens.push(...resposta.value);
    deltaLink = resposta["@odata.deltaLink"] ?? null;
    proxima = resposta["@odata.nextLink"] ?? null;
  }

  return { itens, deltaLink, requisicoes };
}
