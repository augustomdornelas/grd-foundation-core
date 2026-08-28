// ============================================================
// Server functions da Conta Azul — a ponte entre a tela e o OAuth
// ------------------------------------------------------------
// A tela chama estas funções; elas rodam no servidor e são as únicas
// que enxergam contaazul-tokens.ts. O client_secret, o access_token e
// o refresh_token não atravessam esta fronteira em nenhuma direção —
// o que sai daqui é situação e data.
//
// O `await import()` dentro de cada handler não é estilo: é o que
// garante que o módulo dos tokens não entre no grafo do bundle do
// navegador. Import no topo do arquivo dependeria de o compilador
// remover tudo direitinho; o import dinâmico não depende. Mesma regra
// de secullum-server.ts.
//
// POR QUE O JWT VEM COMO PARÂMETRO, e não de um header: a sessão do
// Supabase vive no localStorage do navegador, não em cookie, e uma
// server function não recebe o Authorization sozinha. Então a tela lê
// o access_token da sessão e manda; o servidor confere contra o
// Supabase e contra a tabela `profiles`, com a chave de serviço. Quem
// mandar um token forjado não passa de `identificarUsuario()`.
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import type { StatusContaAzul } from "@/lib/contaazul-tokens";

export type { StatusContaAzul };

/** O que a tela precisa para se desenhar inteira numa chamada só. */
export type EstadoContaAzul = {
  /** As quatro variáveis de ambiente estão no servidor? */
  configurado: boolean;
  /** Quais faltam, pelo nome, quando não estão. */
  faltando: string;
  /** A redirect_uri cadastrada no App. É o que a tela exibe para conferência. */
  redirectUri: string;
  /**
   * URL de autorização já montada, para o link de nova aba.
   *
   * ELA NÃO CARREGA O COOKIE DE STATE — quem assina o state é o
   * /api/contaazul/conectar, e um link `<a href>` não tem como mandar
   * o JWT da sessão para chegar até lá. Este link existe porque a
   * redirect_uri deste App aponta para fora do Portal e o callback
   * automático não fecha em desenvolvimento; o caminho de produção é
   * o botão, que passa pelo endpoint.
   */
  urlDeAutorizacao: string;
  status: StatusContaAzul;
  /** Falha ao ler o estado (banco fora, chave de serviço ausente). */
  erro: string | null;
};

export type ResultadoConexao = {
  ok: boolean;
  erro: string | null;
  /** true quando a saída é reconectar, e não tentar de novo. */
  precisaReconectar: boolean;
  status: StatusContaAzul | null;
};

const SEM_CONEXAO: StatusContaAzul = {
  conectado: false,
  conectadoEm: null,
  renovadoEm: null,
  expiraEm: null,
  vencido: false,
  conectadoPor: "",
  escopo: "",
};

/**
 * Confere a sessão e devolve quem é, ou a frase que a tela mostra.
 * Só Administrador e Diretoria mexem em integração.
 */
async function exigirAdministrador(token: string): Promise<{ email: string } | { erro: string }> {
  const { identificarUsuario, PERFIS_INTEGRACAO, recusaDeIntegracao } =
    await import("@/lib/identificar-usuario");
  const quem = await identificarUsuario(token, PERFIS_INTEGRACAO, recusaDeIntegracao);
  return quem.ok ? { email: quem.email } : { erro: quem.erro };
}

function descreverErro(e: unknown): { erro: string; precisaReconectar: boolean } {
  if (e && typeof e === "object" && "precisaReconectar" in e) {
    const erro = e as { message?: string; precisaReconectar?: boolean };
    return {
      erro: erro.message ?? String(e),
      precisaReconectar: erro.precisaReconectar === true,
    };
  }
  return { erro: e instanceof Error ? e.message : String(e), precisaReconectar: false };
}

