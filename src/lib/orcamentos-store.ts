// ============================================================
// Store de Orcamentos (Comercial)
// ------------------------------------------------------------
// Fonte unica de verdade dos orcamentos. Persistida na tabela
// `orcamentos` do Supabase (protegida por Row Level Security).
// ============================================================
import { useMemo, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";
import { garantirProjetoDeOrcamento } from "@/lib/projeto-auto";
import { planejamentoZerado, type PlanejamentoValores } from "@/lib/planejamento-campos";

/** Colunas numeric do Postgres chegam como string; null vira 0. */
function pnum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

export type OrcStatus =
  | "LEVANTAMENTO"
  | "AGUARDANDO RETORNO"
  | "EM NEGOCIAÇÃO"
  | "NÃO APROVADO"
  | "CANCELADO"
  | "APROVADO";

export type TipoServico =
    | "Engenharia e Constru\u00e7\u00e3o"
  | "Gerenciamento"
  | "Reformas Industriais"
  | "Sistemas de Esgoto"
  | "Frezamento";

export type TimelineEvento = {
    data: string;
    de: OrcStatus | "\u2014";
    para: OrcStatus;
    autor: string;
};

export type Nota = {
    id: string;
    data: string;
    autor: string;
    texto: string;
};

export type Orcamento = {
    id: string;
    numero: string;
    cliente: string;
    cnpj: string;
    tipo: TipoServico;
    obra: string;
    descricao: string;
    valor: number;
    responsavel: string;
    data: string;
    validade: string;
    status: OrcStatus;
    probabilidade: number;
    observacoes: string;
    anexo?: string;
    ultimaAtualizacao: string;
    timeline: TimelineEvento[];
    notas: Nota[];
    /** Planejamento copiado para as colunas planejado_* do projeto. */
    planejamento: PlanejamentoValores;
    /** Vínculo com o pré-cadastro `responsaveis`. Os campos de texto
     *  `responsavel` (comercial) e `cnpj` (técnico) seguem como fallback
     *  dos orçamentos lançados antes do cadastro existir. */
    responsavelTecnicoId: string | null;
    responsavelComercialId: string | null;
    /** max(orcamento_notas.created_at), mantido por trigger no banco. */
    ultimaNotaEm: string | null;
    criadoEm: string;
    /** sum(orcamento_custos.subtotal), mantido por trigger. Nunca escrito daqui. */
    custoTotal: number;

    // ---- Origem: OneDrive ----
    // Escritos SÓ pelo job (src/lib/onedrive-sync.ts), com a chave de
    // serviço. Nenhum deles entra em `toRow()` — a tela lê e mostra, e
    // não tem por que reescrever a identidade da pasta lá fora.
    /** Id do item no Graph. Preenchido = veio do OneDrive. */
    driveItemId: string | null;
    /** Link para abrir a pasta no OneDrive. */
    driveUrl: string;
    /** PALPITE do nome da pasta, quando bateu com um cliente cadastrado
     *  só. Vazio num importado = cliente a definir. Nunca é o `cliente`. */
    clienteSugerido: string;
    importadoEm: string | null;
    /** Quando alguém conferiu o rascunho contra a pasta. Enquanto for
     *  null num importado, a listagem mostra o selo "a conferir". */
    conferidoEm: string | null;
};

export const TIPOS_SERVICO: TipoServico[] = [
    "Engenharia e Constru\u00e7\u00e3o",
    "Gerenciamento",
    "Reformas Industriais",
    "Sistemas de Esgoto",
    "Frezamento",
  ];

export const STATUS_LIST: OrcStatus[] = [
    "LEVANTAMENTO",
    "AGUARDANDO RETORNO",
    "EM NEGOCIAÇÃO",
    "NÃO APROVADO",
    "CANCELADO",
    "APROVADO",
  ];

export const RESPONSAVEIS = [
    "Carlos Menezes",
    "Fernanda Braga",
    "Rodrigo Alves",
    "Patr\u00edcia Lima",
  ];

export const STATUS_COLORS: Record<OrcStatus, string> = {
    "LEVANTAMENTO": "#94A3B8",
    "AGUARDANDO RETORNO": "#F59E0B",
    "EM NEGOCIAÇÃO": "#3B82F6",
    "NÃO APROVADO": "#DC2626",
    "CANCELADO": "#475569",
    "APROVADO": "#16A34A",
};


// -----------------------------------------------------------
// Mapeamento linha do banco <-> tipo Orcamento
// -----------------------------------------------------------
type OrcamentoRow = {
    id: string;
    numero: string | null;
    cliente: string | null;
    cnpj: string | null;
    tipo_servico: string | null;
    obra: string | null;
    descricao: string | null;
    valor: number | null;
    responsavel: string | null;
    data_emissao: string | null;
    prazo_validade: string | null;
    status: string | null;
    ultima_atualizacao: string | null;

    probabilidade: number | null;
    observacoes: string | null;
    anexo: string | null;
    timeline: TimelineEvento[] | null;
    notas: Nota[] | null;

    planejado_custos: number | null;
    planejado_mo_pct: number | null;
    planejado_mt_pct: number | null;
    planejado_terceirizado_pct: number | null;
    planejado_administrativo_pct: number | null;
    planejado_imposto_pct: number | null;
    planejado_lucro_pct: number | null;

    responsavel_tecnico_id: string | null;
    responsavel_comercial_id: string | null;
    ultima_nota_em: string | null;
    created_at: string | null;
    custo_total: number | string | null;

    drive_item_id: string | null;
    drive_url: string | null;
    cliente_sugerido: string | null;
    importado_em: string | null;
    conferido_em: string | null;
};

function fromRow(r: OrcamentoRow): Orcamento {
    return {
          id: r.id,
          numero: r.numero ?? "",
          cliente: r.cliente ?? "",
          cnpj: r.cnpj ?? "",
          tipo: (r.tipo_servico as TipoServico) ?? TIPOS_SERVICO[0],
          obra: r.obra ?? "",
          descricao: r.descricao ?? "",
          valor: Number(r.valor ?? 0) || 0,
          responsavel: r.responsavel ?? "",
          data: r.data_emissao ?? "",
          validade: r.prazo_validade ?? "",
          status: (r.status as OrcStatus) ?? "LEVANTAMENTO",
          ultimaAtualizacao: r.ultima_atualizacao ?? "",

          probabilidade: Number(r.probabilidade ?? 0) || 0,
          observacoes: r.observacoes ?? "",
          anexo: r.anexo ?? undefined,
          timeline: Array.isArray(r.timeline) ? r.timeline : [],
          notas: Array.isArray(r.notas) ? r.notas : [],
          planejamento: {
                custos: pnum(r.planejado_custos),
                moPct: pnum(r.planejado_mo_pct),
                mtPct: pnum(r.planejado_mt_pct),
                terceirizadoPct: pnum(r.planejado_terceirizado_pct),
                administrativoPct: pnum(r.planejado_administrativo_pct),
                impostoPct: pnum(r.planejado_imposto_pct),
                lucroPct: pnum(r.planejado_lucro_pct),
          },
          responsavelTecnicoId: r.responsavel_tecnico_id ?? null,
          responsavelComercialId: r.responsavel_comercial_id ?? null,
          ultimaNotaEm: r.ultima_nota_em ?? null,
          criadoEm: r.created_at ?? "",
          custoTotal: pnum(r.custo_total),

          driveItemId: r.drive_item_id ?? null,
          driveUrl: r.drive_url ?? "",
          clienteSugerido: r.cliente_sugerido ?? "",
          importadoEm: r.importado_em ?? null,
          conferidoEm: r.conferido_em ?? null,
    };
}

/** Veio do OneDrive e ninguém conferiu ainda. É o que acende o selo "a
 *  conferir" na listagem do Comercial. */
export function aConferir(o: Orcamento): boolean {
    return o.driveItemId !== null && o.conferidoEm === null;
}

/**
 * `incluirStatus` só é ligado na criação. Em atualização o status nunca
 * viaja por aqui: ele muda exclusivamente por `mudarStatusComNota`, que
 * grava status e nota na mesma transação (Requisito 1 — não existe
 * caminho alternativo).
 */
function toRow(o: Partial<Orcamento>, incluirStatus = false) {
    const row: Record<string, unknown> = {};
    if (o.numero !== undefined) row.numero = o.numero;
    if (o.cliente !== undefined) row.cliente = o.cliente;
    if (o.cnpj !== undefined) row.cnpj = o.cnpj;
    if (o.tipo !== undefined) row.tipo_servico = o.tipo;
    if (o.obra !== undefined) row.obra = o.obra;
    if (o.descricao !== undefined) row.descricao = o.descricao;
    if (o.valor !== undefined) row.valor = o.valor;
    if (o.responsavel !== undefined) row.responsavel = o.responsavel;
    if (o.data !== undefined) row.data_emissao = o.data;
    if (o.validade !== undefined) row.prazo_validade = o.validade;
    if (incluirStatus && o.status !== undefined) row.status = o.status;
    if (o.responsavelTecnicoId !== undefined) row.responsavel_tecnico_id = o.responsavelTecnicoId;
    if (o.responsavelComercialId !== undefined) row.responsavel_comercial_id = o.responsavelComercialId;

    if (o.probabilidade !== undefined) row.probabilidade = o.probabilidade;
    if (o.observacoes !== undefined) row.observacoes = o.observacoes;
    if (o.anexo !== undefined) row.anexo = o.anexo;
    if (o.planejamento !== undefined) {
          row.planejado_custos = o.planejamento.custos;
          row.planejado_mo_pct = o.planejamento.moPct;
          row.planejado_mt_pct = o.planejamento.mtPct;
          row.planejado_terceirizado_pct = o.planejamento.terceirizadoPct;
          row.planejado_administrativo_pct = o.planejamento.administrativoPct;
          row.planejado_imposto_pct = o.planejamento.impostoPct;
          row.planejado_lucro_pct = o.planejamento.lucroPct;
    }
    return upperizePayload(row, ["timeline", "notas", "anexo", "status", "descricao", "observacoes"]);
}


// -----------------------------------------------------------
// Store (padrao useSyncExternalStore + Supabase)
// -----------------------------------------------------------
let state: Orcamento[] = [];
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach(l => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const SSR_EMPTY: Orcamento[] = Object.freeze([]) as unknown as Orcamento[];
const getSnapshot = () => state;
const getServerSnapshot = () => SSR_EMPTY;

async function fetchAll() {
  try {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { toastErr("Falha ao carregar orçamentos", error); state = []; emit(); return; }
    state = (data as OrcamentoRow[] ?? []).map(fromRow);
    emit();
  } catch (err) {
    console.error("[orcamentos-store] fetchAll error:", err);
    state = [];
    emit();
  }
}

if (typeof window !== "undefined") {
  void fetchAll();
}

export function useOrcamentos<T>(selector: (s: Orcamento[]) => T): T {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => selector(snap), [snap, selector]);
}

function uid() { return `tmp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`; }

function proximoNumero(): string {
  const used = new Set(
    state.map(o => Number(o.numero.replace(/\D/g, ""))).filter(n => !isNaN(n) && n > 0)
  );
  let n = 1;
  while (used.has(n)) n++;
  return `ORC-${String(n).padStart(3, "0")}`;
}

export const orcamentosActions = {
  proximoNumero,
  // `planejamento` e opcional: o lancamento em lote nao preenche esses
  // campos, e forcar o objeto ali so criaria ruido.
  async criar(
    input: Omit<Orcamento,
      | "id" | "numero" | "timeline" | "notas" | "ultimaAtualizacao" | "planejamento"
      | "ultimaNotaEm" | "criadoEm" | "custoTotal"
      | "responsavelTecnicoId" | "responsavelComercialId"
      // Origem do OneDrive: quem cria pela tela nunca tem estes campos.
      // Só o job os preenche, e ele não passa por aqui.
      | "driveItemId" | "driveUrl" | "clienteSugerido" | "importadoEm" | "conferidoEm">
      & {
        numero?: string;
        planejamento?: PlanejamentoValores;
        responsavelTecnicoId?: string | null;
        responsavelComercialId?: string | null;
      },
  ): Promise<{ id: string | null; error: { message?: string } | null }> {
    const numero = input.numero || proximoNumero();
    const planejamento = input.planejamento ?? planejamentoZerado();
    const tempId = uid();
    const agora = new Date().toISOString();
    state = [{
      ...input, planejamento, id: tempId, numero,
      ultimaAtualizacao: agora.slice(0, 10), timeline: [], notas: [],
      responsavelTecnicoId: input.responsavelTecnicoId ?? null,
      responsavelComercialId: input.responsavelComercialId ?? null,
      ultimaNotaEm: null, criadoEm: agora, custoTotal: 0,
      driveItemId: null, driveUrl: "", clienteSugerido: "",
      importadoEm: null, conferidoEm: null,
    }, ...state];
    emit();
    const { data, error } = await supabase
      .from("orcamentos")
      .insert(toRow({ ...input, numero, planejamento }, true))
      .select()
      .single();
    if (error) {
      state = state.filter(o => o.id !== tempId);
      emit();
      return { id: null, error };
    }
    state = state.map(o => o.id === tempId ? fromRow(data as OrcamentoRow) : o);
    emit();
    const novo = fromRow(data as OrcamentoRow);
    if (novo.status === "APROVADO") {
      void garantirProjetoDeOrcamento({
        id: novo.id, obra: novo.obra, cliente: novo.cliente, valor: novo.valor,
        responsavel: novo.responsavel,
        responsavelTecnicoId: novo.responsavelTecnicoId,
        responsavelComercialId: novo.responsavelComercialId,
        planejamento: novo.planejamento,
      });
    }
    return { id: (data as OrcamentoRow).id, error: null };
  },
  async atualizar(id: string, patch: Partial<Orcamento>): Promise<{ error: { message?: string } | null }> {
    const atual = state.find(o => o.id === id);
    if (!atual) return { error: { message: "Orçamento não encontrado" } };
    // Trava explícita em vez de descartar em silêncio: quem tentar mudar
    // status por aqui recebe um erro em vez de um salvamento que parece
    // ter funcionado e não mudou nada.
    if (patch.status !== undefined && patch.status !== atual.status) {
      return { error: { message: "Mudança de status exige nota — use mudarStatusComNota." } };
    }
    const novoPatch: Partial<Orcamento> = { ...patch };
    const anterior = atual;
    state = state.map(o => o.id === id ? { ...o, ...novoPatch } : o);
    emit();
    const { data, error } = await supabase
      .from("orcamentos")
      .update(toRow(novoPatch))
      .eq("id", id)
      .select()
      .single();
    if (error) {
      state = state.map(o => o.id === id ? anterior : o);
      emit();
      return { error };
    }
    if (data) {
      state = state.map(o => o.id === id ? fromRow(data as OrcamentoRow) : o);
      emit();
    }
    // A criação do projeto ao aprovar mora em `mudarStatusComNota`: como o
    // status não muda mais por aqui, este caminho nunca chegaria a APROVADO.
    return { error: null };
  },
  /**
   * Único caminho para mudar o status. Chama a função
   * public.orcamento_mudar_status, que grava a nota e o status na mesma
   * transação: se a nota falhar, o status não muda.
   */
  async mudarStatusComNota(
    id: string,
    novoStatus: OrcStatus,
    texto: string,
    autor: { id: string; nome: string },
  ): Promise<{ error: { message?: string } | null }> {
    const anterior = state.find(o => o.id === id);
    if (!anterior) return { error: { message: "Orçamento não encontrado" } };

    const { data, error } = await supabase.rpc("orcamento_mudar_status", {
      p_orcamento_id: id,
      p_status_novo: novoStatus,
      p_texto: texto.trim(),
      p_autor_id: autor.id || null,
      p_autor_nome: autor.nome,
    });
    if (error) return { error };

    // A função devolve a linha já atualizada; o trigger de ultima_nota_em
    // roda antes do RETURNING, então a data da nota nova vem junto.
    if (data) {
      state = state.map(o => o.id === id ? fromRow(data as OrcamentoRow) : o);
      emit();
    }

    const atualizado = state.find(o => o.id === id);
    if (atualizado && atualizado.status === "APROVADO" && anterior.status !== "APROVADO") {
      void garantirProjetoDeOrcamento({
        id: atualizado.id, obra: atualizado.obra, cliente: atualizado.cliente,
        valor: atualizado.valor, responsavel: atualizado.responsavel,
        responsavelTecnicoId: atualizado.responsavelTecnicoId,
        responsavelComercialId: atualizado.responsavelComercialId,
        planejamento: atualizado.planejamento,
      });
    }
    return { error: null };
  },
  duplicar(id: string) {
    const orig = state.find(o => o.id === id);
    if (!orig) return;
    const numero = proximoNumero();
    const input = {
      ...orig,
      data: new Date().toISOString().slice(0, 10),
      status: "LEVANTAMENTO" as OrcStatus,
      // A cópia NÃO herda a origem. `toRow()` já não manda estes campos
      // para o banco — o índice único em drive_item_id recusaria a
      // segunda linha —, mas o objeto otimista aqui herdaria por spread
      // e a duplicata piscaria com o selo "a conferir" e um link para a
      // pasta que não é dela.
      driveItemId: null, driveUrl: "", clienteSugerido: "",
      importadoEm: null, conferidoEm: null,
    };

    const tempId = uid();
    // A cópia nasce sem histórico: notas e contador de inatividade são do
    // orçamento original, não acompanham a duplicata.
    state = [{
      ...input, id: tempId, numero, timeline: [], notas: [],
      ultimaNotaEm: null, criadoEm: new Date().toISOString(), custoTotal: 0,
    }, ...state];
    emit();
    void (async () => {
      const { data, error } = await supabase
        .from("orcamentos")
        .insert(toRow({ ...input, numero }, true))
        .select()
        .single();
      if (error) { toastErr("Falha ao duplicar orçamento", error); state = state.filter(o => o.id !== tempId); emit(); return; }
      state = state.map(o => o.id === tempId ? fromRow(data as OrcamentoRow) : o);
      emit();
    })();
  },
  excluir(id: string) {
    const backup = state;
    state = state.filter(o => o.id !== id);
    emit();
    void supabase.from("orcamentos").delete().eq("id", id)
      .then(({ error }) => { if (error) { toastErr("Falha ao excluir orçamento", error); state = backup; emit(); } });
  },
};


// Helpers de periodo compartilhados (usados em /app tambem)
export type PeriodoTipo = "mes" | "trimestre" | "ano" | "custom";
export type Periodo = { tipo: PeriodoTipo; ini?: string; fim?: string };

export function rangeDoPeriodo(p: Periodo): { ini: Date; fim: Date } {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = hoje.getMonth();
    if (p.tipo === "custom" && p.ini && p.fim) {
        return { ini: new Date(p.ini + "T00:00:00"), fim: new Date(p.fim + "T23:59:59.999") };
    }
    if (p.tipo === "mes") {
        // do dia 1 ao último dia do mês atual
        return {
            ini: new Date(y, m, 1, 0, 0, 0, 0),
            fim: new Date(y, m + 1, 0, 23, 59, 59, 999),
        };
    }
    if (p.tipo === "trimestre") {
        // dos últimos 3 meses até hoje (rolling window)
        const ini = new Date(y, m, hoje.getDate(), 0, 0, 0, 0);
        ini.setMonth(ini.getMonth() - 3);
        return { ini, fim: new Date(y, m, hoje.getDate(), 23, 59, 59, 999) };
    }
    // ano: 01/01 até 31/12 do ano atual
    return {
        ini: new Date(y, 0, 1, 0, 0, 0, 0),
        fim: new Date(y, 11, 31, 23, 59, 59, 999),
    };
}

export function rangeAnterior(p: Periodo): { ini: Date; fim: Date } {
    const cur = rangeDoPeriodo(p);
    const durMs = cur.fim.getTime() - cur.ini.getTime();
    return { ini: new Date(cur.ini.getTime() - durMs - 1), fim: new Date(cur.ini.getTime() - 1) };
}

export function dentro(dataISO: string, r: { ini: Date; fim: Date }) {
    if (!dataISO) return false;
    const d = new Date(dataISO.length <= 10 ? dataISO + "T12:00:00" : dataISO);
    return d >= r.ini && d <= r.fim;
}
