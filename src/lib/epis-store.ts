// ============================================================
// Store de EPIs — integração real com Supabase
// ------------------------------------------------------------
// Cobre: funcionários, catálogo de EPIs, entregas (termos) e os
// itens de cada entrega (com data de entrega e validade calculada).
// Segue o padrão dos demais stores do portal: estado em módulo,
// subscribe/emit, hook useEpiStore com equality shallow e escrita
// otimista no Supabase.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";

function toastErr(msg: string, err: { message?: string } | null | undefined) {
  if (err) toast.error(`${msg}: ${err.message ?? "erro desconhecido"}`);
}

// ---------- Tipos ----------
export type Funcionario = {
  id: string;
  nome: string;
  cpf: string;
  rg: string;
  cargo: string;
  setor: string;
  matricula: string;
  dataAdmissao?: string;
  ativo: boolean;
  observacoes: string;
};

export type Epi = {
  id: string;
  nome: string;
  ca: string;
  categoria: string;
  descricao: string;
  fabricante: string;
  validadeDias: number;
  caValidade?: string;
  estoque: number;
  unidade: string;
  fotoUrl?: string;
  ativo: boolean;
};

export type MotivoEntrega =
  | "PRIMEIRA ENTREGA"
  | "TROCA"
  | "DANIFICADO"
  | "PERDA"
  | "VENCIMENTO";

export const MOTIVOS_ENTREGA: MotivoEntrega[] = [
  "PRIMEIRA ENTREGA",
  "TROCA",
  "DANIFICADO",
  "PERDA",
  "VENCIMENTO",
];

/**
 * Item entregue. Os campos epiNome, ca, fabricante, unidade e epiFotoUrl são
 * snapshots tirados do catálogo no momento da entrega: o termo antigo precisa
 * continuar mostrando o que foi realmente entregue mesmo que o EPI seja
 * editado ou excluído depois.
 */
export type EntregaItem = {
  id: string;
  entregaId: string;
  epiId?: string;
  epiNome: string;
  ca: string;
  fabricante: string;
  unidade: string;
  epiFotoUrl?: string;
  quantidade: number;
  motivo: MotivoEntrega;
  dataEntrega: string;
  dataValidade?: string;
};

export type EntregaStatus = "PENDENTE" | "ASSINADO";

export type Entrega = {
  id: string;
  funcionarioId: string;
  numeroTermo: string;
  dataEntrega: string;
  responsavelEntrega: string;
  responsavelCargo: string;
  status: EntregaStatus;
  assinado: boolean;
  dataAssinatura?: string;
  observacoes: string;
};

export type Fornecedor = {
  id: string;
  nome: string;
  ativo: boolean;
};

/** Compra de EPIs — a entrada de estoque, espelho da entrega. */
export type CompraEpi = {
  id: string;
  fornecedorId?: string;
  fornecedorNome: string;
  numeroNota: string;
  dataCompra: string;
  responsavel: string;
  observacoes: string;
};

export type CompraItem = {
  id: string;
  compraId: string;
  epiId?: string;
  epiNome: string;
  ca: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
};

type State = {
  funcionarios: Funcionario[];
  epis: Epi[];
  entregas: Entrega[];
  itens: EntregaItem[];
  fornecedores: Fornecedor[];
  compras: CompraEpi[];
  compraItens: CompraItem[];
};