// ------------------------------------------------------------
// Estado da conexão
// ------------------------------------------------------------
// Sem exigir sessão: a tela que chama já está atrás de TelaModulo com
// perm="admin", e o que sai daqui são datas — nada que valha proteger
// duas vezes ao custo de a tela não conseguir se desenhar quando a
// sessão ainda está carregando.
export const obterEstadoContaAzul = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoContaAzul> => {
    const { lerCredenciais, credenciaisFaltando, montarUrlDeAutorizacao, lerStatus } =
      await import("@/lib/contaazul-tokens");

    const credenciais = lerCredenciais();
    if (!credenciais) {
      return {
        configurado: false,
        faltando: credenciaisFaltando(),
        redirectUri: process.env.CONTAAZUL_REDIRECT_URI?.trim() ?? "",
        urlDeAutorizacao: "",
        status: SEM_CONEXAO,
        erro: null,
      };
    }

    // State novo a cada carregamento da tela. Aqui ele é só o
    // ida-e-volta do parâmetro; a verificação de verdade é a do
    // endpoint /conectar, com HMAC em cookie.
    const { randomBytes } = await import("node:crypto");
    const state = randomBytes(16).toString("hex");

    const base = {
      configurado: true,
      faltando: "",
      redirectUri: credenciais.redirectUri,
      urlDeAutorizacao: montarUrlDeAutorizacao(credenciais, state),
    };

    try {
      return { ...base, status: await lerStatus(), erro: null };
    } catch (e) {
      // Falhar aqui não é "não conectado": é não saber. A tela mostra
      // o erro em vez de afirmar que a integração está desligada.
      return { ...base, status: SEM_CONEXAO, erro: descreverErro(e).erro };
    }
  },
);

// ------------------------------------------------------------
// Troca manual do code por token
// ------------------------------------------------------------
/**
 * O atalho que existe porque a redirect_uri deste App é
 * https://contaazul.com/ e não pode ser alterada: a Conta Azul devolve
 * o `code` na barra de endereços de um site que não é o Portal, e o
 * /api/contaazul/callback nunca chega a rodar em desenvolvimento.
 * Aqui o code é colado à mão e trocado no servidor.
 *
 * O STATE NÃO É CONFERIDO NESTE CAMINHO, e não tem como ser: o
 * navegador nunca voltou ao Portal carregando o cookie. O que protege
 * é a sessão — só Administrador e Diretoria chegam aqui, e a troca
 * acontece no servidor. Em produção, quem vale é o callback, que
 * confere o state assinado.
 */
export const trocarCodigoContaAzul = createServerFn({ method: "POST" })
  .validator((dados: { token: string; code: string }) => dados)
  .handler(async ({ data }): Promise<ResultadoConexao> => {
    const quem = await exigirAdministrador(data.token);
    if ("erro" in quem) {
      return { ok: false, erro: quem.erro, precisaReconectar: false, status: null };
    }

    // A Conta Azul devolve o code na URL; colar a URL inteira em vez do
    // valor é o engano mais provável de quem está fazendo isso à mão.
    // Extrair em vez de recusar poupa uma ida e volta.
    const code = extrairCode(data.code);
    if (!code) {
      return {
        ok: false,
        erro: "Cole o valor de `code` que veio na barra de endereços (ou a URL inteira).",
        precisaReconectar: false,
        status: null,
      };
    }

    const { conectarComCodigo } = await import("@/lib/contaazul-tokens");
    try {
      const status = await conectarComCodigo(code, quem.email);
      console.log(`[contaazul] conectado manualmente por ${quem.email}`);
      return { ok: true, erro: null, precisaReconectar: false, status };
    } catch (e) {
      console.error(e);
      const { erro, precisaReconectar } = descreverErro(e);
      return { ok: false, erro, precisaReconectar, status: null };
    }
  });

/**
 * Aceita o code puro ou a URL inteira em que ele veio. O code da Conta
 * Azul pode voltar na query (?code=) ou depois do "#", conforme a
 * página que o recebe — as duas são procuradas.
 */
export function extrairCode(bruto: string): string {
  const texto = bruto.trim();
  if (!texto) return "";
  if (!/[?#=]/.test(texto)) return texto;

  const encontrado = /[?#&]code=([^&\s#]+)/.exec(texto);
  return encontrado ? decodeURIComponent(encontrado[1]) : "";
}

// ------------------------------------------------------------
// Desconectar
// ------------------------------------------------------------
export const desconectarContaAzul = createServerFn({ method: "POST" })
  .validator((dados: { token: string }) => dados)
  .handler(async ({ data }): Promise<ResultadoConexao> => {
    const quem = await exigirAdministrador(data.token);
    if ("erro" in quem) {
      return { ok: false, erro: quem.erro, precisaReconectar: false, status: null };
    }

    const { desconectar } = await import("@/lib/contaazul-tokens");
    try {
      await desconectar();
      console.log(`[contaazul] desconectado por ${quem.email}`);
      return { ok: true, erro: null, precisaReconectar: false, status: SEM_CONEXAO };
    } catch (e) {
      console.error(e);
      return { ...descreverErro(e), ok: false, status: null };
    }
  });
