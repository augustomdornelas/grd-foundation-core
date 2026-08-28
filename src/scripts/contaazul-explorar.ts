// ============================================================
// Explorador da API da Conta Azul — FERRAMENTA, NÃO É O APP
// ------------------------------------------------------------
// Roda por linha de comando para descobrir o que a conta conectada
// realmente expõe: quais caminhos respondem, como paginam, que campos
// trazem. A documentação lista os contextos mas não fixa os caminhos,
// e modelar tabela em cima de palpite é como se erra de um jeito que
// só aparece semanas depois.
//
// SOMENTE LEITURA. Só GET. Nenhuma chamada deste arquivo altera nada
// do lado da Conta Azul.
//
// NÃO importe este arquivo de nenhuma rota. Ele não vai para o bundle
// e não guarda estado: o que descobre sai no terminal e morre ali.
//
// Como rodar está no rodapé.
// ============================================================

import { readFileSync } from "node:fs";

// ------------------------------------------------------------
// Ambiente
// ------------------------------------------------------------
// O Vite não escreve em process.env (ver o comentário em
// vite.config.ts), e este script roda fora do Vite. Então lê os
// arquivos na mão, na mesma ordem de precedência: .env.local vence
// .env, e o que já está no shell vence os dois.
function carregarEnv(): void {
  for (const arquivo of [".env", ".env.local"]) {
    let conteudo: string;
    try {
      conteudo = readFileSync(arquivo, "utf8");
    } catch {
      continue;
    }
    // O BOM é comparado por código, e não por um caractere literal no
    // regex: um BOM invisível no meio do código é exatamente o tipo de
    // coisa que ninguém enxerga ao revisar. É o mesmo BOM que já
    // atrapalhou a leitura do .env.local uma vez.
    const semBom = conteudo.charCodeAt(0) === 0xfeff ? conteudo.slice(1) : conteudo;
    for (const linha of semBom.split("\n")) {
      const corte = linha.indexOf("=");
      if (corte <= 0 || linha.trimStart().startsWith("#")) continue;
      const chave = linha.slice(0, corte).trim();
      const valor = linha.slice(corte + 1).trim();
      if (process.env[chave] === undefined) process.env[chave] = valor;
    }
  }
}
carregarEnv();

const cor = {
  reset: "[0m",
  negrito: "[1m",
  cinza: "[90m",
  verde: "[32m",
  amarelo: "[33m",
  vermelho: "[31m",
  azul: "[36m",
};

function titulo(texto: string): void {
  console.log(
    `\n${cor.negrito}${cor.azul}${"=".repeat(64)}\n${texto}\n${"=".repeat(64)}${cor.reset}`,
  );
}

/** Recorta um JSON grande para caber no terminal sem virar ruído. */
function amostra(valor: unknown, limite = 2600): string {
  const texto = JSON.stringify(valor, null, 2) ?? String(valor);
  return texto.length > limite
    ? `${texto.slice(0, limite)}\n… (+${texto.length - limite} chars)`
    : texto;
}

// ------------------------------------------------------------
// Sondagem
// ------------------------------------------------------------
type Resultado = {
  caminho: string;
  status: number;
  ok: boolean;
  corpo: unknown;
  erro: string;
};

async function sondar(
  caminho: string,
  query?: Record<string, string | number>,
): Promise<Resultado> {
  const { contaAzulFetch, ContaAzulErro } = await import("@/lib/contaazul-client");
  try {
    const corpo = await contaAzulFetch<unknown>(caminho, { query });
    return { caminho, status: 200, ok: true, corpo, erro: "" };
  } catch (e) {
    if (e instanceof ContaAzulErro) {
      return { caminho, status: e.status, ok: false, corpo: e.corpo, erro: e.message };
    }
    return { caminho, status: 0, ok: false, corpo: null, erro: String(e) };
  }
}

function marcador(status: number): string {
  if (status === 200) return `${cor.verde}200 OK  ${cor.reset}`;
  if (status === 404) return `${cor.cinza}404     ${cor.reset}`;
  if (status === 401 || status === 403) return `${cor.amarelo}${status} !   ${cor.reset}`;
  if (status === 400) return `${cor.amarelo}400     ${cor.reset}`;
  return `${cor.vermelho}${String(status).padEnd(3)}     ${cor.reset}`;
}

