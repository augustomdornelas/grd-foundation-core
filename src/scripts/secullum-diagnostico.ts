// ============================================================
// Diagnóstico da integração Secullum — FERRAMENTA, NÃO É O APP
// ------------------------------------------------------------
// Roda por linha de comando, uma vez, para descobrir o que a conta da
// GRD realmente tem: qual é o id do banco, qual valor o header
// `secullumidbancoselecionado` aceita, qual plano está contratado e
// quais endpoints já respondem.
//
// NÃO importe este arquivo de nenhuma rota. Ele não vai para o bundle,
// não vai para produção e não guarda estado: sem cache, sem arquivo de
// saída, sem log em disco. Tudo que ele descobre sai no terminal e
// morre ali.
//
// As credenciais vêm SÓ de variável de ambiente. Não há leitura de
// .env aqui de propósito: o .env deste repositório está versionado e o
// repositório é público — senha colocada lá vira commit.
//
// Como rodar está no rodapé deste arquivo e no fim da saída do script.
// ============================================================

import { DEFAULT_MIN_VERSION } from "node:tls";

// ------------------------------------------------------------
// Constantes da API (levantamento de 27/08/2026)
// ------------------------------------------------------------
const AUTENTICADOR = "https://autenticador.secullum.com.br";
const INTEGRACAO = "https://pontowebintegracaoexterna.secullum.com.br";

/** Fixo: é o que identifica o produto Secullum RH no autenticador. */
const CLIENT_ID = "3";

const TIMEOUT_MS = 20_000;

// ------------------------------------------------------------
// Saída no terminal
// ------------------------------------------------------------
const cor = {
  reset: "[0m",
  negrito: "[1m",
  cinza: "[90m",
  vermelho: "[31m",
  verde: "[32m",
  amarelo: "[33m",
  azul: "[36m",
};

function titulo(texto: string): void {
  console.log(`\n${cor.negrito}${cor.azul}${texto}${cor.reset}`);
  console.log(cor.cinza + "-".repeat(texto.length) + cor.reset);
}

function ok(texto: string): void {
  console.log(`${cor.verde}  OK${cor.reset}  ${texto}`);
}

function aviso(texto: string): void {
  console.log(`${cor.amarelo}  !${cor.reset}   ${texto}`);
}

function falha(texto: string): void {
  console.log(`${cor.vermelho}  X${cor.reset}   ${texto}`);
}

function info(texto: string): void {
  console.log(`      ${cor.cinza}${texto}${cor.reset}`);
}

/** Token só aparece pelos 6 primeiros caracteres. Senha, nunca. */
function mascarar(token: string): string {
  return token.length <= 6 ? "..." : `${token.slice(0, 6)}...`;
}

/** Recorta corpo grande para o terminal não virar um muro de texto. */
function recortar(texto: string, limite = 1200): string {
  if (texto.length <= limite) return texto;
  return `${texto.slice(0, limite)}\n      ${cor.cinza}[... mais ${texto.length - limite} caracteres]${cor.reset}`;
}

// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------
type Resposta = {
  status: number;
  ok: boolean;
  corpo: string;
  json: unknown;
  erro?: string;
};

/**
 * Uma requisição, com timeout e erro legível.
 *
 * Nunca lança: devolve `erro` preenchido. Um diagnóstico que morre com
 * stack trace na primeira falha de rede não diagnostica nada — a graça
 * é justamente ver quais chamadas passam e quais não.
 */
