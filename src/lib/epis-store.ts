// ============================================================
// Store de EPIs — integração real com Supabase
// ------------------------------------------------------------
// Cobre: funcionários (só leitura), catálogo de EPIs, entregas (termos) e os
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
  /** Código da etiqueta do almoxarifado (GRD-ALM-XX-000) — é o que o QR code contém. */
  codigoInterno?: string;
  /** epis.exige_ca: compra e lote novo exigem Nº e validade do C.A. */
  exigeCa: boolean;
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

export type EntregaStatus = "PENDENTE" | "ASSINADO" | "CANCELADA";

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
  /** Foto do colaborador recebendo os EPIs, no bucket privado termos-epi. É a assinatura. */
  fotoRecebimentoPath?: string;
  /** PDF do termo já com a foto, no bucket termos-epi. */
  termoPdfPath?: string;
  /** Momento exato da assinatura por foto (ISO). */
  assinadoEm?: string;
  /** Cancelada pela RPC cancelar_entrega_epi: o estoque já voltou. */
  cancelada: boolean;
  motivoCancelamento?: string;
  canceladaEm?: string;
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
  /** Estornada pela RPC estornar_compra_epi (o saldo dos lotes saiu do estoque). */
  estornadaEm?: string;
  estornoMotivo?: string;
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
  /** Compras que geraram lote (epi_lotes.compra_id): só estas pedem estorno. */
  comprasComLote: string[];
};

const SSR: State = {
  funcionarios: [], epis: [], entregas: [], itens: [],
  fornecedores: [], compras: [], compraItens: [], comprasComLote: [],
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
    codigoInterno: r.codigo_interno ?? undefined,
    exigeCa: r.exige_ca ?? false,
  };
}