// ------------------------------------------------------------
// Os candidatos
// ------------------------------------------------------------
// Duas famílias de nomes, porque não dá para saber de fora qual a API
// usa: a v1 antiga era em inglês, e as mensagens de erro desta são em
// português — o que sugere caminhos em português.
const CANDIDATOS = [
  // raiz e descoberta
  "",
  // pessoas
  "pessoa",
  "pessoas",
  "person",
  "persons",
  "people",
  "customers",
  "clientes",
  "cliente",
  "fornecedores",
  "fornecedor",
  "suppliers",
  // financeiro — inglês
  "financial-events",
  "financial-event",
  "financial-accounts",
  "accounts-receivable",
  "accounts-payable",
  "receivables",
  "payables",
  "installments",
  // financeiro — português
  "financeiro",
  "financeiro/eventos",
  "financeiro/eventos-financeiros",
  "financeiro/contas-a-receber",
  "financeiro/contas-a-pagar",
  "eventos-financeiros",
  "contas-a-receber",
  "contas-a-pagar",
  "contas-receber",
  "contas-pagar",
  "lancamentos",
  "lancamento",
  "parcelas",
  "titulos",
  "conta-financeira",
  "contas-financeiras",
  // apoio
  "categorias",
  "categories",
  "centros-de-custo",
  "cost-centers",
  "vendas",
  "sales",
  "produtos",
  "products",
  "servicos",
  "services",
];

/** Documentação legível por máquina, se existir. Fora do /v1/. */
const DOCS = [
  "https://api-v2.contaazul.com/v3/api-docs",
  "https://api-v2.contaazul.com/openapi.json",
  "https://api-v2.contaazul.com/swagger.json",
  "https://api-v2.contaazul.com/v1/openapi.json",
];

