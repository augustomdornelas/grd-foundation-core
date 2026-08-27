// ============================================================
// Os jobs de sincronização — SÓ SERVIDOR
// ------------------------------------------------------------
// Quatro rotinas que enchem o cache local. Nenhuma delas é chamada
// pelo dashboard: o dashboard lê só as tabelas.
//
// AVISO DE HONESTIDADE SOBRE O MAPEAMENTO
// O diagnóstico de 27/08 confirmou o formato de /Funcionarios,
// /Departamentos, /Funcoes, /Horarios e /Empresas. NÃO confirmou
// /Batidas nem /Calcular/SomenteTotais — nenhum dos dois foi chamado
// ainda. A leitura desses dois aqui é TOLERANTE de propósito: aceita
// variações de nome e de caixa, e registra em `detalhe` o que não
// soube ler, em vez de quebrar. Quando o primeiro sync rodar de
// verdade, os campos reais aparecem no diário e o mapeamento vira
// exato. Não invente schema; deixe o job contar.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error("secullum-sync.ts é código de servidor.");
}

import { supabaseAdmin } from "@/lib/supabase-admin";
import { soDigitos } from "@/lib/documento";
import {
  lerConfig,
  secullum,
  SecullumErro,
  type ConfigSecullum,
  type FuncionarioSecullum,
} from "@/lib/secullum-client";

// ------------------------------------------------------------
// Limites da Secullum
// ------------------------------------------------------------
/**
 * O teto oficial é 100 requisições por hora, por banco. Trabalhamos
 * com 80 para sobrar margem: o dashboard tem botão "Atualizar agora",
 * e alguém vai clicar nele no meio do job noturno.
 */
const TETO_REQUISICOES_HORA = 80;

/** Espaço entre chamadas para não emitir 80 rajadas em dois segundos. */
const PAUSA_MS = Math.ceil(3_600_000 / TETO_REQUISICOES_HORA); // 45s

function pausar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ------------------------------------------------------------
// Leitura tolerante
// ------------------------------------------------------------
type Registro = Record<string, unknown>;

/** Lê um campo aceitando variação de caixa e de nome. */
function campo(obj: unknown, ...nomes: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const r = obj as Registro;
  for (const nome of nomes) {
    if (nome in r) return r[nome];
    const achado = Object.keys(r).find((k) => k.toLowerCase() === nome.toLowerCase());
    if (achado !== undefined) return r[achado];
  }
  return undefined;
}

