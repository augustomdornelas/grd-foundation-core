// ============================================================
// Store de fornecedores
// ------------------------------------------------------------
// Cadastro aberto, no mesmo espírito do de unidades: quem está
// lançando uma nota dentro de um projeto pode registrar o
// fornecedor na hora, com o que tiver na mão, e completar o resto
// depois pela aba Fornecedores.
//
// Só `nome` é obrigatório. Todo o resto é opcional de propósito —
// a alternativa (exigir CNPJ para lançar) é o que fazia a pessoa
// desistir e digitar o nome solto.
//
// A lista é carregada uma vez e compartilhada entre a aba e o
// select, como em unidades-store.
// ============================================================
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export type Fornecedor = {
  id: string;
  nome: string;
  cnpjCpf: string;
  ieRg: string;
  contato: string;
  telefone: string;
  email: string;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  observacoes: string;
  ativo: boolean;
};

/** Os campos editáveis; tudo opcional menos o nome. */
export type FornecedorInput = Omit<Fornecedor, "id" | "ativo"> & { ativo?: boolean };

export function fornecedorVazio(): FornecedorInput {
  return {
    nome: "", cnpjCpf: "", ieRg: "", contato: "", telefone: "", email: "",
    endereco: "", bairro: "", cidade: "", estado: "", cep: "", observacoes: "",
  };
}

const COLUNAS =
  "id, nome, cnpj_cpf, ie_rg, contato, telefone, email, endereco, bairro, cidade, estado, cep, observacoes, ativo";

let state: Fornecedor[] = [];
let carregado = false;
let carregando: Promise<void> | null = null;
const listeners = new Set<() => void>();

const SSR_VAZIO: Fornecedor[] = Object.freeze([]) as unknown as Fornecedor[];

function emit() {
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function mapear(r: any): Fornecedor {
  return {
    id: r.id,
    nome: txt(r.nome),
    cnpjCpf: txt(r.cnpj_cpf),
    ieRg: txt(r.ie_rg),
    contato: txt(r.contato),
    telefone: txt(r.telefone),
    email: txt(r.email),
    endereco: txt(r.endereco),
    bairro: txt(r.bairro),
    cidade: txt(r.cidade),
    estado: txt(r.estado),
    cep: txt(r.cep),
    observacoes: txt(r.observacoes),
    ativo: r.ativo ?? true,
  };
}

/** Campo em branco vira NULL: string vazia poluiria consultas e relatórios. */
function paraLinha(input: FornecedorInput): Record<string, unknown> {
  const limpo = (v: string) => v.trim() || null;
  return upperizePayload(
    {
      nome: input.nome.trim(),
      cnpj_cpf: limpo(input.cnpjCpf),
      ie_rg: limpo(input.ieRg),
      contato: limpo(input.contato),
      telefone: limpo(input.telefone),
      email: limpo(input.email),
      endereco: limpo(input.endereco),
      bairro: limpo(input.bairro),
      cidade: limpo(input.cidade),
      estado: limpo(input.estado),
      cep: limpo(input.cep),
      observacoes: limpo(input.observacoes),
    },
    // Observação é texto corrido de quem lançou; em caixa alta fica
    // ilegível, ao contrário de nome/endereço.
    ["observacoes"],
  );
}

function ordenar(lista: Fornecedor[]): Fornecedor[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

async function fetchAll(): Promise<void> {
  const { data, error } = await supabase
    .from("fornecedores")
    .select(COLUNAS)
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    toast.error(`Falha ao carregar fornecedores: ${error.message}`);
    // Não marca como carregado: a próxima tela tenta de novo em vez de
    // mostrar lista vazia para sempre.
    return;
  }
  state = (data ?? []).map(mapear);
  carregado = true;
  emit();
}

/** Carrega uma vez e compartilha a promessa entre chamadas simultâneas. */
export function garantirFornecedores(): Promise<void> {
  if (carregado) return Promise.resolve();
  if (carregando) return carregando;
  carregando = fetchAll().finally(() => { carregando = null; });
  return carregando;
}

export function useFornecedores(): Fornecedor[] {
  const lista = useSyncExternalStore(subscribe, () => state, () => SSR_VAZIO);
  useEffect(() => { void garantirFornecedores(); }, []);
  return lista;
}

/** Cadastra e devolve o registro gravado (null se falhou). */
export async function criarFornecedor(input: FornecedorInput): Promise<Fornecedor | null> {
  if (!input.nome.trim()) {
    toast.error("Informe o nome do fornecedor.");
    return null;
  }

  const { data, error } = await supabase
    .from("fornecedores")
    .insert(paraLinha(input) as Database["public"]["Tables"]["fornecedores"]["Insert"])
    .select(COLUNAS)
    .single();

  if (error) {
    toast.error(`Falha ao cadastrar fornecedor: ${error.message}`);
    return null;
  }

  const novo = mapear(data);
  state = ordenar([...state, novo]);
  emit();
  return novo;
}

export async function atualizarFornecedor(
  id: string,
  input: FornecedorInput,
): Promise<Fornecedor | null> {
  if (!input.nome.trim()) {
    toast.error("Informe o nome do fornecedor.");
    return null;
  }

  const { data, error } = await supabase
    .from("fornecedores")
    .update(paraLinha(input) as Database["public"]["Tables"]["fornecedores"]["Update"])
    .eq("id", id)
    .select(COLUNAS)
    .single();

  if (error) {
    toast.error(`Falha ao salvar fornecedor: ${error.message}`);
    return null;
  }

  const atualizado = mapear(data);
  state = ordenar(state.map(f => (f.id === id ? atualizado : f)));
  emit();
  return atualizado;
}

/**
 * Inativa em vez de apagar: os lançamentos migrados do sistema antigo
 * apontam para `fornecedores.id`, e excluir de verdade apagaria o nome
 * de linhas de anos atrás.
 */
export async function inativarFornecedor(id: string): Promise<boolean> {
  const { error } = await supabase.from("fornecedores").update({ ativo: false }).eq("id", id);
  if (error) {
    toast.error(`Falha ao inativar fornecedor: ${error.message}`);
    return false;
  }
  state = state.filter(f => f.id !== id);
  emit();
  return true;
}