async function procurarDocumentacao(): Promise<void> {
  titulo("0. Documentação legível por máquina (OpenAPI/Swagger)");
  const { obterAccessTokenValido } = await import("@/lib/contaazul-tokens");
  const token = await obterAccessTokenValido();

  for (const url of DOCS) {
    try {
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      const texto = await r.text();
      console.log(`  ${marcador(r.status)} ${url}`);
      if (r.ok && texto.trim().startsWith("{")) {
        console.log(
          `${cor.verde}  ↑ ACHOU. Primeiros 1500 chars:${cor.reset}\n${texto.slice(0, 1500)}`,
        );
      }
    } catch (e) {
      console.log(
        `  ${cor.vermelho}rede    ${cor.reset} ${url} — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function varrerCandidatos(): Promise<Resultado[]> {
  titulo("1. Varredura de caminhos (GET, sem parâmetros)");
  const achados: Resultado[] = [];

  for (const caminho of CANDIDATOS) {
    const r = await sondar(caminho);
    achados.push(r);

    const rotulo = caminho === "" ? "(raiz /v1/)" : caminho;
    let extra = "";
    if (r.ok) {
      const c = r.corpo;
      if (Array.isArray(c)) extra = `${cor.cinza}array[${c.length}]${cor.reset}`;
      else if (c && typeof c === "object")
        extra = `${cor.cinza}{${Object.keys(c).slice(0, 8).join(", ")}}${cor.reset}`;
    } else if (r.status === 400) {
      // 400 é sinal FORTE: o caminho existe e recusou os parâmetros.
      extra = `${cor.amarelo}existe, faltam parâmetros${cor.reset}`;
    }
    console.log(`  ${marcador(r.status)} ${rotulo.padEnd(32)} ${extra}`);
  }

  return achados;
}

/** Mostra por inteiro os que responderam, que é o que interessa modelar. */
async function detalhar(achados: Resultado[]): Promise<void> {
  const vivos = achados.filter((r) => r.ok || r.status === 400);
  titulo(`2. Detalhe dos ${vivos.length} caminhos que deram sinal de vida`);

  if (vivos.length === 0) {
    console.log(`  ${cor.cinza}Nenhum. Ver as assinaturas de erro abaixo.${cor.reset}`);
  }

  for (const r of vivos) {
    console.log(`\n${cor.negrito}--- /v1/${r.caminho || ""} (HTTP ${r.status}) ---${cor.reset}`);
    if (r.ok) {
      console.log(amostra(r.corpo));
    } else {
      // O corpo do 400 costuma dizer QUAL parâmetro falta. É ouro.
      console.log(`${cor.amarelo}${r.erro}${cor.reset}`);
      console.log(`${cor.cinza}corpo: ${String(r.corpo).slice(0, 900)}${cor.reset}`);
    }
  }
}

/**
 * Os corpos de erro, agrupados.
 *
 * Existe porque a primeira execução desta ferramenta devolveu 403 em
 * TODOS os 46 caminhos, inclusive num inventado — e um 403 uniforme não
 * é "caminho errado", é a API dizendo outra coisa antes de olhar o
 * caminho. Sem ler o corpo, o diagnóstico teria virado uma caçada a
 * nomes de endpoint que não existia.
 */
function assinaturasDeErro(achados: Resultado[]): void {
  titulo("3. Assinaturas de erro distintas");
  const porCorpo = new Map<string, { status: number; caminhos: string[] }>();

  for (const r of achados.filter((x) => !x.ok)) {
    const chave = `${r.status}|${String(r.corpo).replace(/\s+/g, " ").trim().slice(0, 300)}`;
    const grupo = porCorpo.get(chave) ?? { status: r.status, caminhos: [] };
    grupo.caminhos.push(r.caminho || "(raiz)");
    porCorpo.set(chave, grupo);
  }

  for (const [chave, grupo] of porCorpo) {
    const corpo = chave.slice(chave.indexOf("|") + 1);
    console.log(`\n  ${marcador(grupo.status)} em ${grupo.caminhos.length} caminho(s)`);
    console.log(
      `  ${cor.cinza}${grupo.caminhos.slice(0, 6).join(", ")}${grupo.caminhos.length > 6 ? ", …" : ""}${cor.reset}`,
    );
    console.log(`  ${cor.amarelo}${corpo}${cor.reset}`);
  }
}

/**
 * O access_token é um JWT do Cognito: as claims dizem quais escopos
 * foram REALMENTE concedidos, que não é necessariamente o que pedimos
 * na URL de autorização.
 */
async function claimsDoToken(): Promise<void> {
  titulo("4. Escopos realmente concedidos (claims do access_token)");
  const { obterAccessTokenValido } = await import("@/lib/contaazul-tokens");
  const token = await obterAccessTokenValido();
  const partes = token.split(".");

  if (partes.length !== 3) {
    console.log(`  access_token é opaco (${partes.length} partes) — sem claims para ler.`);
    return;
  }
  const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  console.log(
    amostra({
      scope: payload.scope,
      client_id: payload.client_id,
      token_use: payload.token_use,
      iss: payload.iss,
      expira: new Date(Number(payload.exp) * 1000).toISOString(),
    }),
  );
  console.log(
    `\n  ${cor.cinza}Pedimos openid+profile+aws.cognito.signin.user.admin na autorização;` +
      ` compare com o campo scope acima.${cor.reset}`,
  );
}

async function principal(): Promise<void> {
  console.log(`${cor.negrito}Explorador da API da Conta Azul — somente leitura${cor.reset}`);
  console.log(`${cor.cinza}Nenhuma chamada aqui altera dados. Só GET.${cor.reset}`);

  const faltando = ["CONTAAZUL_CLIENT_ID", "CONTAAZUL_CLIENT_SECRET", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((n) => !process.env[n])
    .join(", ");
  if (faltando) {
    console.log(`\n${cor.vermelho}Faltam variáveis de ambiente: ${faltando}${cor.reset}`);
    process.exit(1);
  }

  await procurarDocumentacao();
  const achados = await varrerCandidatos();
  await detalhar(achados);
  assinaturasDeErro(achados);
  await claimsDoToken();

  titulo("Resumo");
  const ok = achados.filter((r) => r.ok).map((r) => r.caminho || "(raiz)");
  const quase = achados.filter((r) => r.status === 400).map((r) => r.caminho);
  console.log(`  ${cor.verde}200:${cor.reset} ${ok.join(", ") || "nenhum"}`);
  console.log(`  ${cor.amarelo}400 (existe):${cor.reset} ${quase.join(", ") || "nenhum"}`);

  // Um 403 igual em todo caminho, inclusive num inventado, é resposta
  // de porteiro: a API nem chegou a olhar a rota. Dizer isso aqui evita
  // que a próxima pessoa leia a varredura como "nenhum endpoint existe".
  const todos403 = achados.length > 0 && achados.every((r) => r.status === 403);
  if (todos403) {
    console.log(
      `\n  ${cor.vermelho}${cor.negrito}TODOS os caminhos deram 403, inclusive os inventados.${cor.reset}` +
        `\n  ${cor.vermelho}Isto não é caminho errado — é bloqueio de conta/plano.` +
        ` Ver a assinatura de erro na seção 3.${cor.reset}`,
    );
  }
}

principal().catch((e: unknown) => {
  console.log(
    `\n${cor.vermelho}Erro inesperado:${cor.reset} ${e instanceof Error ? e.stack : String(e)}`,
  );
  process.exit(1);
});

// ============================================================
// COMO RODAR
// ------------------------------------------------------------
//   node --import ./src/scripts/_alias.mjs src/scripts/contaazul-explorar.ts
//
// Precisa de CONTAAZUL_* e SUPABASE_SERVICE_ROLE_KEY — lidos do
// .env.local automaticamente. Exige a integração já conectada: o token
// vem da tabela integracao_contaazul.
// ============================================================
