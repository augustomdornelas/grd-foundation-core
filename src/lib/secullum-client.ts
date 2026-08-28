// ============================================================
// Cliente da API de Integração Externa da Secullum — SÓ SERVIDOR
// ------------------------------------------------------------
// Nenhuma chamada à Secullum sai do navegador. O front fala com as
// server functions em secullum-server.ts; elas falam com este arquivo;
// este arquivo fala com a Secullum. Token e senha nunca chegam ao
// cliente.
//
// Três coisas que este cliente resolve de uma vez, para não serem
// repetidas em cada chamada:
//
//   1. O header `secullumidbancoselecionado`. Ele é exigido nos 67
//      endpoints e é o motivo mais comum de 401 com token válido.
//      Está centralizado aqui: nenhuma chamada pode esquecê-lo.
//   2. O token, com renovação. Pedir token a cada requisição
//      funcionaria e seria desperdício; deixá-lo vencer em silêncio
//      dá 401 no meio de uma admissão.
//   3. Retry só onde faz sentido: 5xx e falha de rede, com espera
//      crescente. Em 4xx NÃO há retry — repetir uma requisição que o
//      servidor recusou por conteúdo só multiplica o erro, e em POST
//      poderia duplicar cadastro.
// ============================================================

import { formatarCpf, soDigitos } from "@/lib/documento";

// Guarda de segurança: se este módulo algum dia for importado por
// código de tela, a falha precisa ser barulhenta e imediata, e não um
// vazamento silencioso de credencial para o bundle.
if (typeof window !== "undefined") {
  throw new Error(
    "secullum-client.ts é código de servidor e foi importado no navegador. " +
      "Use as server functions de secullum-server.ts.",
  );
}

const AUTENTICADOR = "https://autenticador.secullum.com.br";
const INTEGRACAO = "https://pontowebintegracaoexterna.secullum.com.br";

/** Fixo: identifica o produto Secullum RH no autenticador. */
const CLIENT_ID = "3";

/**
 * Id do banco da GRD, confirmado pelo diagnóstico de 27/08/2026: o que
 * a API aceita é o id NUMÉRICO, não o identificador com hífens.
 * Continua sobrescritível por ambiente para o dia em que existir uma
 * base de homologação.
 */
const ID_BANCO_PADRAO = "108942";

const TIMEOUT_MS = 20_000;
const TENTATIVAS = 3;

// ------------------------------------------------------------
// Erro
// ------------------------------------------------------------
export class SecullumErro extends Error {
  readonly status: number;
  readonly corpo: string;
  readonly ehLgpd: boolean;

  constructor(mensagem: string, status = 0, corpo = "") {
    super(mensagem);
    this.name = "SecullumErro";
    this.status = status;
    this.corpo = corpo;
    // 401/403 em dados de pessoa é o bloqueio de LGPD do Ponto Web, e
    // não credencial errada. Distinguir importa: um se resolve no
    // painel da Secullum, o outro no .env do servidor.
    this.ehLgpd = status === 401 || status === 403;
  }
}

function mensagemDeRede(e: unknown): string {
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return `a Secullum não respondeu em ${TIMEOUT_MS / 1000}s`;
  }
  if (e instanceof Error) {
    const causa = (e as { cause?: { code?: string } }).cause;
    if (causa?.code === "ENOTFOUND") return "não foi possível resolver o endereço da Secullum";
    if (causa?.code === "ECONNREFUSED") return "a Secullum recusou a conexão";
    return e.message;
  }
  return String(e);
}

// ------------------------------------------------------------
// Configuração vinda do ambiente
// ------------------------------------------------------------
export type ConfigSecullum = { email: string; senha: string; idBanco: string };

export function lerConfig(): ConfigSecullum | null {
  const email = process.env.SECULLUM_EMAIL?.trim();
  const senha = process.env.SECULLUM_SENHA;
  if (!email || !senha) return null;
  return {
    email,
    senha,
    idBanco: process.env.SECULLUM_ID_BANCO?.trim() || ID_BANCO_PADRAO,
  };
}

export function configuracaoFaltando(): string {
  const faltam: string[] = [];
  if (!process.env.SECULLUM_EMAIL) faltam.push("SECULLUM_EMAIL");
  if (!process.env.SECULLUM_SENHA) faltam.push("SECULLUM_SENHA");
  return faltam.join(" e ");
}