function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function inteiro(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** ISO ou "2026-08-27T00:00:00" viram "2026-08-27". Vazio vira null. */
function data(v: unknown): string | null {
  const t = texto(v).trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "07:58", "07:58:00" ou ISO com hora viram "07:58:00". */
function hora(v: unknown): string | null {
  const t = texto(v).trim();
  if (!t) return null;
  const hm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!hm) return null;
  const h = hm[1].padStart(2, "0");
  return `${h}:${hm[2]}:${hm[3] ?? "00"}`;
}

/**
 * "08:48" vira 528 minutos. Aceita negativo ("-01:30"), que aparece em
 * coluna de saldo. Número puro é tratado como minutos.
 */
export function paraMinutos(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  const t = texto(v).trim();
  if (!t) return 0;
  const m = t.match(/^(-)?(\d{1,4}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const sinal = m[1] ? -1 : 1;
    return sinal * (Number(m[2]) * 60 + Number(m[3]));
  }
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// ------------------------------------------------------------
// Diário do job
// ------------------------------------------------------------
export type TipoSync = "funcionarios" | "batidas" | "totais" | "catalogos";

export type ResultadoSync = {
  ok: boolean;
  tipo: TipoSync;
  registros: number;
  requisicoes: number;
  status: "ok" | "parcial" | "erro";
  detalhe: string;
  erro?: string;
  retomarDe?: string | null;
};

async function abrirDiario(db: SupabaseClient, tipo: TipoSync): Promise<string | null> {
  const { data: linha } = await db
    .from("secullum_sync")
    .insert({ tipo, status: "rodando" })
    .select("id")
    .single();
  return (linha as { id?: string } | null)?.id ?? null;
}

async function fecharDiario(
  db: SupabaseClient,
  id: string | null,
  r: Omit<ResultadoSync, "ok" | "tipo">,
): Promise<void> {
  if (!id) return;
  await db
    .from("secullum_sync")
    .update({
      terminado_em: new Date().toISOString(),
      status: r.status,
      registros: r.registros,
      requisicoes: r.requisicoes,
      retomar_de: r.retomarDe ?? null,
      detalhe: r.detalhe.slice(0, 2000),
      erro: r.erro?.slice(0, 2000) ?? null,
    })
    .eq("id", id);
}

function mensagem(e: unknown): string {
  if (e instanceof SecullumErro) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function exigirConfig(): ConfigSecullum {
  const config = lerConfig();
  if (!config) {
    throw new Error(
      "SECULLUM_EMAIL e SECULLUM_SENHA não estão no ambiente do servidor. " +
        "Sem elas nenhum job consegue falar com a Secullum.",
    );
  }
  return config;
}

// ------------------------------------------------------------
// Job 1 — funcionários
// ------------------------------------------------------------
export async function syncFuncionarios(): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "funcionarios");
  let requisicoes = 0;

  try {
    const config = exigirConfig();
    const lista = await secullum.funcionarios(config);
    requisicoes += 1;

    const semCpf: string[] = [];
    const linhas = (lista ?? [])
      .map((f: FuncionarioSecullum) => {
        const cpf = soDigitos(campo(f, "Cpf", "cpf") as string);
        if (cpf.length !== 11) {
          semCpf.push(texto(campo(f, "Nome", "nome")) || "(sem nome)");
          return null;
        }
        return {
          secullum_id: inteiro(campo(f, "Id", "id")),
          nome: texto(campo(f, "Nome", "nome")),
          cpf,
          numero_folha: texto(campo(f, "NumeroFolha", "numeroFolha")),
          admissao: data(campo(f, "Admissao", "admissao")),
          demissao: data(campo(f, "Demissao", "demissao")),
          // Departamento e função podem vir como id ou como texto,
          // dependendo do endpoint. Guardamos o que veio; o De/Para
          // com o Portal é problema da Etapa 2.
          departamento: texto(
            campo(f, "DepartamentoDescricao", "Departamento", "departamento", "DepartamentoId"),
          ),
          funcao: texto(campo(f, "FuncaoDescricao", "Funcao", "funcao", "FuncaoId")),
          horario_numero: inteiro(campo(f, "HorarioNumero", "HorarioId", "horarioId")),
          empresa_documento: texto(campo(f, "EmpresaDocumento", "empresaDocumento")),
          sincronizado_em: new Date().toISOString(),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    // Upsert por CPF: é a chave natural entre os dois sistemas. Sem
    // isto, cada execução criaria 128 linhas novas.
    const { error } = await db.from("secullum_funcionarios").upsert(linhas, { onConflict: "cpf" });
    if (error) throw new Error(`Falha ao gravar: ${error.message}`);

    const ativos = linhas.filter((l) => !l.demissao).length;
    const detalhe =
      `${linhas.length} gravados · ${ativos} ativos · ${linhas.length - ativos} com demissão` +
      (semCpf.length
        ? ` · ${semCpf.length} ignorado(s) por CPF inválido: ${semCpf.slice(0, 5).join(", ")}`
        : "");

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "funcionarios",
      registros: linhas.length,
      requisicoes,
      status: semCpf.length ? "parcial" : "ok",
      detalhe,
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "funcionarios",
      registros: 0,
      requisicoes,
      status: "erro",
      detalhe: "",
      erro: mensagem(e),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  }
}

// ------------------------------------------------------------
// Job 2 — batidas
// ------------------------------------------------------------
/**
 * `dia` no formato yyyy-mm-dd. Sem argumento, ontem — que é o que o
 * job das 05h10 quer: o dia fechado.
 */
export async function syncBatidas(dia?: string): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "batidas");
  let requisicoes = 0;

  const alvo =
    dia ??
    (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    })();

  try {
    const config = exigirConfig();
    const bruto = await secullum.batidas(config, alvo, alvo);
    requisicoes += 1;

    const lista = Array.isArray(bruto) ? bruto : [];
    const naoLidas: string[] = [];

    const linhas = lista
      .map((b) => {
        const cpf = soDigitos(campo(b, "Cpf", "cpf", "FuncionarioCpf") as string);
        const dataB = data(campo(b, "Data", "data", "DataBatida"));
        const horaB = hora(campo(b, "Hora", "hora", "Horario", "horario", "DataHora"));
        if (cpf.length !== 11 || !dataB || !horaB) {
          if (naoLidas.length < 3) naoLidas.push(JSON.stringify(b).slice(0, 200));
          return null;
        }
        const fonte = campo(b, "FonteDados", "fonteDados");
        return {
          secullum_funcionario_id: inteiro(campo(b, "FuncionarioId", "funcionarioId", "Id")),
          cpf,
          data: dataB,
          horario: horaB,
          fonte_tipo: inteiro(campo(fonte, "Tipo", "tipo") ?? campo(b, "FonteTipo")),
          fonte_origem: inteiro(campo(fonte, "Origem", "origem") ?? campo(b, "FonteOrigem")),
          equipamento: texto(campo(fonte, "Equipamento", "equipamento") ?? campo(b, "Equipamento")),
          sincronizado_em: new Date().toISOString(),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (linhas.length > 0) {
      // ignoreDuplicates: reprocessar o mesmo dia é operação normal, e
      // não pode reescrever nem duplicar o que já está lá.
      const { error } = await db
        .from("ponto_batidas")
        .upsert(linhas, { onConflict: "cpf,data,horario", ignoreDuplicates: true });
      if (error) throw new Error(`Falha ao gravar: ${error.message}`);
    }

    const detalhe =
      `dia ${alvo} · ${lista.length} vindas da API · ${linhas.length} gravadas` +
      (naoLidas.length
        ? ` · ${lista.length - linhas.length} sem CPF/data/hora reconhecíveis. ` +
          `AMOSTRA DO FORMATO NÃO LIDO (use para ajustar o mapeamento): ${naoLidas.join(" | ")}`
        : "");

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "batidas",
      registros: linhas.length,
      requisicoes,
      status: naoLidas.length ? "parcial" : "ok",
      detalhe,
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "batidas",
      registros: 0,
      requisicoes,
      status: "erro",
      detalhe: `dia ${alvo}`,
      erro: mensagem(e),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  }
}

// ------------------------------------------------------------
// Job 3 — totais
// ------------------------------------------------------------
/**
 * Uma requisição POR FUNCIONÁRIO ATIVO, um mês por vez — é o limite da
 * API. Com 20 ativos são 20 chamadas; o teto de 80/hora dá folga, mas
 * a pausa entre elas e a retomada existem porque o número de ativos
 * cresce e porque job interrompido é rotina, não exceção.
 */
export async function syncTotais(competencia?: string): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "totais");
  let requisicoes = 0;
  let gravados = 0;

  const mes = competencia ?? `${new Date().toISOString().slice(0, 7)}-01`;
  const ultimoDia = (() => {
    const d = new Date(mes);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
  })();

  try {
    const config = exigirConfig();

    // Onde parou na última execução deste mês. `retomar_de` guarda o
    // CPF seguinte ao último concluído.
    const { data: anterior } = await db
      .from("secullum_sync")
      .select("retomar_de, detalhe")
      .eq("tipo", "totais")
      .eq("status", "parcial")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    const retomarDe = (anterior as { retomar_de?: string } | null)?.retomar_de ?? null;

    const { data: ativos, error: erroAtivos } = await db
      .from("secullum_funcionarios")
      .select("cpf, nome")
      .eq("ativo", true)
      .order("cpf", { ascending: true });
    if (erroAtivos) throw new Error(`Falha ao listar ativos: ${erroAtivos.message}`);

    let fila = (ativos ?? []) as { cpf: string; nome: string }[];
    if (fila.length === 0) {
      const resultado: ResultadoSync = {
        ok: true,
        tipo: "totais",
        registros: 0,
        requisicoes,
        status: "ok",
        detalhe: "nenhum ativo em secullum_funcionarios — rode o sync de funcionários antes",
      };
      await fecharDiario(db, diario, resultado);
      return resultado;
    }
    if (retomarDe) {
      const i = fila.findIndex((f) => f.cpf >= retomarDe);
      if (i > 0) fila = fila.slice(i);
    }

    let parouEm: string | null = null;
    const naoLidos: string[] = [];

    for (const pessoa of fila) {
      if (requisicoes >= TETO_REQUISICOES_HORA) {
        parouEm = pessoa.cpf;
        break;
      }

      const relatorio = await secullum.calcularSomenteTotais(config, pessoa.cpf, mes, ultimoDia);
      requisicoes += 1;

      const linhas = extrairTotais(relatorio, pessoa.cpf, mes);
      if (linhas.length === 0 && naoLidos.length < 2) {
        naoLidos.push(JSON.stringify(relatorio).slice(0, 300));
      }
      if (linhas.length > 0) {
        const { error } = await db
          .from("ponto_totais")
          .upsert(linhas, { onConflict: "cpf,competencia,coluna" });
        if (error) throw new Error(`Falha ao gravar totais de ${pessoa.cpf}: ${error.message}`);
        gravados += linhas.length;
      }

      if (requisicoes < TETO_REQUISICOES_HORA && fila.indexOf(pessoa) < fila.length - 1) {
        await pausar(PAUSA_MS);
      }
    }

    const detalhe =
      `competência ${mes} · ${requisicoes} funcionário(s) consultado(s) · ${gravados} linha(s)` +
      (retomarDe ? ` · retomado a partir de ${retomarDe}` : "") +
      (parouEm ? ` · PAROU no teto de ${TETO_REQUISICOES_HORA}/hora, retoma em ${parouEm}` : "") +
      (naoLidos.length ? ` · relatório não reconhecido. AMOSTRA: ${naoLidos.join(" | ")}` : "");

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "totais",
      registros: gravados,
      requisicoes,
      status: parouEm || naoLidos.length ? "parcial" : "ok",
      detalhe,
      retomarDe: parouEm,
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "totais",
      registros: gravados,
      requisicoes,
      status: "erro",
      detalhe: `competência ${mes}`,
      erro: mensagem(e),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  }
}

/**
 * O retorno vem como relatório: `Colunas` (nomes) e `Linhas`/`Totais`
 * (valores). Vira linha chave-valor, com o tempo já em minutos.
 *
 * Formato ainda NÃO confirmado contra a API real — por isso a função
 * tenta três formas conhecidas e, se não reconhecer nenhuma, devolve
 * lista vazia para o job registrar a amostra em vez de gravar lixo.
 */
export function extrairTotais(
  relatorio: unknown,
  cpf: string,
  competencia: string,
): { cpf: string; competencia: string; coluna: string; valor_minutos: number }[] {
  if (!relatorio || typeof relatorio !== "object") return [];
  const r = relatorio as Registro;
  const saida: { cpf: string; competencia: string; coluna: string; valor_minutos: number }[] = [];
  const push = (coluna: string, valor: unknown) => {
    const nome = coluna.trim();
    if (!nome) return;
    saida.push({ cpf, competencia, coluna: nome, valor_minutos: paraMinutos(valor) });
  };

  const colunas = campo(r, "Colunas", "colunas");
  const totais = campo(r, "Totais", "totais");

  // Forma 1: Colunas ["Normais","Extra 60%"] + Totais ["08:00","01:30"]
  if (Array.isArray(colunas) && Array.isArray(totais) && colunas.length === totais.length) {
    colunas.forEach((c, i) => push(texto(campo(c, "Nome", "nome", "Descricao") ?? c), totais[i]));
    return saida;
  }

  // Forma 2: Totais como objeto { "Normais": "08:00", ... }
  if (totais && typeof totais === "object" && !Array.isArray(totais)) {
    for (const [k, v] of Object.entries(totais as Registro)) push(k, v);
    return saida;
  }

  // Forma 3: o próprio objeto raiz é chave-valor de horas
  const chaves = Object.keys(r).filter((k) => /^[A-Za-zÀ-ú0-9 %._-]+$/.test(k));
  for (const k of chaves) {
    const v = r[k];
    if (typeof v === "string" && /^-?\d{1,4}:\d{2}/.test(v)) push(k, v);
  }
  return saida;
}

// ------------------------------------------------------------
// Job 4 — catálogos
// ------------------------------------------------------------
/**
 * Departamentos, funções e horários mudam raramente — semanal basta.
 * Guardados como texto no espelho de funcionários; aqui a sincronização
 * serve para registrar no diário o que existe hoje do lado deles, que
 * é o insumo do De/Para com as obras do Portal.
 */
export async function syncCatalogos(): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "catalogos");
  let requisicoes = 0;

  try {
    const config = exigirConfig();
    const [departamentos, funcoes, horarios] = await Promise.all([
      secullum.departamentos(config),
      secullum.funcoes(config),
      secullum.horarios(config),
    ]);
    requisicoes += 3;

    const nomes = (lista: unknown[]) =>
      (lista ?? []).map((i) => texto(campo(i, "Descricao", "descricao", "Nome"))).filter(Boolean);

    const ativosHorario = (horarios ?? []).filter((h) => !campo(h, "Desativar", "desativar"));

    const detalhe =
      `obras (${departamentos?.length ?? 0}): ${nomes(departamentos ?? []).join(", ")} · ` +
      `funções (${funcoes?.length ?? 0}): ${nomes(funcoes ?? []).join(", ")} · ` +
      `horários ativos (${ativosHorario.length} de ${horarios?.length ?? 0}): ` +
      ativosHorario
        .map(
          (h) =>
            `${texto(campo(h, "Numero", "numero"))}=${texto(campo(h, "Descricao", "descricao"))}`,
        )
        .join(", ");

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "catalogos",
      registros: (departamentos?.length ?? 0) + (funcoes?.length ?? 0) + (horarios?.length ?? 0),
      requisicoes,
      status: "ok",
      detalhe,
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "catalogos",
      registros: 0,
      requisicoes,
      status: "erro",
      detalhe: "",
      erro: mensagem(e),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  }
}

export const JOBS: Record<TipoSync, () => Promise<ResultadoSync>> = {
  funcionarios: syncFuncionarios,
  batidas: () => syncBatidas(),
  totais: () => syncTotais(),
  catalogos: syncCatalogos,
};
