// ============================================================
// Cliente do Supabase com chave de serviço — SÓ SERVIDOR, SÓ JOBS
// ------------------------------------------------------------
// Este é o único lugar do sistema que ignora RLS. Ele existe porque um
// job de sincronização não tem usuário logado: ele roda às 5h da
// manhã, chamado por um agendador, e precisa escrever em tabelas cuja
// policy de escrita é — de propósito — inexistente.
//
// POR QUE A ALTERNATIVA NÃO SERVE: dar policy de escrita a
// `authenticated` nas tabelas de ponto significaria que qualquer token
// de usuário do RH poderia forjar batida. O ponto é documento
// trabalhista; ele precisa ser gravável só por um caminho, e esse
// caminho é este arquivo.
//
// REGRAS DE USO, sem exceção:
//   - importado APENAS por src/lib/secullum-sync.ts;
//   - nunca por rota, componente ou server function que devolva dado
//     ao navegador sem filtrar;
//   - a chave vem de SUPABASE_SERVICE_ROLE_KEY, do ambiente do
//     servidor, e NUNCA do .env do repositório, que é público e
//     versionado.
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error(
    "supabase-admin.ts é código de servidor e foi importado no navegador. " +
      "Isto exporia a chave de serviço — nenhum uso justifica.",
  );
}

const URL_SUPABASE = "https://fpuwyndpmcgwkuaqbcvm.supabase.co";

let cliente: SupabaseClient | null = null;

export function chaveDeServicoFaltando(): boolean {
  return !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Devolve o cliente administrativo, ou lança com uma mensagem que diz
 * o que fazer. Lançar é melhor que devolver null: um job que segue em
 * frente sem poder escrever termina "com sucesso" e zero registros, o
 * que é pior que falhar.
 */
export function supabaseAdmin(): SupabaseClient {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está no ambiente do servidor. " +
        "Os jobs de sincronização não conseguem escrever sem ela. " +
        "Cadastre no painel do host (nunca no arquivo .env do repositório).",
    );
  }
  if (!cliente) {
    cliente = createClient(URL_SUPABASE, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}