// ---------- Código interno / QR code ----------
/** Maiúsculas e sem espaço nenhum: " grd-alm-lv 001 " -> "GRD-ALM-LV001". */
export function normalizarCodigoEpi(codigo: string | null | undefined): string {
  return (codigo ?? "").toUpperCase().replace(/\s+/g, "");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Acha o EPI pelo que o QR code leu. A etiqueta traz só o código
 * interno; aceita também o id (uuid) do EPI. Compara sem diferenciar
 * maiúsculas nem espaços — igual ao índice único do banco, que é sobre
 * upper(codigo_interno).
 */
export function acharEpiPorQr(epis: Epi[], lido: string): Epi | undefined {
  const texto = lido.trim();
  if (UUID.test(texto)) return epis.find(e => e.id.toLowerCase() === texto.toLowerCase());
  const codigo = normalizarCodigoEpi(texto);
  if (!codigo) return undefined;
  return epis.find(e => normalizarCodigoEpi(e.codigoInterno) === codigo);
}

/** Mensagem legível quando o banco recusa o código por já ser de outro EPI. */
function erroDeCodigo(error: { code?: string; message?: string }): string {
  if (error.code === "23505" && /codigo_interno/i.test(error.message ?? "")) {
    return "Este código interno já está em outro EPI.";
  }
  return error.message ?? "erro desconhecido";
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
    fotoRecebimentoPath: r.foto_recebimento_path ?? undefined,
    termoPdfPath: r.termo_pdf_path ?? undefined,
    assinadoEm: r.assinado_em ?? undefined,
    cancelada: r.status === "CANCELADA",
    motivoCancelamento: r.motivo_cancelamento ?? undefined,
    canceladaEm: r.cancelada_em ?? undefined,
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
    estornadaEm: r.estornada_em ?? undefined,
    estornoMotivo: r.estorno_motivo ?? undefined,
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
    const [fun, epi, ent, itn, forn, cmp, cItn, lot] = await Promise.all([
      supabase.from("funcionarios").select("*").order("nome", { ascending: true }),
      supabase.from("epis").select("*").order("nome", { ascending: true }),
      supabase.from("entregas_epi").select("*").order("data_entrega", { ascending: false }),
      supabase.from("entrega_epi_itens").select("*").order("created_at", { ascending: true }),
      supabase.from("fornecedores").select("id, nome, ativo").order("nome", { ascending: true }),
      supabase.from("compras_epi").select("*").order("data_compra", { ascending: false }),
      supabase.from("compra_epi_itens").select("*").order("created_at", { ascending: true }),
      supabase.from("epi_lotes").select("compra_id").not("compra_id", "is", null),
    ]);
    toastErr("Falha ao carregar funcionários", fun.error);
    toastErr("Falha ao carregar EPIs", epi.error);
    toastErr("Falha ao carregar entregas", ent.error);
    toastErr("Falha ao carregar itens de entrega", itn.error);
    toastErr("Falha ao carregar fornecedores", forn.error);
    toastErr("Falha ao carregar compras", cmp.error);
    toastErr("Falha ao carregar itens de compra", cItn.error);
    toastErr("Falha ao carregar lotes de estoque", lot.error);
    state = {
      funcionarios: (fun.data ?? []).map(mapFuncionario),
      epis: (epi.data ?? []).map(mapEpi),
      entregas: (ent.data ?? []).map(mapEntrega),
      itens: (itn.data ?? []).map(mapItem),
      fornecedores: (forn.data ?? []).map(mapFornecedor),
      compras: (cmp.data ?? []).map(mapCompra),
      compraItens: (cItn.data ?? []).map(mapCompraItem),
      comprasComLote: [...new Set(((lot.data ?? []) as { compra_id: string }[]).map(l => l.compra_id))],
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

/**
 * Insere um EPI no catálogo sem recarregar tudo — a compra pode criar
 * vários EPIs novos de uma vez e um fetchAll por item seria desperdício.
 */
async function inserirEpi(input: Omit<Epi, "id" | "exigeCa">): Promise<{ id: string | null; erro: string | null }> {
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
        // Sempre zero: o saldo nasce das compras (lotes), nunca do cadastro.
        estoque: 0,
        unidade: input.unidade ?? "un",
        foto_url: input.fotoUrl || null,
        ativo: input.ativo,
        codigo_interno: normalizarCodigoEpi(input.codigoInterno) || null,
      }) as any)
      .select("*")
      .single();
    if (error) return { id: null, erro: erroDeCodigo(error) };
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
  /** Do lote: obrigatórios quando o EPI exige C.A. (a RPC confere). */
  numeroCa?: string;
  validadeCa?: string;
  tamanho?: string;
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

// Estoque: o front nunca grava epis.estoque. Quem mexe nele é o livro
// por lote no banco (epi_lotes / epi_movimentacoes): a compra gera o lote
// e a ENTRADA_COMPRA, a entrega a SAIDA_ENTREGA, o cancelamento o
// ESTORNO_ENTREGA. Um UPDATE direto é barrado por trg_epis_estoque_protegido.

/**
 * DELETE com confirmação: pede a linha apagada de volta (.select). Sem
 * erro e sem linha quer dizer que o banco não apagou nada — a RLS filtrou,
 * por exemplo — e isso é erro, não sucesso.
 */
async function apagarConfirmado(tabela: "epis" | "compras_epi", id: string): Promise<string | null> {
  const { data, error } = await supabase.from(tabela).delete().eq("id", id).select("id");
  if (error) {
    // 23503: outra tabela aponta para esta linha (movimentações de estoque, entregas).
    return error.code === "23503"
      ? "o registro já tem movimentações de estoque ligadas a ele e não pode ser excluído"
      : error.message;
  }
  if (!data?.length) return "o banco não excluiu o registro (sem permissão ou já removido)";
  return null;
}

// ---------- Livro de estoque por lote ----------
export type TipoAjuste = "AJUSTE_ENTRADA" | "AJUSTE_SAIDA" | "DESCARTE";

export type LoteComSaldo = {
  id: string;
  origem: string;
  numeroCa: string;
  validadeCa?: string;
  dataCompra?: string;
  fornecedorNome: string;
  numeroNota: string;
  quantidadeComprada: number;
  saldo: number;
  ativo: boolean;
};

export type ResultadoEstorno = {
  totalComprado: number;
  totalEstornado: number;
  unidadesEmEntregas: number;
};

/** Mesmo sinal da epi_sinal() do banco. */
const SINAL: Record<string, number> = {
  ENTRADA_COMPRA: 1, DEVOLUCAO: 1, AJUSTE_ENTRADA: 1, ESTORNO_ENTREGA: 1,
  SAIDA_ENTREGA: -1, AJUSTE_SAIDA: -1, DESCARTE: -1,
};

/** Ajuste de estoque e estorno de compra: o banco só aceita Administrador ou Almoxarifado (epi_pode_ajustar). */
export function podeAjustarEstoque(perfil: string): boolean {
  const p = perfil.trim().toLowerCase();
  return p === "administrador" || p === "almoxarifado";
}

function msgRpc(error: { code?: string; message?: string }, funcao: string): string {
  if (error.code === "PGRST202") return `a função ${funcao} não existe no banco (falta aplicar a migration)`;
  if (error.code === "42501") return `sem permissão (${error.message ?? "recusado pelo banco"})`;
  return error.message ?? "erro desconhecido";
}

// ---------- Actions ----------
export const epiActions = {
  // Funcionários: este store só LÊ a tabela, para a entrega. Criar e
  // editar ficam em colaboradorActions (menu Colaboradores); excluir não
  // existe — quem sai é desligado.

  // ----- EPIs (catálogo) -----
  async criarEpi(input: Omit<Epi, "id" | "exigeCa">): Promise<string | null> {
    const { id, erro } = await inserirEpi(input);
    if (erro) { toast.error(`Erro ao salvar EPI: ${erro}`); return null; }
    await fetchAll();
    return id;
  },
  /**
   * Devolve a mensagem de erro (ou null). Se o banco recusar — o caso
   * esperado é código interno repetido —, o EPI volta a ser o que era,
   * para a tela não mostrar um código que não foi gravado.
   */
  async atualizarEpi(id: string, patch: Partial<Epi>): Promise<string | null> {
    const anterior = state.epis.find(e => e.id === id);
    if (patch.codigoInterno !== undefined) patch = { ...patch, codigoInterno: normalizarCodigoEpi(patch.codigoInterno) };
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
    if (patch.unidade !== undefined) row.unidade = patch.unidade;
    // "" limpa o campo no banco (remover a foto / a validade do CA).
    if (patch.fotoUrl !== undefined) row.foto_url = patch.fotoUrl || null;
    if (patch.ativo !== undefined) row.ativo = patch.ativo;
    // "" vira NULL: tirar o código de um EPI não pode colidir no índice único.
    if (patch.codigoInterno !== undefined) row.codigo_interno = patch.codigoInterno || null;
    const { error } = await supabase.from("epis").update(upperizePayload(row)).eq("id", id);
    if (error) {
      if (anterior) {
        state = { ...state, epis: state.epis.map(e => e.id === id ? anterior : e) };
        emit();
      }
      const msg = erroDeCodigo(error);
      toast.error(`Erro ao salvar o EPI: ${msg}`);
      return msg;
    }
    return null;
  },
  /**
   * Devolve a mensagem de erro (ou null). Sem escrita otimista: o EPI só
   * some da tela depois que o banco confirma que a linha foi apagada.
   */
  async excluirEpi(id: string): Promise<string | null> {
    const erro = await apagarConfirmado("epis", id);
    await fetchAll();
    return erro;
  },

  // ----- Entregas (termo) -----
  /**
   * Registra a mesma entrega para vários funcionários — um termo por pessoa,
   * cada um com seu próprio número, para que cada um assine o seu.
   *
   * Tudo acontece numa transação só no banco (epis_registrar_entregas, ver
   * a migration 20260924100000): número do termo, itens com snapshot e
   * validade, e baixa de estoque. Ou saem todos os termos, ou nenhum — a
   * mensagem de erro diz qual funcionário barrou.
   */
  async registrarEntregaEmLote(input: NovaEntregaLoteInput): Promise<EntregaSalva[]> {
    const funcionarioIds = [...new Set(input.funcionarioIds.filter(Boolean))];
    if (!funcionarioIds.length) { toast.error("Selecione ao menos um funcionário"); return []; }
    if (!input.itens.length) { toast.error("Adicione ao menos um EPI"); return []; }

    const { data, error } = await supabase.rpc("epis_registrar_entregas", {
      p_funcionarios: funcionarioIds,
      p_data_entrega: input.dataEntrega,
      p_responsavel: input.responsavelEntrega ?? "",
      p_responsavel_cargo: input.responsavelCargo ?? "",
      p_observacoes: input.observacoes ?? "",
      p_itens: input.itens.map(it => ({
        epi_id: it.epiId,
        quantidade: it.quantidade,
        motivo: it.motivo,
      })),
    });

    if (error) {
      // PGRST202: a função ainda não existe no banco (migration não aplicada).
      const msg = error.code === "PGRST202"
        ? "o banco ainda não foi atualizado (falta aplicar a migration 20260924100000 no Supabase)"
        : error.message;
      toast.error(`Nenhum termo foi gravado: ${msg}`);
      return [];
    }

    const criadas = ((data ?? []) as Record<string, unknown>[]).map(mapEntrega);
    await fetchAll();

    return criadas.map(salva => ({
      entrega: state.entregas.find(e => e.id === salva.id) ?? salva,
      funcionario: state.funcionarios.find(f => f.id === salva.funcionarioId),
      itens: state.itens.filter(i => i.entregaId === salva.id),
    }));
  },

  async registrarEntrega(input: NovaEntregaInput): Promise<EntregaSalva | null> {
    const { funcionarioId, ...resto } = input;
    if (!funcionarioId) { toast.error("Selecione o funcionário"); return null; }
    const salvas = await epiActions.registrarEntregaEmLote({ ...resto, funcionarioIds: [funcionarioId] });
    return salvas[0] ?? null;
  },
  /**
   * Termo assinado por FOTO. Só é chamado depois que a foto e o PDF já
   * estão no Storage (termo-epi-assinatura.ts) — não existe mais marcar
   * assinado à mão. Sem escrita otimista: se o banco recusar, a tela não
   * pode mostrar ASSINADO nem por um instante. Devolve a mensagem de erro
   * ou null.
   */
  async registrarAssinaturaComFoto(input: {
    entregaId: string;
    fotoPath: string;
    pdfPath: string;
    assinadoEm: Date;
    assinadoPor: string | null;
  }): Promise<string | null> {
    // Data local (não UTC): às 22h de Brasília o UTC já é o dia seguinte.
    const d = input.assinadoEm;
    const dataLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const { error } = await supabase.from("entregas_epi").update({
      status: "ASSINADO",
      assinado: true,
      data_assinatura: dataLocal,
      assinado_em: input.assinadoEm.toISOString(),
      assinado_por: input.assinadoPor,
      foto_recebimento_path: input.fotoPath,
      termo_pdf_path: input.pdfPath,
    } as never).eq("id", input.entregaId);
    if (error) return error.message;
    await fetchAll();
    return null;
  },
  /**
   * Entrega não se exclui: cada uma gerou SAIDA_ENTREGA no livro de
   * estoque por lote (epi_movimentacoes), que é imutável. Cancelar é a
   * RPC cancelar_entrega_epi — numa transação, lança o ESTORNO_ENTREGA
   * (o estoque volta) e marca a entrega como CANCELADA. Devolve a
   * mensagem de erro ou null; a tela só confirma com null.
   */
  async cancelarEntrega(id: string, motivo: string): Promise<string | null> {
    const limpo = motivo.trim();
    if (limpo.replace(/[^\p{L}]/gu, "").length < 3) return "informe o motivo (mínimo 3 letras)";
    const { error } = await supabase.rpc("cancelar_entrega_epi", {
      p_entrega_id: id,
      p_motivo: limpo.toUpperCase(),
    });
    if (error) {
      return error.code === "PGRST202"
        ? "a função cancelar_entrega_epi não existe no banco"
        : error.message;
    }
    await fetchAll();
    const atual = state.entregas.find(e => e.id === id);
    if (!atual?.cancelada) return "o banco não confirmou o cancelamento";
    return null;
  },

  // ----- Compras (entrada de estoque) -----
  /**
   * Lança uma compra com vários EPIs de uma vez. Itens marcados como
   * `novoEpi` são cadastrados no catálogo na hora (estoque zero).
   *
   * A compra em si é SÓ a RPC registrar_compra_epi: numa transação ela
   * grava compras_epi, compra_epi_itens, um epi_lotes por item e a
   * ENTRADA_COMPRA — e o gatilho do livro sobe epis.estoque. Insert
   * direto nas tabelas não gera lote e não soma estoque.
   */
  async registrarCompra(input: NovaCompraInput): Promise<string | null> {
    if (!input.itens.length) { toast.error("Adicione ao menos um EPI"); return null; }
    if (!input.dataCompra) { toast.error("Informe a data da compra"); return null; }

    try {
      // 1) Cadastra os EPIs novos e resolve o epiId de cada item.
      const resolvidos: (NovoCompraItemInput & { epiId: string })[] = [];
      let criouEpi = false;
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
          if (!id) {
            toast.error(`Erro ao cadastrar o EPI "${it.novoEpi.nome}": ${erro ?? "desconhecido"}. A compra não foi lançada.`);
            if (criouEpi) await fetchAll();
            return null;
          }
          epiId = id;
          criouEpi = true;
        }
        if (!epiId) continue;
        resolvidos.push({ ...it, epiId });
      }
      if (!resolvidos.length) { toast.error("Nenhum item válido para lançar"); return null; }

      // 2) Compra + itens + lotes + ENTRADA_COMPRA, tudo no banco.
      const { data, error } = await supabase.rpc("registrar_compra_epi", {
        p_compra: upperizePayload({
          data_compra: input.dataCompra,
          fornecedor_id: input.fornecedorId || null,
          fornecedor_nome: input.fornecedorNome ?? "",
          numero_nota: input.numeroNota ?? "",
          responsavel: input.responsavel ?? "",
          observacoes: input.observacoes ?? "",
        }),
        p_itens: resolvidos.map(it => ({
          epi_id: it.epiId,
          quantidade: Math.round(it.quantidade),
          custo_unitario: it.valorUnitario,
          numero_ca: it.numeroCa?.trim().toUpperCase() || null,
          validade_ca: it.validadeCa || null,
          tamanho: it.tamanho?.trim().toUpperCase() || null,
        })),
      });
      if (error) {
        toast.error(`A compra não foi lançada: ${msgRpc(error, "registrar_compra_epi")}`);
        if (criouEpi) await fetchAll();
        return null;
      }
      await fetchAll();
      return (data as string | null) ?? null;
    } catch (err) {
      toast.error(`Erro ao registrar compra: ${err instanceof Error ? err.message : "desconhecido"}`);
      return null;
    }
  },

  /**
   * Estorna a compra (RPC estornar_compra_epi): AJUSTE_SAIDA do saldo de
   * cada lote, numa transação. O que já saiu em entregas não volta.
   */
  async estornarCompra(
    id: string,
    motivo: string,
  ): Promise<{ ok: true; resultado: ResultadoEstorno } | { ok: false; erro: string }> {
    const limpo = motivo.trim();
    if (limpo.replace(/[^\p{L}]/gu, "").length < 3) return { ok: false, erro: "informe o motivo (mínimo 3 letras)" };
    const { data, error } = await supabase.rpc("estornar_compra_epi", {
      p_compra_id: id,
      p_motivo: limpo.toUpperCase(),
    });
    if (error) return { ok: false, erro: msgRpc(error, "estornar_compra_epi") };
    await fetchAll();
    const r = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      resultado: {
        totalComprado: Number(r.total_comprado ?? 0),
        totalEstornado: Number(r.total_estornado ?? 0),
        unidadesEmEntregas: Number(r.unidades_em_entregas ?? 0),
      },
    };
  },

  /** Lotes do EPI com o saldo calculado do livro (não há coluna de saldo). */
  async lotesDoEpi(epiId: string): Promise<{ lotes: LoteComSaldo[]; erro: string | null }> {
    const [lot, mov] = await Promise.all([
      supabase.from("epi_lotes").select("*").eq("epi_id", epiId).order("created_at", { ascending: true }),
      supabase.from("epi_movimentacoes").select("lote_id, tipo, quantidade").eq("epi_id", epiId),
    ]);
    const erro = lot.error ?? mov.error;
    if (erro) return { lotes: [], erro: erro.message };
    const saldo = new Map<string, number>();
    for (const m of (mov.data ?? []) as { lote_id: string | null; tipo: string; quantidade: number }[]) {
      if (!m.lote_id) continue;
      saldo.set(m.lote_id, (saldo.get(m.lote_id) ?? 0) + (SINAL[m.tipo] ?? 0) * Number(m.quantidade ?? 0));
    }
    const lotes = ((lot.data ?? []) as Record<string, any>[]).map(r => ({
      id: r.id as string,
      origem: r.origem ?? "",
      numeroCa: r.numero_ca ?? "",
      validadeCa: r.validade_ca ?? undefined,
      dataCompra: r.data_compra ?? undefined,
      fornecedorNome: r.fornecedor_nome ?? "",
      numeroNota: r.numero_nota_fiscal ?? "",
      quantidadeComprada: Number(r.quantidade_comprada ?? 0),
      saldo: saldo.get(r.id) ?? 0,
      ativo: r.ativo ?? true,
    }));
    return { lotes, erro: null };
  },

  /**
   * registrar_ajuste_epi. Com lote: entrada, saída ou descarte nele.
   * AJUSTE_ENTRADA sem lote: o banco cria um lote novo (origem AJUSTE)
   * com o EPI e, se ele tiver C.A., número e validade do C.A.
   */
  async registrarAjuste(input: {
    tipo: TipoAjuste;
    epiId: string;
    loteId: string | null;
    quantidade: number;
    motivo: string;
    numeroCa?: string;
    validadeCa?: string;
  }): Promise<string | null> {
    const motivo = input.motivo.trim();
    if (motivo.replace(/[^\p{L}]/gu, "").length < 3) return "informe o motivo (mínimo 3 letras)";
    if (!(input.quantidade > 0)) return "informe uma quantidade maior que zero";
    if (!input.loteId && input.tipo !== "AJUSTE_ENTRADA") return "escolha o lote";
    const { error } = await supabase.rpc("registrar_ajuste_epi", {
      p_lote_id: input.loteId,
      p_tipo: input.tipo,
      p_quantidade: input.quantidade,
      p_motivo: motivo.toUpperCase(),
      p_epi_id: input.epiId,
      p_numero_ca: input.loteId ? null : (input.numeroCa?.trim() || null),
      p_validade_ca: input.loteId ? null : (input.validadeCa || null),
    });
    if (error) return msgRpc(error, "registrar_ajuste_epi");
    await fetchAll();
    return null;
  },

  /**
   * Só compra SEM LOTE se exclui (lançamento que não gerou estoque, ou que
   * falhou no meio). Compra com lote tem ENTRADA_COMPRA imutável: aí é
   * Estornar compra. Itens primeiro, depois o cabeçalho — cada passo
   * conferido. Devolve a mensagem de erro ou null.
   */
  async excluirCompra(id: string): Promise<string | null> {
    if (state.comprasComLote.includes(id)) {
      return "a compra já gerou lote de estoque; use Estornar compra";
    }
    if (state.compraItens.some(i => i.compraId === id)) {
      const { error } = await supabase.from("compra_epi_itens").delete().eq("compra_id", id).select("id");
      if (error) {
        await fetchAll();
        return `os itens da compra não foram excluídos (${error.message})`;
      }
    }
    const erro = await apagarConfirmado("compras_epi", id);
    await fetchAll();
    return erro;
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
