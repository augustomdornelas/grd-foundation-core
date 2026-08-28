// ============================================================
// Quem está pedindo? — SÓ SERVIDOR
// ------------------------------------------------------------
// Este arquivo nasceu dentro de src/server.ts, servindo só ao gatilho
// da Secullum. Saiu de lá quando o OAuth da Conta Azul precisou da
// mesma resposta em dois lugares que não podem importar o entry de
// SSR: as server functions de contaazul-server.ts.
//
// A PERGUNTA É DO SERVIDOR, NÃO DO USUÁRIO, e é isso que explica a
// forma. O perfil é lido com a chave de serviço de propósito:
// `profiles` tem RLS, e ler com o token do próprio usuário faria a
// autorização depender de uma policy que existe para outra finalidade
// — mudá-la um dia por um motivo de tela mudaria, sem querer, quem
// pode disparar job e quem pode conectar o financeiro da empresa.
//
// Os `await import()` são deliberados: mantêm o cliente do Supabase e
// a chave de serviço fora do grafo de qualquer bundle que por acaso
// alcance este módulo.
// ============================================================

export type Identificacao =
  { ok: true; perfil: string; email: string } | { ok: false; erro: string; status: number };

/**
 * Quem dispara os jobs de sincronização. É a mesma lista de
 * `rh_pode_editar()` no banco, repetida aqui porque este caminho não
 * passa por RLS — os jobs escrevem com a chave de serviço, que ignora
 * policy.
 */
export const PERFIS_SYNC = ["administrador", "admin", "diretoria", "rh"] as const;

/**
 * Quem conecta e desconecta integrações. Mais estreita que a de cima
 * de propósito: autorizar o OAuth da Conta Azul dá ao Portal acesso ao
 * financeiro da empresa, e desconectar derruba a integração para todo
 * mundo. Não é decisão de quem cuida da folha.
 */
export const PERFIS_INTEGRACAO = ["administrador", "admin", "diretoria"] as const;

/**
 * Confere o JWT do Supabase e devolve o perfil de quem está pedindo.
 *
 * @param jwt          o access_token da sessão, sem o "Bearer ".
 * @param perfisPermitidos perfis em minúsculas que passam.
 * @param recusa       como dizer não. Existe porque a frase certa
 *                     depende do que está sendo negado: "não dispara
 *                     sincronização" e "não conecta integração" são
 *                     recados diferentes para o mesmo 403.
 */
export async function identificarUsuario(
  jwt: string,
  perfisPermitidos: readonly string[],
  recusa: (perfil: string) => string,
): Promise<Identificacao> {
  if (!jwt) return { ok: false, erro: "Sessão ausente.", status: 401 };

  try {
    const { supabaseServer } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseServer.auth.getUser(jwt);
    if (error || !data.user) {
      return { ok: false, erro: "Sessão inválida ou expirada.", status: 401 };
    }

    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data: perfilLinha } = await supabaseAdmin()
      .from("profiles")
      .select("perfil")
      .eq("id", data.user.id)
      .maybeSingle();

    const perfil = String((perfilLinha as { perfil?: string } | null)?.perfil ?? "")
      .trim()
      .toLowerCase();

    if (!perfisPermitidos.includes(perfil)) {
      return { ok: false, erro: recusa(perfil || "sem perfil"), status: 403 };
    }

    return { ok: true, perfil, email: data.user.email ?? "sem e-mail" };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : String(e),
      status: 500,
    };
  }
}

/** O recado de quem tentou disparar um job sem ser Diretoria ou RH. */
export function recusaDeSync(perfil: string): string {
  return `O perfil "${perfil}" não dispara sincronização. Só Diretoria e RH/DP.`;
}

/** O recado de quem tentou mexer numa integração sem ser Diretoria. */
export function recusaDeIntegracao(perfil: string): string {
  return `O perfil "${perfil}" não conecta nem desconecta integrações. Só Administrador e Diretoria.`;
}