const SSR: State = {
  funcionarios: [], epis: [], entregas: [], itens: [],
  fornecedores: [], compras: [], compraItens: [],
};
let state: State = SSR;
const listeners = new Set<() => void>();
function emit() { listeners.forEach(l => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

// ---------- Utilidades de data ----------
const DIA_MS = 24 * 60 * 60 * 1000;

/** Soma `dias` a uma data ISO (yyyy-mm-dd) e devolve outra data ISO. */
export function somaDias(iso: string, dias: number): string {
  if (!iso || !dias) return "";
  const base = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const d = new Date(base.getTime() + dias * DIA_MS);
  return d.toISOString().slice(0, 10);
}

/** Dias restantes até a validade (negativo = vencido). */
export function diasParaVencer(dataValidade?: string): number | null {
  if (!dataValidade) return null;
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const val = new Date(`${dataValidade.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((val - hoje) / DIA_MS);
}

// ---------- Mapeamento (linha do banco -> objeto) ----------
function mapFuncionario(r: any): Funcionario {
  return {
    id: r.id,
    nome: r.nome ?? "",
    cpf: r.cpf ?? "",
    rg: r.rg ?? "",
    cargo: r.cargo ?? "",
    setor: r.setor ?? "",
    matricula: r.matricula ?? "",
    dataAdmissao: r.data_admissao ?? undefined,
    ativo: r.ativo ?? true,
    observacoes: r.observacoes ?? "",
  };
}
function mapEpi(r: any): Epi {
  return {
    id: r.id,
    nome: r.nome ?? "",
    ca: r.ca ?? "",
    categoria: r.categoria ?? "",
    descricao: r.descricao ?? "",
    fabricante: r.fabricante ?? "",
    validadeDias: Number(r.validade_dias ?? 0) || 0,
    caValidade: r.ca_validade ?? undefined,
    estoque: Number(r.estoque ?? 0) || 0,
    unidade: r.unidade ?? "un",
    fotoUrl: r.foto_url ?? undefined,
    ativo: r.ativo ?? true,
  };
}
function mapEntrega(r: any): Entrega {
  return {
    id: r.id,
    funcionarioId: r.funcionario_id ?? "",
    numeroTermo: r.numero_termo ?? "",
    dataEntrega: r.data_entrega ?? "",
    responsavelEntrega: r.responsavel_entrega ?? "",
    responsavelCargo: r.responsavel_cargo ?? "",
    status: (r.status ?? "PENDENTE") as EntregaStatus,
    assinado: r.assinado ?? false,
    dataAssinatura: r.data_assinatura ?? undefined,
    observacoes: r.observacoes ?? "",
  };
}
function mapItem(r: any): EntregaItem {
  return {
    id: r.id,
    entregaId: r.entrega_id ?? "",
    epiId: r.epi_id ?? undefined,
    epiNome: r.epi_nome ?? "",
    ca: r.ca ?? "",
    fabricante: r.fabricante ?? "",
    unidade: r.unidade ?? "un",
    epiFotoUrl: r.epi_foto_url ?? undefined,
    quantidade: Number(r.quantidade ?? 1) || 1,
    motivo: (r.motivo ?? "PRIMEIRA ENTREGA") as MotivoEntrega,
    dataEntrega: r.data_entrega ?? "",
    dataValidade: r.data_validade ?? undefined,
  };
}

function mapFornecedor(r: any): Fornecedor {
  return { id: r.id, nome: r.nome ?? "", ativo: r.ativo ?? true };
}
function mapCompra(r: any): CompraEpi {
  return {
    id: r.id,
    fornecedorId: r.fornecedor_id ?? undefined,
    fornecedorNome: r.fornecedor_nome ?? "",
    numeroNota: r.numero_nota ?? "",
    dataCompra: r.data_compra ?? "",
    responsavel: r.responsavel ?? "",
    observacoes: r.observacoes ?? "",
  };
}
function mapCompraItem(r: any): CompraItem {
  return {
    id: r.id,
    compraId: r.compra_id ?? "",
    epiId: r.epi_id ?? undefined,
    epiNome: r.epi_nome ?? "",
    ca: r.ca ?? "",
    unidade: r.unidade ?? "un",
    quantidade: Number(r.quantidade ?? 1) || 1,
    valorUnitario: Number(r.valor_unitario ?? 0) || 0,
  };
}

async function fetchAll() {
  try {
    const [fun, epi, ent, itn, forn, cmp, cItn] = await Promise.all([
      supabase.from("funcionarios").select("*").order("nome", { ascending: true }),
      supabase.from("epis").select("*").order("nome", { ascending: true }),
      supabase.from("entregas_epi").select("*").order("data_entrega", { ascending: false }),
      supabase.from("entrega_epi_itens").select("*").order("created_at", { ascending: true }),
      supabase.from("fornecedores").select("id, nome, ativo").order("nome", { ascending: true }),
      supabase.from("compras_epi").select("*").order("data_compra", { ascending: false }),
      supabase.from("compra_epi_itens").select("*").order("created_at", { ascending: true }),
    ]);
    toastErr("Falha ao carregar funcionários", fun.error);
    toastErr("Falha ao carregar EPIs", epi.error);
    toastErr("Falha ao carregar entregas", ent.error);
    toastErr("Falha ao carregar itens de entrega", itn.error);
    toastErr("Falha ao carregar fornecedores", forn.error);
    toastErr("Falha ao carregar compras", cmp.error);
    toastErr("Falha ao carregar itens de compra", cItn.error);
    state = {
      funcionarios: (fun.data ?? []).map(mapFuncionario),
      epis: (epi.data ?? []).map(mapEpi),
      entregas: (ent.data ?? []).map(mapEntrega),
      itens: (itn.data ?? []).map(mapItem),
      fornecedores: (forn.data ?? []).map(mapFornecedor),
      compras: (cmp.data ?? []).map(mapCompra),
      compraItens: (cItn.data ?? []).map(mapCompraItem),
    };
    emit();
  } catch (err) {
    console.error("[epis-store] fetchAll error:", err);
    emit();
  }
}

if (typeof window !== "undefined") void fetchAll();

export async function refetchEpis() {
  await fetchAll();
}

// ---------- Hook com equality shallow ----------
function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object); const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.is((a as any)[k], (b as any)[k])) return false;
    return true;
  }
  return false;
}

export function useEpiStore<T>(selector: (s: State) => T): T {
  const selRef = useRef(selector);
  selRef.current = selector;
  const [value, setValue] = useState<T>(() => selector(state));
  useEffect(() => {
    const check = () => {
      const next = selRef.current(state);
      setValue(prev => shallowEqual(prev, next) ? prev : next);
    };
    check();
    return subscribe(check);
  }, []);
  return value;
}

// ---------- Helpers ----------
export function itensDaEntrega(s: State, entregaId: string): EntregaItem[] {
  return s.itens.filter(i => i.entregaId === entregaId);
}

export function itensDaCompra(s: State, compraId: string): CompraItem[] {
  return s.compraItens.filter(i => i.compraId === compraId);
}

/** Total em R$ de uma compra. */
export function totalDaCompra(s: State, compraId: string): number {
  return itensDaCompra(s, compraId).reduce((a, i) => a + i.quantidade * i.valorUnitario, 0);
}

export function nomeFuncionario(s: State, id: string): string {
  return s.funcionarios.find(f => f.id === id)?.nome ?? "—";
}

function formataNumeroTermo(ano: number, seq: number): string {
  return `EPI-${ano}-${String(seq).padStart(4, "0")}`;
}

/**
 * Próximo sequencial do ano, lido do banco (e não da contagem local): contar
 * as entregas em memória reaproveita números quando um termo é excluído.
 */
async function proximoSequencialTermo(ano: number): Promise<number> {
  const { data, error } = await supabase
    .from("entregas_epi")
    .select("numero_termo")
    .like("numero_termo", `EPI-${ano}-%`)
    .order("numero_termo", { ascending: false })
    .limit(1);
  if (error) {
    // Sem o banco, cai para a contagem local — melhor um número provável do
    // que travar a entrega; o índice único barra a colisão no insert.
    return state.entregas.filter(e => (e.numeroTermo || "").startsWith(`EPI-${ano}-`)).length + 1;
  }
  const ultimo = (data?.[0] as { numero_termo?: string } | undefined)?.numero_termo ?? "";
  const seq = Number(ultimo.slice(ultimo.lastIndexOf("-") + 1));
  return (Number.isFinite(seq) ? seq : 0) + 1;
}

/**
 * Insere um EPI no catálogo sem recarregar tudo — a compra pode criar
 * vários EPIs novos de uma vez e um fetchAll por item seria desperdício.
 */
async function inserirEpi(input: Omit<Epi, "id">): Promise<{ id: string | null; erro: string | null }> {
  try {
    const { data, error } = await supabase
      .from("epis")
      .insert(upperizePayload({
        nome: input.nome,
        ca: input.ca ?? "",
        categoria: input.categoria ?? "",
        descricao: input.descricao ?? "",
        fabricante: input.fabricante ?? "",
        validade_dias: input.validadeDias ?? 0,
        ca_validade: input.caValidade || null,
        estoque: input.estoque ?? 0,
        unidade: input.unidade ?? "un",
        foto_url: input.fotoUrl || null,
        ativo: input.ativo,
      }) as any)
      .select("*")
      .single();
    if (error) return { id: null, erro: error.message };
    return { id: (data?.id as string) ?? null, erro: null };
  } catch (err) {
    return { id: null, erro: err instanceof Error ? err.message : "desconhecido" };
  }
}

export type NovaEntregaInput = {
  funcionarioId: string;
  dataEntrega: string;
  responsavelEntrega: string;
  responsavelCargo?: string;
  observacoes?: string;
  itens: { epiId: string; quantidade: number; motivo: MotivoEntrega }[];
};

/** Mesma entrega replicada para vários funcionários — um termo para cada um. */
export type NovaEntregaLoteInput = Omit<NovaEntregaInput, "funcionarioId"> & {
  funcionarioIds: string[];
};

export type EntregaSalva = {
  entrega: Entrega;
  funcionario?: Funcionario;
  itens: EntregaItem[];
};

/** Um item comprado: ou aponta para um EPI do catálogo, ou cria um novo. */
export type NovoCompraItemInput = {
  epiId?: string;
  novoEpi?: {
    nome: string;
    ca?: string;
    categoria?: string;
    fabricante?: string;
    unidade?: string;
    validadeDias?: number;
  };
  quantidade: number;
  valorUnitario: number;
};

export type NovaCompraInput = {
  fornecedorId?: string;
  fornecedorNome?: string;
  numeroNota?: string;
  dataCompra: string;
  responsavel?: string;
  observacoes?: string;
  itens: NovoCompraItemInput[];
};

/**
 * Aplica deltas de estoque por EPI — positivo entra (compra), negativo sai
 * (entrega). Soma os deltas do mesmo EPI e trava em zero. Best-effort: uma
 * falha aqui não desfaz o documento já gravado.
 */
async function ajustarEstoque(movimentos: { epiId?: string; delta: number }[]) {
  const porEpi = new Map<string, number>();
  for (const m of movimentos) {
    if (!m.epiId || !m.delta) continue;
    porEpi.set(m.epiId, (porEpi.get(m.epiId) ?? 0) + m.delta);
  }
  for (const [epiId, delta] of porEpi) {
    const epi = state.epis.find(e => e.id === epiId);
    if (!epi) continue;
    const novoEstoque = Math.max(0, epi.estoque + delta);
    if (novoEstoque === epi.estoque) continue;
    const { error } = await supabase.from("epis").update({ estoque: novoEstoque }).eq("id", epiId);
    toastErr("Erro ao atualizar estoque", error);
  }
}

/** Snapshot do catálogo para os itens de uma entrega. */
function montaItensPayload(
  entregaId: string,
  dataEntrega: string,
  itens: NovaEntregaInput["itens"],
) {
  return itens.map(it => {
    const epi = state.epis.find(e => e.id === it.epiId);
    const dataValidade = epi && epi.validadeDias > 0 ? somaDias(dataEntrega, epi.validadeDias) : null;
    return {
      entrega_id: entregaId,
      epi_id: it.epiId,
      epi_nome: epi?.nome ?? "",
      ca: epi?.ca ?? "",
      fabricante: epi?.fabricante ?? "",
      unidade: epi?.unidade ?? "un",
      epi_foto_url: epi?.fotoUrl ?? null,
      quantidade: it.quantidade,
      motivo: it.motivo,
      data_entrega: dataEntrega,
      data_validade: dataValidade,
    };
  });
}

/**
 * Insere a entrega tentando números sequenciais até um passar no índice único
 * (23505 = unique_violation), cobrindo duas entregas emitidas ao mesmo tempo.
 */
async function inserirEntrega(
  funcionarioId: string,
  input: Omit<NovaEntregaInput, "funcionarioId">,
  tentativas = 5,
): Promise<{ row: Record<string, unknown> | null; erro: string | null }> {
  const ano = new Date().getFullYear();
  let seq = await proximoSequencialTermo(ano);

  for (let t = 0; t < tentativas; t++) {
    const { data, error } = await supabase
      .from("entregas_epi")
      .insert(upperizePayload({
        funcionario_id: funcionarioId,
        numero_termo: formataNumeroTermo(ano, seq),
        data_entrega: input.dataEntrega,
        responsavel_entrega: input.responsavelEntrega ?? "",
        responsavel_cargo: input.responsavelCargo ?? "",
        status: "PENDENTE",
        assinado: false,
        observacoes: input.observacoes ?? "",
      }) as any)
      .select("*")
      .single();

    if (!error && data) return { row: data, erro: null };
    if (error?.code !== "23505") return { row: null, erro: error?.message ?? "erro desconhecido" };
    // Número já usado: recalcula e tenta o seguinte.
    seq = Math.max(seq + 1, await proximoSequencialTermo(ano));
  }
  return { row: null, erro: "não foi possível gerar um número de termo livre" };
}

// ---------- Actions ----------
export const epiActions = {
  // ----- Funcionários -----
  async criarFuncionario(input: Omit<Funcionario, "id">): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from("funcionarios")
        .insert(upperizePayload({
          nome: input.nome,
          cpf: input.cpf ?? "",
          rg: input.rg ?? "",
          cargo: input.cargo ?? "",
          setor: input.setor ?? "",
          matricula: input.matricula ?? "",
          data_admissao: input.dataAdmissao || null,
          ativo: input.ativo,
          observacoes: input.observacoes ?? "",
        }) as any)
        .select("*")
        .single();
      if (error) { toast.error(`Erro ao salvar funcionário: ${error.message}`); return null; }
      await fetchAll();
      return data?.id ?? null;
    } catch (err) {
      toast.error(`Erro ao salvar funcionário: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },
  async atualizarFuncionario(id: string, patch: Partial<Funcionario>) {
    state = { ...state, funcionarios: state.funcionarios.map(f => f.id === id ? { ...f, ...patch } : f) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.cpf !== undefined) row.cpf = patch.cpf;
    if (patch.rg !== undefined) row.rg = patch.rg;
    if (patch.cargo !== undefined) row.cargo = patch.cargo;
    if (patch.setor !== undefined) row.setor = patch.setor;
    if (patch.matricula !== undefined) row.matricula = patch.matricula;
    if (patch.dataAdmissao !== undefined) row.data_admissao = patch.dataAdmissao || null;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    if (patch.observacoes !== undefined) row.observacoes = patch.observacoes;
    const { error } = await supabase.from("funcionarios").update(upperizePayload(row)).eq("id", id);
    toastErr("Erro ao salvar no banco", error);
  },
  async excluirFuncionario(id: string) {
    state = { ...state, funcionarios: state.funcionarios.filter(f => f.id !== id) };
    emit();
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    toastErr("Erro ao excluir funcionário", error);
    await fetchAll();
  },

  // ----- EPIs (catálogo) -----
  async criarEpi(input: Omit<Epi, "id">): Promise<string | null> {
    const { id, erro } = await inserirEpi(input);
    if (erro) { toast.error(`Erro ao salvar EPI: ${erro}`); return null; }
    await fetchAll();
    return id;
  },
  async atualizarEpi(id: string, patch: Partial<Epi>) {
    state = { ...state, epis: state.epis.map(e => e.id === id ? { ...e, ...patch } : e) };
    emit();
    const row: Record<string, unknown> = {};
    if (patch.nome !== undefined) row.nome = patch.nome;
    if (patch.ca !== undefined) row.ca = patch.ca;
    if (patch.categoria !== undefined) row.categoria = patch.categoria;
    if (patch.descricao !== undefined) row.descricao = patch.descricao;
    if (patch.fabricante !== undefined) row.fabricante = patch.fabricante;
    if (patch.validadeDias !== undefined) row.validade_dias = patch.validadeDias;
    if (patch.caValidade !== undefined) row.ca_validade = patch.caValidade || null;
    if (patch.estoque !== undefined) row.estoque = patch.estoque;
    if (patch.unidade !== undefined) row.unidade = patch.unidade;
    // "" limpa o campo no banco (remover a foto / a validade do CA).
    if (patch.fotoUrl !== undefined) row.foto_url = patch.fotoUrl || null;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    const { error } = await supabase.from("epis").update(upperizePayload(row)).eq("id", id);
    toastErr("Erro ao salvar no banco", error);
  },
  async excluirEpi(id: string) {
    state = { ...state, epis: state.epis.filter(e => e.id !== id) };
    emit();
    const { error } = await supabase.from("epis").delete().eq("id", id);
    toastErr("Erro ao excluir EPI", error);
    await fetchAll();
  },

  // ----- Entregas (termo) -----
  /**
   * Registra a mesma entrega para vários funcionários — um termo por pessoa,
   * cada um com seu próprio número, para que cada um assine o seu.
   * Falha de um funcionário não aborta os demais.
   */
  async registrarEntregaEmLote(input: NovaEntregaLoteInput): Promise<EntregaSalva[]> {
    const funcionarioIds = input.funcionarioIds.filter(Boolean);
    if (!funcionarioIds.length) { toast.error("Selecione ao menos um funcionário"); return []; }
    if (!input.itens.length) { toast.error("Adicione ao menos um EPI"); return []; }

    const criadas: { entregaId: string; funcionarioId: string }[] = [];

    for (const funcionarioId of funcionarioIds) {
      const nome = state.funcionarios.find(f => f.id === funcionarioId)?.nome ?? "funcionário";
      try {
        const { row, erro } = await inserirEntrega(funcionarioId, input);
        if (!row || erro) { toast.error(`Erro ao registrar entrega de ${nome}: ${erro ?? "desconhecido"}`); continue; }

        const entregaId = row.id as string;
        const itensPayload = montaItensPayload(entregaId, input.dataEntrega, input.itens);
        const { error: itErr } = await supabase
          .from("entrega_epi_itens")
          .insert(itensPayload.map(p => upperizePayload(p)) as any);

        if (itErr) {
          // Termo sem item nenhum não serve para nada e ainda consome um
          // número — desfaz para não deixar lixo na lista de entregas.
          await supabase.from("entregas_epi").delete().eq("id", entregaId);
          toast.error(`Erro ao salvar os itens de ${nome}: ${itErr.message}`);
          continue;
        }

        criadas.push({ entregaId, funcionarioId });
      } catch (err) {
        toast.error(`Erro ao registrar entrega de ${nome}: ${err instanceof Error ? err.message : "desconhecido"}`);
      }
    }

    // Baixa de estoque somando o consumo de todos os termos criados.
    await ajustarEstoque(
      input.itens.map(it => ({ epiId: it.epiId, delta: -it.quantidade * criadas.length })),
    );

    await fetchAll();

    return criadas.flatMap(({ entregaId, funcionarioId }) => {
      const entrega = state.entregas.find(e => e.id === entregaId);
      if (!entrega) return [];
      return [{
        entrega,
        funcionario: state.funcionarios.find(f => f.id === funcionarioId),
        itens: state.itens.filter(i => i.entregaId === entregaId),
      }];
    });
  },

  async registrarEntrega(input: NovaEntregaInput): Promise<EntregaSalva | null> {
    const { funcionarioId, ...resto } = input;
    if (!funcionarioId) { toast.error("Selecione o funcionário"); return null; }
    const salvas = await epiActions.registrarEntregaEmLote({ ...resto, funcionarioIds: [funcionarioId] });
    return salvas[0] ?? null;
  },
  async marcarAssinado(entregaId: string, assinado: boolean) {
    const dataAssinatura = assinado ? new Date().toISOString().slice(0, 10) : null;
    state = {
      ...state,
      entregas: state.entregas.map(e => e.id === entregaId
        ? { ...e, assinado, status: assinado ? "ASSINADO" : "PENDENTE", dataAssinatura: dataAssinatura ?? undefined }
        : e),
    };
    emit();
    const { error } = await supabase.from("entregas_epi").update({
      assinado,
      status: assinado ? "ASSINADO" : "PENDENTE",
      data_assinatura: dataAssinatura,
    }).eq("id", entregaId);
    toastErr("Erro ao atualizar termo", error);
  },
  async excluirEntrega(id: string) {
    // Devolve ao estoque o que essa entrega tinha dado baixa: o termo
    // deixou de existir, então os EPIs não saíram.
    const itensDoTermo = state.itens.filter(i => i.entregaId === id);
    state = {
      ...state,
      entregas: state.entregas.filter(e => e.id !== id),
      itens: state.itens.filter(i => i.entregaId !== id),
    };
    emit();
    const { error } = await supabase.from("entregas_epi").delete().eq("id", id);
    toastErr("Erro ao excluir entrega", error);
    if (!error) await ajustarEstoque(itensDoTermo.map(i => ({ epiId: i.epiId, delta: i.quantidade })));
    await fetchAll();
  },

  // ----- Compras (entrada de estoque) -----
  /**
   * Lança uma compra com vários EPIs de uma vez. Itens marcados como
   * `novoEpi` são cadastrados no catálogo na hora (estoque zero) e só
   * então recebem a quantidade comprada.
   */
  async registrarCompra(input: NovaCompraInput): Promise<CompraEpi | null> {
    if (!input.itens.length) { toast.error("Adicione ao menos um EPI"); return null; }
    if (!input.dataCompra) { toast.error("Informe a data da compra"); return null; }

    try {
      // 1) Cadastra os EPIs novos e resolve o epiId de cada item.
      const resolvidos: { epiId: string; quantidade: number; valorUnitario: number }[] = [];
      for (const it of input.itens) {
        let epiId = it.epiId;
        if (!epiId && it.novoEpi?.nome?.trim()) {
          const { id, erro } = await inserirEpi({
            nome: it.novoEpi.nome.trim(),
            ca: it.novoEpi.ca ?? "",
            categoria: it.novoEpi.categoria ?? "",
            descricao: "",
            fabricante: it.novoEpi.fabricante ?? "",
            validadeDias: it.novoEpi.validadeDias ?? 0,
            estoque: 0,
            unidade: it.novoEpi.unidade || "un",
            ativo: true,
          });
          if (!id) { toast.error(`Erro ao cadastrar o EPI "${it.novoEpi.nome}": ${erro ?? "desconhecido"}`); continue; }
          epiId = id;
        }
        if (!epiId) continue;
        resolvidos.push({ epiId, quantidade: it.quantidade, valorUnitario: it.valorUnitario });
      }
      if (!resolvidos.length) { toast.error("Nenhum item válido para lançar"); return null; }

      // Os EPIs recém-criados ainda não estão em `state` — recarrega para
      // que os snapshots e a baixa de estoque enxerguem todos.
      await fetchAll();

      // 2) Cabeçalho da compra.
      const { data: compraRow, error: compraErr } = await supabase
        .from("compras_epi")
        .insert(upperizePayload({
          fornecedor_id: input.fornecedorId || null,
          fornecedor_nome: input.fornecedorNome ?? "",
          numero_nota: input.numeroNota ?? "",
          data_compra: input.dataCompra,
          responsavel: input.responsavel ?? "",
          observacoes: input.observacoes ?? "",
        }) as any)
        .select("*")
        .single();
      if (compraErr || !compraRow) {
        toast.error(`Erro ao registrar compra: ${compraErr?.message ?? "desconhecido"}`);
        return null;
      }
      const compraId = compraRow.id as string;

      // 3) Itens, com snapshot do catálogo.
      const itensPayload = resolvidos.map(it => {
        const epi = state.epis.find(e => e.id === it.epiId);
        return {
          compra_id: compraId,
          epi_id: it.epiId,
          epi_nome: epi?.nome ?? "",
          ca: epi?.ca ?? "",
          unidade: epi?.unidade ?? "un",
          quantidade: it.quantidade,
          valor_unitario: it.valorUnitario,
        };
      });
      const { error: itErr } = await supabase
        .from("compra_epi_itens")
        .insert(itensPayload.map(p => upperizePayload(p)) as any);
      if (itErr) {
        // Compra sem itens não soma estoque nenhum — desfaz.
        await supabase.from("compras_epi").delete().eq("id", compraId);
        toast.error(`Erro ao salvar os itens da compra: ${itErr.message}`);
        return null;
      }

      // 4) Entrada no estoque.
      await ajustarEstoque(resolvidos.map(it => ({ epiId: it.epiId, delta: it.quantidade })));
      await fetchAll();

      return state.compras.find(c => c.id === compraId) ?? mapCompra(compraRow);
    } catch (err) {
      toast.error(`Erro ao registrar compra: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },

  async excluirCompra(id: string) {
    // Tira do estoque o que essa compra tinha somado.
    const itens = state.compraItens.filter(i => i.compraId === id);
    state = {
      ...state,
      compras: state.compras.filter(c => c.id !== id),
      compraItens: state.compraItens.filter(i => i.compraId !== id),
    };
    emit();
    const { error } = await supabase.from("compras_epi").delete().eq("id", id);
    toastErr("Erro ao excluir compra", error);
    if (!error) await ajustarEstoque(itens.map(i => ({ epiId: i.epiId, delta: -i.quantidade })));
    await fetchAll();
  },

  /** Cadastra um fornecedor pelo nome (usado pelo diálogo de compra). */
  async criarFornecedor(nome: string): Promise<string | null> {
    const limpo = nome.trim();
    if (!limpo) return null;
    const { data, error } = await supabase
      .from("fornecedores")
      .insert(upperizePayload({ nome: limpo, ativo: true }) as any)
      .select("id")
      .single();
    if (error) { toast.error(`Erro ao cadastrar fornecedor: ${error.message}`); return null; }
    await fetchAll();
    return (data?.id as string) ?? null;
  },
};