// ------------------------------------------------------------
// Token, com cache e renovação
// ------------------------------------------------------------
type TokenCache = { valor: string; expiraEm: number };

let cache: TokenCache | null = null;
/** Renovação em voo. Sem isto, dez chamadas simultâneas pedem dez tokens. */
let renovacaoEmCurso: Promise<string> | null = null;

/** Margem de 60s: token que vence no caminho da requisição é 401 na cara do usuário. */
const MARGEM_MS = 60_000;

async function obterToken(config: ConfigSecullum): Promise<string> {
  if (cache && Date.now() < cache.expiraEm - MARGEM_MS) return cache.valor;
  if (renovacaoEmCurso) return renovacaoEmCurso;

  renovacaoEmCurso = (async () => {
    const corpo = new URLSearchParams({
      grant_type: "password",
      username: config.email,
      password: config.senha,
      client_id: CLIENT_ID,
    }).toString();

    let resposta: Response;
    try {
      resposta = await fetch(`${AUTENTICADOR}/Token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: corpo,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new SecullumErro(`Falha ao autenticar na Secullum: ${mensagemDeRede(e)}`);
    }

    const texto = await resposta.text();
    if (!resposta.ok) {
      // O corpo do erro não contém a senha; é seguro repassar e é onde
      // a Secullum diz o motivo real.
      throw new SecullumErro(
        resposta.status === 400
          ? "A Secullum recusou as credenciais (usuário, senha ou client_id)."
          : `A Secullum recusou a autenticação (HTTP ${resposta.status}).`,
        resposta.status,
        texto.slice(0, 500),
      );
    }

    let dados: { access_token?: string; expires_in?: number };
    try {
      dados = JSON.parse(texto) as typeof dados;
    } catch {
      throw new SecullumErro("A Secullum devolveu uma resposta de token ilegível.", 200);
    }
    if (!dados.access_token) {
      throw new SecullumErro("A Secullum respondeu sem access_token.", 200);
    }

    // Sem expires_in, assume 30 min — curto o bastante para não confiar
    // demais num valor que não veio.
    const duracao = (dados.expires_in ?? 1800) * 1000;
    cache = { valor: dados.access_token, expiraEm: Date.now() + duracao };
    return dados.access_token;
  })();

  try {
    return await renovacaoEmCurso;
  } finally {
    renovacaoEmCurso = null;
  }
}

/** Descarta o token guardado. Usado quando a API devolve 401 mesmo com cache. */
export function invalidarToken(): void {
  cache = null;
}

// ------------------------------------------------------------
// A requisição
// ------------------------------------------------------------
function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requisitar<T>(
  config: ConfigSecullum,
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown } = {},
): Promise<T> {
  let ultimoErro: SecullumErro | null = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const token = await obterToken(config);

    let resposta: Response;
    try {
      resposta = await fetch(`${INTEGRACAO}${caminho}`, {
        method: opcoes.metodo ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          secullumidbancoselecionado: config.idBanco,
          Accept: "application/json",
          ...(opcoes.corpo !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opcoes.corpo !== undefined ? JSON.stringify(opcoes.corpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      ultimoErro = new SecullumErro(mensagemDeRede(e));
      if (tentativa < TENTATIVAS) {
        await esperar(500 * 2 ** (tentativa - 1));
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
        throw new SecullumErro(
          `Resposta ilegível de ${caminho}.`,
          resposta.status,
          texto.slice(0, 300),
        );
      }
    }

    const texto = await resposta.text();

    // 401 na primeira tentativa pode ser token vencido antes da margem;
    // vale uma segunda com token novo. Na segunda, é permissão mesmo.
    if (resposta.status === 401 && tentativa === 1) {
      invalidarToken();
      continue;
    }

    // 4xx não se repete: o servidor recusou o conteúdo, e insistir num
    // POST duplicaria cadastro.
    if (resposta.status < 500) {
      throw new SecullumErro(
        descreverStatus(resposta.status, caminho),
        resposta.status,
        texto.slice(0, 500),
      );
    }

    ultimoErro = new SecullumErro(
      `A Secullum respondeu HTTP ${resposta.status} em ${caminho}.`,
      resposta.status,
      texto.slice(0, 500),
    );
    if (tentativa < TENTATIVAS) {
      await esperar(500 * 2 ** (tentativa - 1));
      continue;
    }
    throw ultimoErro;
  }

  throw ultimoErro ?? new SecullumErro(`Falha desconhecida em ${caminho}.`);
}

function descreverStatus(status: number, caminho: string): string {
  if (status === 401 || status === 403) {
    return caminho.includes("Funcionarios")
      ? "A Secullum bloqueou o acesso a dados de funcionário (LGPD). O administrador precisa liberar o usuário da integração no painel do Ponto Web."
      : "A Secullum recusou o acesso. Confira se a integração está habilitada em Manutenção > Integração com Sistemas.";
  }
  if (status === 404) return `Endpoint não encontrado na Secullum: ${caminho}.`;
  if (status === 429)
    return "A Secullum recusou por excesso de requisições. Tente de novo em instantes.";
  return `A Secullum recusou a requisição (HTTP ${status}) em ${caminho}.`;
}

// ------------------------------------------------------------
// Tipos do que a API devolve (só o que é usado)
// ------------------------------------------------------------
export type BancoSecullum = {
  id: number;
  identificador?: string;
  nome?: string;
  razaoSocial?: string;
  documento?: string;
  plano?: string | number;
  limitePessoas?: number;
  quantidadePessoas?: number;
  quantidadeEquipamentos?: number;
  validade?: string;
  modoTeste?: boolean;
};

export type DepartamentoSecullum = { Id?: number; Descricao?: string };
export type FuncaoSecullum = { Id?: number; Descricao?: string };
export type EmpresaSecullum = { Id?: number; Descricao?: string; Documento?: string };
export type HorarioSecullum = { Numero?: number; Descricao?: string; Desativar?: boolean };

/**
 * O que /Funcionarios devolve. Os campos estão TODOS opcionais de
 * propósito: o payload traz 392 KB e mais de trinta chaves por pessoa,
 * e a Secullum não publica contrato campo a campo.
 *
 * Os pares `...Id` e `...Descricao` convivem porque o endpoint entrega
 * ora um, ora outro, conforme a conta. Quem lê usa `campo()` de
 * secullum-formato.ts e resolve o id contra /Departamentos e /Funcoes
 * quando só o id vier — nunca assume qual dos dois chegou.
 */
export type FuncionarioSecullum = {
  Id?: number;
  Nome?: string;
  Cpf?: string;
  NumeroFolha?: string;
  NumeroPis?: string;
  Demissao?: string | null;
  Admissao?: string | null;
  DepartamentoId?: number;
  DepartamentoDescricao?: string;
  FuncaoId?: number;
  FuncaoDescricao?: string;
  EmpresaId?: number;
  HorarioId?: number;
  HorarioNumero?: number;
  /** Data de nascimento — alimenta a faixa etária da Etapa 2. */
  Nascimento?: string | null;
  Masculino?: boolean;
  EscolaridadeId?: number;
};

// ------------------------------------------------------------
// As chamadas
// ------------------------------------------------------------
export const secullum = {
  async listarBancos(config: ConfigSecullum): Promise<BancoSecullum[]> {
    const token = await obterToken(config);
    let resposta: Response;
    try {
      resposta = await fetch(`${AUTENTICADOR}/ContasSecullumExterno/ListarBancos`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new SecullumErro(`Falha ao listar bancos: ${mensagemDeRede(e)}`);
    }
    const texto = await resposta.text();
    if (!resposta.ok) {
      throw new SecullumErro(
        `A Secullum recusou a lista de bancos (HTTP ${resposta.status}).`,
        resposta.status,
        texto.slice(0, 300),
      );
    }
    return JSON.parse(texto) as BancoSecullum[];
  },

  departamentos: (c: ConfigSecullum) =>
    requisitar<DepartamentoSecullum[]>(c, "/IntegracaoExterna/Departamentos"),

  funcoes: (c: ConfigSecullum) => requisitar<FuncaoSecullum[]>(c, "/IntegracaoExterna/Funcoes"),

  empresas: (c: ConfigSecullum) => requisitar<EmpresaSecullum[]>(c, "/IntegracaoExterna/Empresas"),

  horarios: (c: ConfigSecullum) => requisitar<HorarioSecullum[]>(c, "/IntegracaoExterna/Horarios"),

  funcionarios: (c: ConfigSecullum) =>
    requisitar<FuncionarioSecullum[]>(c, "/IntegracaoExterna/Funcionarios"),

  /**
   * Batidas de um intervalo de datas.
   *
   * FORMATO AINDA NÃO CONFIRMADO: este endpoint nunca foi chamado com
   * a conta da GRD. Os nomes dos parâmetros de consulta abaixo são a
   * aposta mais provável; se a Secullum recusar, o erro vai dizer, e o
   * ajuste é de uma linha. Quem consome (secullum-sync) lê a resposta
   * de forma tolerante justamente por isto.
   */
  batidas: (c: ConfigSecullum, de: string, ate: string) =>
    requisitar<unknown[]>(
      c,
      `/IntegracaoExterna/Batidas?dataInicio=${encodeURIComponent(de)}&dataFim=${encodeURIComponent(ate)}`,
    ),

  /**
   * Totais calculados de UM funcionário em UM mês — os dois limites são
   * da API, não escolha nossa. O CPF vai formatado, como todo documento
   * que trafega com eles.
   *
   * FORMATO AINDA NÃO CONFIRMADO, mesma ressalva de `batidas`.
   */
  calcularSomenteTotais: (c: ConfigSecullum, cpf: string, de: string, ate: string) =>
    requisitar<unknown>(c, "/IntegracaoExterna/Calcular/SomenteTotais", {
      metodo: "POST",
      corpo: { Cpf: formatarCpf(cpf), DataInicio: de, DataFim: ate },
    }),
};

// ------------------------------------------------------------
// Trava de licença
// ------------------------------------------------------------
/**
 * O plano da GRD permite 30 pessoas e há 20 em uso (diagnóstico de
 * 27/08/2026). Estourar o teto faz a Secullum recusar o POST — e o
 * lugar onde isso apareceria é o pior possível: no meio de uma
 * admissão que o RH já deu por concluída.
 *
 * Por isso a checagem acontece ANTES do envio, e o número vem de
 * ListarBancos na hora: `quantidadePessoas` muda quando alguém é
 * cadastrado direto no Ponto Web, sem passar pelo Portal.
 */
export type SituacaoLicenca = {
  limite: number | null;
  emUso: number | null;
  restantes: number | null;
  podeEnviar: boolean;
  perto: boolean;
  mensagem: string;
};

/** Abaixo disso, a tela avisa antes de o problema acontecer. */
const MARGEM_AVISO = 3;

export async function verificarLicenca(config: ConfigSecullum): Promise<SituacaoLicenca> {
  const bancos = await secullum.listarBancos(config);
  const banco = bancos.find((b) => String(b.id) === config.idBanco) ?? bancos[0];

  const limite = banco?.limitePessoas ?? null;
  const emUso = banco?.quantidadePessoas ?? null;

  if (limite === null || emUso === null) {
    return {
      limite,
      emUso,
      restantes: null,
      // Sem o número, não dá para afirmar que estourou — mas também não
      // dá para garantir que cabe. Deixa passar e avisa: bloquear por
      // falta de informação travaria admissão por um dado ausente.
      podeEnviar: true,
      perto: false,
      mensagem:
        "A Secullum não informou o limite de pessoas do plano; envio liberado sem conferência.",
    };
  }

  const restantes = limite - emUso;

  if (restantes <= 0) {
    return {
      limite,
      emUso,
      restantes,
      podeEnviar: false,
      perto: true,
      mensagem:
        `O plano do Ponto Web está no limite: ${emUso} de ${limite} pessoas. ` +
        "Nenhum colaborador novo pode ser enviado até liberar uma vaga (desligando quem saiu) " +
        "ou ampliar o plano com a Secullum.",
    };
  }

  if (restantes <= MARGEM_AVISO) {
    return {
      limite,
      emUso,
      restantes,
      podeEnviar: true,
      perto: true,
      mensagem:
        `Restam ${restantes} ${restantes === 1 ? "vaga" : "vagas"} no plano do Ponto Web ` +
        `(${emUso} de ${limite}). Vale falar com a Secullum antes da próxima leva de admissões.`,
    };
  }

  return {
    limite,
    emUso,
    restantes,
    podeEnviar: true,
    perto: false,
    mensagem: `${emUso} de ${limite} pessoas no plano — ${restantes} vagas livres.`,
  };
}

// ------------------------------------------------------------
// Documento
// ------------------------------------------------------------
/** A Secullum recebe e devolve CPF com máscara. Este é o formato de envio. */
export function cpfParaSecullum(cpf: string | null | undefined): string {
  return formatarCpf(cpf);
}

/** E esta é a chave de comparação, dos dois lados. */
export function chaveDeDocumento(valor: string | null | undefined): string {
  return soDigitos(valor);
}