async function requisitar(
  url: string,
  opcoes: { metodo?: string; headers?: Record<string, string>; corpo?: string } = {},
): Promise<Resposta> {
  try {
    const resposta = await fetch(url, {
      method: opcoes.metodo ?? "GET",
      headers: opcoes.headers,
      body: opcoes.corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const corpo = await resposta.text();
    let json: unknown = undefined;
    try {
      json = corpo ? JSON.parse(corpo) : undefined;
    } catch {
      // corpo não-JSON é informação: costuma ser HTML de erro do servidor
    }
    return { status: resposta.status, ok: resposta.ok, corpo, json };
  } catch (e) {
    return { status: 0, ok: false, corpo: "", json: undefined, erro: descreverErro(e) };
  }
}

function descreverErro(e: unknown): string {
  if (e instanceof DOMException && e.name === "TimeoutError") {
    return `a Secullum não respondeu em ${TIMEOUT_MS / 1000}s`;
  }
  if (e instanceof Error) {
    const causa = (e as { cause?: { code?: string } }).cause;
    if (causa?.code === "ENOTFOUND") return "domínio não encontrado (DNS) — confira a conexão";
    if (causa?.code === "ECONNREFUSED") return "conexão recusada pelo servidor";
    if (causa?.code === "CERT_HAS_EXPIRED") return "certificado do servidor expirado";
    if (causa?.code) return `${e.message} (${causa.code})`;
    return e.message;
  }
  return String(e);
}

// ------------------------------------------------------------
// Tipos das respostas (só o que é usado)
// ------------------------------------------------------------
type Banco = {
  id?: number | string;
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
  servidor?: string;
};

// ------------------------------------------------------------
// 1) Credenciais
// ------------------------------------------------------------
function lerCredenciais(): { email: string; senha: string } {
  const email = process.env.SECULLUM_EMAIL?.trim();
  const senha = process.env.SECULLUM_SENHA;

  if (!email || !senha) {
    console.log(`\n${cor.vermelho}${cor.negrito}Faltam credenciais.${cor.reset}\n`);
    console.log("Este script lê SECULLUM_EMAIL e SECULLUM_SENHA do ambiente, e só de lá.");
    console.log("Não coloque em arquivo: o .env deste repositório está versionado e o");
    console.log("repositório é público.\n");
    console.log(`${cor.negrito}PowerShell (Windows):${cor.reset}`);
    console.log('  $env:SECULLUM_EMAIL = "usuario@grupogrdbrasil.com"');
    console.log('  $env:SECULLUM_SENHA = "a-senha"');
    console.log("  node src/scripts/secullum-diagnostico.ts\n");
    console.log(`${cor.negrito}bash / Git Bash:${cor.reset}`);
    console.log('  export SECULLUM_EMAIL="usuario@grupogrdbrasil.com"');
    console.log('  export SECULLUM_SENHA="a-senha"');
    console.log("  node src/scripts/secullum-diagnostico.ts\n");
    console.log(`${cor.cinza}Dica: no bash, um espaço antes de export mantém a linha fora`);
    console.log(`do histórico do shell, se HISTCONTROL=ignorespace estiver ligado.${cor.reset}\n`);
    console.log(
      `${cor.cinza}Faltando: ${!email ? "SECULLUM_EMAIL " : ""}${!senha ? "SECULLUM_SENHA" : ""}${cor.reset}`,
    );
    process.exit(1);
  }

  return { email, senha };
}

// ------------------------------------------------------------
// 2) Token
// ------------------------------------------------------------
async function obterToken(email: string, senha: string): Promise<string> {
  titulo("2. Autenticação");
  info(`POST ${AUTENTICADOR}/Token`);
  info(`usuário: ${email}   ·   senha: (não exibida)`);

  // URLSearchParams cuida do escape: senha com & ou = não quebra o corpo.
  const corpo = new URLSearchParams({
    grant_type: "password",
    username: email,
    password: senha,
    client_id: CLIENT_ID,
  }).toString();

  const r = await requisitar(`${AUTENTICADOR}/Token`, {
    metodo: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    corpo,
  });

  if (r.erro) {
    falha(`não foi possível falar com o autenticador: ${r.erro}`);
    process.exit(1);
  }

  if (!r.ok) {
    falha(`o autenticador recusou (HTTP ${r.status})`);
    if (r.status === 400) {
      info("400 aqui costuma ser usuário ou senha errados, ou client_id que não bate.");
    }
    // O corpo do erro não traz a senha — é seguro mostrar, e é onde a
    // Secullum explica o motivo.
    if (r.corpo) info(recortar(r.corpo, 400));
    process.exit(1);
  }

  const token = (r.json as { access_token?: string } | undefined)?.access_token;
  if (!token) {
    falha("resposta 200, mas sem access_token — formato inesperado");
    info(recortar(r.corpo, 400));
    process.exit(1);
  }

  ok(`token obtido: ${mascarar(token)}`);
  const expira = (r.json as { expires_in?: number }).expires_in;
  if (expira) info(`expira em ${expira}s (${Math.round(expira / 3600)}h)`);
  return token;
}

// ------------------------------------------------------------
// 3) Bancos
// ------------------------------------------------------------
async function listarBancos(token: string): Promise<Banco[]> {
  titulo("3. Bancos da conta");
  const url = `${AUTENTICADOR}/ContasSecullumExterno/ListarBancos`;
  info(`GET ${url}`);

  const r = await requisitar(url, { headers: { Authorization: `Bearer ${token}` } });

  if (r.erro) {
    falha(`falha de rede: ${r.erro}`);
    process.exit(1);
  }
  if (!r.ok) {
    falha(`HTTP ${r.status}`);
    if (r.corpo) info(recortar(r.corpo, 600));
    process.exit(1);
  }

  const bancos = Array.isArray(r.json) ? (r.json as Banco[]) : [];
  if (bancos.length === 0) {
    falha("nenhum banco devolvido — a conta pode não ter Ponto Web habilitado");
    info(recortar(r.corpo, 600));
    process.exit(1);
  }

  ok(`${bancos.length} banco(s)`);
  bancos.forEach((b, i) => {
    console.log(`\n  ${cor.negrito}[${i}] ${b.nome ?? "(sem nome)"}${cor.reset}`);
    const linhas: [string, unknown][] = [
      ["id", b.id],
      ["identificador", b.identificador],
      ["razaoSocial", b.razaoSocial],
      ["documento", b.documento],
      ["plano", b.plano],
      ["limitePessoas", b.limitePessoas],
      ["quantidadePessoas", b.quantidadePessoas],
      ["quantidadeEquipamentos", b.quantidadeEquipamentos],
      ["validade", b.validade],
      ["modoTeste", b.modoTeste],
      ["servidor", b.servidor],
    ];
    for (const [rotulo, valor] of linhas) {
      const texto = valor === undefined || valor === null || valor === "" ? "—" : String(valor);
      console.log(`      ${rotulo.padEnd(24)}${texto}`);
    }
  });

  return bancos;
}

// ------------------------------------------------------------
// 4) Qual valor o header aceita
// ------------------------------------------------------------
/** O manual avisa: o identificador vai sem hífen nem pontuação. */
function limparIdentificador(valor: string): string {
  return valor.replace(/[^a-zA-Z0-9]/g, "");
}

async function descobrirIdDoBanco(
  token: string,
  banco: Banco,
): Promise<{ valor: string; origem: string } | null> {
  titulo("4. Qual valor o header secullumidbancoselecionado aceita");

  const candidatos: { valor: string; origem: string }[] = [];
  if (banco.id !== undefined && banco.id !== null) {
    candidatos.push({ valor: String(banco.id), origem: "id numérico" });
  }
  if (banco.identificador) {
    const limpo = limparIdentificador(banco.identificador);
    if (limpo) candidatos.push({ valor: limpo, origem: "identificador sem hífens" });
  }

  if (candidatos.length === 0) {
    falha("o banco não trouxe nem id nem identificador — nada a testar");
    return null;
  }

  for (const candidato of candidatos) {
    info(`tentando com ${candidato.origem}: ${candidato.valor}`);
    const r = await chamar(token, candidato.valor, "/IntegracaoExterna/Departamentos");

    if (r.erro) {
      falha(`  falha de rede: ${r.erro}`);
      continue;
    }
    if (r.ok) {
      ok(`funcionou com o ${candidato.origem} — HTTP ${r.status}`);
      return candidato;
    }
    if (r.status === 401) {
      aviso(`  HTTP 401 com o ${candidato.origem}; tentando o próximo`);
    } else {
      aviso(`  HTTP ${r.status} com o ${candidato.origem}`);
      if (r.corpo) info(recortar(r.corpo, 300));
    }
  }

  falha("nenhum dos dois valores foi aceito");
  info("Costuma ser um destes três, nesta ordem de probabilidade:");
  info("  1. a integração não está habilitada em Manutenção > Integração com Sistemas");
  info("  2. o plano não é PRO ou superior");
  info("  3. o usuário autenticado não tem permissão de integração");
  return null;
}

async function chamar(token: string, idBanco: string, caminho: string): Promise<Resposta> {
  return requisitar(`${INTEGRACAO}${caminho}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      secullumidbancoselecionado: idBanco,
      Accept: "application/json",
    },
  });
}

// ------------------------------------------------------------
// 5) Os endpoints
// ------------------------------------------------------------
type ResultadoEndpoint = {
  caminho: string;
  status: number;
  registros: number | null;
  bloqueadoLgpd: boolean;
  erro?: string;
};

const ENDPOINTS = [
  "/IntegracaoExterna/Departamentos",
  "/IntegracaoExterna/Empresas",
  "/IntegracaoExterna/Horarios",
  "/IntegracaoExterna/Funcoes",
  "/IntegracaoExterna/Funcionarios",
] as const;

/** Lê um campo aceitando variação de caixa: a API mistura Numero e numero. */
function campo(obj: unknown, ...nomes: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const registro = obj as Record<string, unknown>;
  for (const nome of nomes) {
    if (nome in registro) return registro[nome];
    const achado = Object.keys(registro).find((k) => k.toLowerCase() === nome.toLowerCase());
    if (achado) return registro[achado];
  }
  return undefined;
}

function texto(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/** (A) Horários: só Numero, Descricao e Desativar. */
function imprimirHorarios(json: unknown): void {
  if (!Array.isArray(json)) return;
  console.log(
    `      ${cor.cinza}${"Numero".padEnd(10)}${"Desativar".padEnd(12)}Descricao${cor.reset}`,
  );
  for (const h of json) {
    const numero = texto(campo(h, "Numero", "numero"));
    const desativar = texto(campo(h, "Desativar", "desativar"));
    const descricao = texto(campo(h, "Descricao", "descricao"));
    console.log(`      ${numero.padEnd(10)}${desativar.padEnd(12)}${descricao}`);
  }
}

/** Catálogo curto (Departamentos, Funcoes, Empresas): id + nome. */
function imprimirCatalogo(json: unknown[]): void {
  for (const item of json) {
    const id = texto(campo(item, "Id", "id", "Numero", "numero"));
    const nome = texto(
      campo(item, "Descricao", "descricao", "Nome", "nome", "RazaoSocial", "razaoSocial"),
    );
    const doc = campo(item, "Documento", "documento", "Cnpj", "cnpj");
    console.log(
      `      ${id.padEnd(8)}${nome}${doc ? `  ${cor.cinza}${String(doc)}${cor.reset}` : ""}`,
    );
  }
}

/**
 * (B) Conciliação por CPF.
 *
 * O script não tem sessão autenticada no Supabase, e `funcionarios`
 * está fechada para anônimo — então ele não consegue ler o lado do
 * Portal sozinho. Em vez de pedir uma service_role só para isso, ele
 * imprime um SQL pronto para colar no SQL Editor, com os CPFs já
 * normalizados. A conta sai no banco, que é onde o dado está.
 */
function imprimirConciliacao(json: unknown): void {
  if (!Array.isArray(json)) return;

  const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const ativos: string[] = [];
  let demitidos = 0;
  let semCpf = 0;

  for (const f of json) {
    const demissao = campo(f, "Demissao", "demissao");
    if (demissao !== null && demissao !== undefined && demissao !== "") {
      demitidos += 1;
      continue;
    }
    const cpf = soDigitos(campo(f, "Cpf", "cpf"));
    if (cpf.length !== 11) {
      semCpf += 1;
      continue;
    }
    ativos.push(cpf);
  }

  const unicos = [...new Set(ativos)];
  console.log(`      ${cor.negrito}total na Secullum:${cor.reset} ${json.length}`);
  console.log(`      ${cor.negrito}com demissão:${cor.reset}      ${demitidos}`);
  console.log(
    `      ${cor.negrito}ATIVOS:${cor.reset}            ${unicos.length}` +
      (semCpf ? `  ${cor.amarelo}(+${semCpf} ativo(s) sem CPF válido)${cor.reset}` : ""),
  );
  if (unicos.length !== ativos.length) {
    aviso(`${ativos.length - unicos.length} CPF(s) repetido(s) entre os ativos`);
  }

  console.log(
    `\n      ${cor.cinza}Cole no SQL Editor do Supabase para fechar a conciliação:${cor.reset}\n`,
  );
  console.log("WITH secullum(cpf) AS (VALUES");
  console.log(unicos.map((c) => `  ('${c}')`).join(",\n"));
  console.log("),");
  console.log("portal AS (");
  console.log("  SELECT regexp_replace(cpf, '[^0-9]', '', 'g') AS cpf, nome, ativo");
  console.log("    FROM public.funcionarios");
  console.log("   WHERE cpf <> ''");
  console.log(")");
  console.log("SELECT");
  console.log(
    "  (SELECT count(*) FROM secullum)                                    AS ativos_secullum,",
  );
  console.log(
    "  (SELECT count(*) FROM portal)                                      AS com_cpf_no_portal,",
  );
  console.log("  (SELECT count(*) FROM secullum s JOIN portal p ON p.cpf = s.cpf)   AS em_ambos,");
  console.log("  (SELECT count(*) FROM secullum s WHERE NOT EXISTS");
  console.log(
    "     (SELECT 1 FROM portal p WHERE p.cpf = s.cpf))                   AS so_na_secullum,",
  );
  console.log("  (SELECT count(*) FROM portal p WHERE NOT EXISTS");
  console.log(
    "     (SELECT 1 FROM secullum s WHERE s.cpf = p.cpf))                 AS so_no_portal;",
  );
  console.log(
    `\n      ${cor.cinza}E para ver quem está só de um lado, troque o SELECT final por:${cor.reset}`,
  );
  console.log("--  SELECT p.nome, p.cpf FROM portal p WHERE NOT EXISTS");
  console.log("--    (SELECT 1 FROM secullum s WHERE s.cpf = p.cpf) ORDER BY p.nome;");
}

async function testarEndpoints(token: string, idBanco: string): Promise<ResultadoEndpoint[]> {
  titulo("5. Endpoints de integração");
  const resultados: ResultadoEndpoint[] = [];

  for (const caminho of ENDPOINTS) {
    const ehFuncionarios = caminho.endsWith("/Funcionarios");
    console.log(`\n  ${cor.negrito}GET ${caminho}${cor.reset}`);

    const r = await chamar(token, idBanco, caminho);

    if (r.erro) {
      falha(`falha de rede: ${r.erro}`);
      resultados.push({ caminho, status: 0, registros: null, bloqueadoLgpd: false, erro: r.erro });
      continue;
    }

    const registros = Array.isArray(r.json) ? r.json.length : null;

    if (r.ok) {
      ok(`HTTP ${r.status}${registros !== null ? ` · ${registros} registro(s)` : ""}`);
      // Cada endpoint tem a sua leitura útil. Despejar o corpo cru só
      // serve para o primeiro contato: Horarios sozinho tem 84 KB, e
      // Funcionarios traz 128 pessoas — nenhum dos dois cabe no
      // terminal nem responde à pergunta que se está fazendo.
      if (caminho.endsWith("/Horarios")) {
        imprimirHorarios(r.json);
      } else if (ehFuncionarios) {
        imprimirConciliacao(r.json);
      } else if (Array.isArray(r.json) && r.json.length <= 30) {
        imprimirCatalogo(r.json);
      } else if (r.corpo) {
        info(recortar(r.corpo));
      }
      resultados.push({ caminho, status: r.status, registros, bloqueadoLgpd: false });
      continue;
    }

    // 401/403 em /Funcionarios é esperado e NÃO é falha deste script.
    const bloqueadoLgpd = ehFuncionarios && (r.status === 401 || r.status === 403);
    if (bloqueadoLgpd) {
      aviso(`HTTP ${r.status} — esperado: é o bloqueio de LGPD, não um erro do script`);
      info("Dados de funcionário só saem depois que o administrador libera o acesso");
      info("no painel do Ponto Web. Enquanto não liberar, este endpoint responde 401/403");
      info("mesmo com token e id de banco corretos.");
    } else {
      falha(`HTTP ${r.status}`);
    }
    if (r.corpo) info(recortar(r.corpo, 500));
    resultados.push({ caminho, status: r.status, registros: null, bloqueadoLgpd });
  }

  return resultados;
}

// ------------------------------------------------------------
// 6) Resumo
// ------------------------------------------------------------
function resumir(
  banco: Banco,
  idAceito: { valor: string; origem: string } | null,
  resultados: ResultadoEndpoint[],
): void {
  titulo("6. Resumo");

  const achar = (fim: string) => resultados.find((r) => r.caminho.endsWith(fim));
  const contagem = (fim: string) => {
    const r = achar(fim);
    if (!r) return "não testado";
    if (r.erro) return "erro de rede";
    if (r.status === 200) return `${r.registros ?? "?"}`;
    return `HTTP ${r.status}`;
  };

  const funcionarios = achar("/Funcionarios");
  const situacaoFuncionarios = !funcionarios
    ? "não testado"
    : funcionarios.status === 200
      ? `liberado (${funcionarios.registros ?? "?"} registros)`
      : funcionarios.bloqueadoLgpd
        ? `bloqueado por LGPD (HTTP ${funcionarios.status})`
        : `erro HTTP ${funcionarios.status}`;

  console.log(
    `  1. secullumidbancoselecionado: ${
      idAceito
        ? `${cor.verde}${idAceito.valor}${cor.reset}  (${idAceito.origem})`
        : `${cor.vermelho}nenhum valor aceito${cor.reset}`
    }`,
  );
  console.log(
    `  2. plano: ${banco.plano ?? "—"}  ·  limite de pessoas: ${banco.limitePessoas ?? "—"}` +
      `  ·  em uso: ${banco.quantidadePessoas ?? "—"}`,
  );
  console.log(
    `  3. registros: Empresas ${contagem("/Empresas")} · Horarios ${contagem("/Horarios")}` +
      ` · Funcoes ${contagem("/Funcoes")} · Departamentos ${contagem("/Departamentos")}`,
  );
  console.log(`  4. /Funcionarios: ${situacaoFuncionarios}`);

  console.log(`  5. próximo passo:`);
  if (!idAceito) {
    console.log(`     habilitar em Manutenção > Integração com Sistemas e confirmar plano PRO,`);
    console.log(`     depois rodar este script de novo.`);
  } else if (funcionarios?.bloqueadoLgpd) {
    console.log(`     pedir ao administrador do Ponto Web a liberação de LGPD para o usuário`);
    console.log(
      `     ${cor.cinza}${process.env.SECULLUM_EMAIL ?? ""}${cor.reset}, e rodar este script de novo.`,
    );
  } else {
    console.log(`     tudo respondendo. Me traga esta saída (sem o token) e eu construo o`);
    console.log(`     mapeamento de campos em cima do JSON real, sem inventar schema.`);
  }
}

// ------------------------------------------------------------
// Execução
// ------------------------------------------------------------
async function principal(): Promise<void> {
  console.log(`\n${cor.negrito}Diagnóstico da integração Secullum${cor.reset}`);
  console.log(`${cor.cinza}Ferramenta de investigação. Não escreve nada em disco.${cor.reset}`);

  titulo("1. Ambiente");
  // A Secullum exige TLS 1.2 no mínimo. O Node já usa isso por padrão
  // desde a versão 12; conferir é barato e evita passar meia hora
  // procurando erro de rede que na verdade é handshake recusado.
  info(`Node ${process.version}  ·  TLS mínimo: ${DEFAULT_MIN_VERSION}`);
  if (DEFAULT_MIN_VERSION === "TLSv1" || DEFAULT_MIN_VERSION === "TLSv1.1") {
    aviso("TLS mínimo abaixo de 1.2 — a Secullum recusa. Atualize o Node.");
  } else {
    ok("TLS 1.2 ou superior");
  }

  const { email, senha } = lerCredenciais();
  ok("credenciais lidas do ambiente");

  const token = await obterToken(email, senha);
  const bancos = await listarBancos(token);

  const banco = bancos[0];
  info(`\n  usando o primeiro banco: ${banco.nome ?? banco.id ?? "(sem nome)"}`);

  const idAceito = await descobrirIdDoBanco(token, banco);

  let resultados: ResultadoEndpoint[] = [];
  if (idAceito) {
    resultados = await testarEndpoints(token, idAceito.valor);
  } else {
    aviso("pulando os endpoints: sem um id de banco aceito não há o que testar");
  }

  resumir(banco, idAceito, resultados);

  console.log(
    `\n${cor.cinza}Nada foi gravado em disco. O token existiu só na memória deste processo.${cor.reset}\n`,
  );
}

principal().catch((e: unknown) => {
  console.log(`\n${cor.vermelho}Erro inesperado:${cor.reset} ${descreverErro(e)}\n`);
  process.exit(1);
});

// ============================================================
// COMO RODAR
// ------------------------------------------------------------
// PowerShell (Windows):
//   $env:SECULLUM_EMAIL = "usuario@grupogrdbrasil.com"
//   $env:SECULLUM_SENHA = "a-senha"
//   node src/scripts/secullum-diagnostico.ts
//
// bash / Git Bash:
//   export SECULLUM_EMAIL="usuario@grupogrdbrasil.com"
//   export SECULLUM_SENHA="a-senha"
//   node src/scripts/secullum-diagnostico.ts
//
// Para limpar a senha do ambiente depois:
//   PowerShell:  Remove-Item Env:SECULLUM_SENHA
//   bash:        unset SECULLUM_SENHA
// ============================================================
