// ============================================================
// Store de unidades de medida
// ------------------------------------------------------------
// Cadastro aberto: quem está lançando uma nota pode criar uma
// unidade nova sem sair da tela.
//
// A unidade é gravada em `notas_fiscais.unidade` como TEXTO (a
// sigla), e não como chave estrangeira. É proposital: se alguém
// renomear ou apagar uma unidade do cadastro, as notas antigas
// continuam mostrando a unidade com que foram lançadas.
// ============================================================
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type Unidade = {
  id: string;
  nome: string;
  sigla: string;
  ativo: boolean;
};

let state: Unidade[] = [];
let carregado = false;
let carregando: Promise<void> | null = null;
const listeners = new Set<() => void>();

const SSR_VAZIO: Unidade[] = Object.freeze([]) as unknown as Unidade[];

function emit() {
  listeners.forEach(l => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

function mapear(r: any): Unidade {
  return {
    id: r.id,
    nome: r.nome ?? "",
    sigla: r.sigla ?? "",
    ativo: r.ativo ?? true,
  };
}

async function fetchAll(): Promise<void> {
  const { data, error } = await supabase
    .from("unidades")
    .select("id, nome, sigla, ativo")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    toast.error(`Falha ao carregar unidades: ${error.message}`);
    // Não marca como carregado: assim a próxima tela tenta de novo,
    // em vez de mostrar a lista vazia para sempre.
    return;
  }
  state = (data ?? []).map(mapear);
  carregado = true;
  emit();
}

/** Carrega uma vez e compartilha a promessa entre chamadas simultâneas. */
export function garantirUnidades(): Promise<void> {
  if (carregado) return Promise.resolve();
  if (carregando) return carregando;
  carregando = fetchAll().finally(() => { carregando = null; });
  return carregando;
}

export function useUnidades(): Unidade[] {
  const lista = useSyncExternalStore(
    subscribe,
    () => state,
    () => SSR_VAZIO,
  );
  useEffect(() => { void garantirUnidades(); }, []);
  return lista;
}

/**
 * Cria uma unidade e devolve o registro gravado.
 *
 * O índice único é sobre `lower(nome)`, então nome repetido é
 * recusado pelo banco. A mensagem é traduzida aqui porque a do
 * Postgres ("duplicate key value violates unique constraint") não
 * diz nada para quem está lançando uma nota.
 */
export async function criarUnidade(
  nome: string,
  sigla: string,
): Promise<Unidade | null> {
  const n = nome.trim();
  const s = sigla.trim();
  if (!n) {
    toast.error("Informe o nome da unidade.");
    return null;
  }

  const { data, error } = await supabase
    .from("unidades")
    .insert({ nome: n, sigla: s || n })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      toast.error(`Já existe uma unidade chamada "${n}".`);
    } else {
      toast.error(`Falha ao cadastrar unidade: ${error.message}`);
    }
    return null;
  }

  const nova = mapear(data);
  state = [...state, nova].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  emit();
  return nova;
}
