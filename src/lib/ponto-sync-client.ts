// ============================================================
// Disparar os jobs de sincronização a partir da tela
// ------------------------------------------------------------
// O gatilho de verdade é `/api/secullum/sync`, o mesmo que o agendador
// usa. O navegador entra por outra porta: manda o JWT da sessão no
// Authorization, e o servidor confere que o perfil é Diretoria ou RH
// antes de rodar qualquer coisa.
//
// O segredo do agendador (SECULLUM_SYNC_TOKEN) NÃO pode vir para cá:
// qualquer coisa embutida no bundle é pública, e publicá-lo entregaria
// o gatilho dos jobs para quem passasse na URL.
//
// OS JOBS RODAM EM SÉRIE, e isso é de propósito. A API da Secullum tem
// teto de requisições por hora; disparar seis de uma vez é a maneira
// mais rápida de bater no teto e receber bloqueio em todos.
// ============================================================
import { supabase } from "@/integrations/supabase/client";

export type TipoJob =
  "funcionarios" | "catalogos" | "afastamentos" | "pendencias" | "batidas" | "totais";

/**
 * A ordem importa: cadastro e catálogos primeiro.
 *
 * Batida e total são chaveados por CPF, e um afastamento de alguém que
 * ainda não está no espelho do cadastro entra como linha órfã — some
 * de todos os filtros da tela sem dar erro em lugar nenhum. Sincronizar
 * quem é a pessoa antes do que ela fez evita isso.
 */
export const ORDEM_DOS_JOBS: TipoJob[] = [
  "funcionarios",
  "catalogos",
  "afastamentos",
  "pendencias",
  "batidas",
  "totais",
];

export type ResultadoJob = {
  tipo: TipoJob;
  ok: boolean;
  registros: number;
  detalhe: string;
  erro?: string;
};

async function dispararUm(tipo: TipoJob, token: string): Promise<ResultadoJob> {
  try {
    const resposta = await fetch(`/api/secullum/sync?tipo=${encodeURIComponent(tipo)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    // O corpo pode não ser JSON quando um proxy responde no lugar do
    // servidor. Ler como texto primeiro evita que a tela quebre com
    // "Unexpected token <" e esconda o erro de verdade.
    const bruto = await resposta.text();
    let corpo: Record<string, unknown> = {};
    try {
      corpo = JSON.parse(bruto) as Record<string, unknown>;
    } catch {
      return {
        tipo,
        ok: false,
        registros: 0,
        detalhe: "",
        erro: `Resposta inesperada (HTTP ${resposta.status}): ${bruto.slice(0, 160)}`,
      };
    }

    return {
      tipo,
      ok: resposta.ok && corpo.ok === true,
      registros: Number(corpo.registros ?? 0),
      detalhe: String(corpo.detalhe ?? ""),
      erro: corpo.erro ? String(corpo.erro) : undefined,
    };
  } catch (e) {
    return {
      tipo,
      ok: false,
      registros: 0,
      detalhe: "",
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Roda os jobs em série e devolve o resultado de cada um.
 *
 * NÃO para no primeiro erro: se o endpoint de batidas estiver com o
 * formato errado, ainda assim vale sincronizar cadastro e afastamentos
 * — meia tela com dado é melhor que tela vazia, desde que a tela diga
 * o que faltou. `aoProgredir` existe para o botão poder mostrar em qual
 * job está, já que a sequência inteira leva alguns segundos.
 */
export async function sincronizarPonto(
  tipos: TipoJob[] = ORDEM_DOS_JOBS,
  aoProgredir?: (tipo: TipoJob, feitos: number, total: number) => void,
): Promise<{ resultados: ResultadoJob[]; erroDeSessao: string | null }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return {
      resultados: [],
      erroDeSessao: "Sessão expirada. Entre de novo para sincronizar.",
    };
  }

  const resultados: ResultadoJob[] = [];
  for (const [i, tipo] of tipos.entries()) {
    aoProgredir?.(tipo, i, tipos.length);
    resultados.push(await dispararUm(tipo, token));
  }
  return { resultados, erroDeSessao: null };
}
