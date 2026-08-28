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
import { campo, texto, descricao, inteiro, data, hora, paraMinutos } from "@/lib/secullum-formato";
import {
  lerConfig,
  secullum,
  SecullumErro,
  verificarLicenca,
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
// Mudaram de casa para secullum-formato.ts quando a carga inicial
// passou a precisar das mesmas: duas cópias de `campo()` seriam dois
// lugares para o mapeamento divergir em silêncio.
type Registro = Record<string, unknown>;

// Reexportado porque o mapeamento de `/Calcular/SomenteTotais` ainda
// não foi confirmado contra a API real, e quem for ajustá-lo espera
// achar a conversão de horas ao lado de `extrairTotais`.
export { paraMinutos };

/**
 * A escala semanal do horário, normalizada para um item por dia.
 *
 * A Secullum não publica o contrato do campo Dias: ora vem array, ora
 * objeto indexado, ora string separada por vírgula. Em vez de apostar
 * num formato e quebrar quando vier outro, esta função aceita os três
 * e devolve array vazio quando não reconhece — e array vazio tem
 * significado próprio na tela ("escala desconhecida"), diferente de
 * uma escala que simplesmente não trabalha naquele dia.
 */
export function escalaDeDias(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((d) => texto(d).trim());
  if (typeof v === "string") {
    return v
      .split(/[;,|]/)
      .map((d) => d.trim())
      .filter(Boolean);
  }
  if (v && typeof v === "object") {
    return Object.values(v).map((d) => texto(d).trim());
  }
  return [];
}

// ------------------------------------------------------------
// Diário do job
// ------------------------------------------------------------
export type TipoSync =
  | "funcionarios"
  | "batidas"
  | "totais"
  | "catalogos"
  | "afastamentos"
  | "pendencias";

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
        const cpf = soDigitos(texto(campo(f, "Cpf", "cpf")));
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
          // Departamento e função podem vir como id, como texto ou como
          // objeto { Id, Descricao }, dependendo do endpoint e do
          // registro. `descricao()` tira o texto de qualquer um dos
          // três — com `texto()` puro, a terceira forma gravava
          // "[object Object]" aqui também, e não só na carga inicial.
          departamento: descricao(
            campo(f, "DepartamentoDescricao", "Departamento", "departamento", "DepartamentoId"),
          ),
          funcao: descricao(campo(f, "FuncaoDescricao", "Funcao", "funcao", "FuncaoId")),
          horario_numero: inteiro(campo(f, "HorarioNumero", "HorarioId", "horarioId")),
          nascimento: data(campo(f, "Nascimento", "nascimento", "DataNascimento")),
          // A Secullum manda Masculino: true|false, que nao tem como
          // dizer "nao informado". Ausente vira string vazia em vez de
          // virar "F" por eliminacao.
          sexo: ((): string => {
            const m = campo(f, "Masculino", "masculino");
            if (m === true) return "M";
            if (m === false) return "F";
            return "";
          })(),
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
        const cpf = soDigitos(texto(campo(b, "Cpf", "cpf", "FuncionarioCpf")));
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
    colunas.forEach((c, i) => push(descricao(campo(c, "Nome", "nome", "Descricao") ?? c), totais[i]));
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
    const [departamentos, funcoes, horarios, licenca] = await Promise.all([
      secullum.departamentos(config),
      secullum.funcoes(config),
      secullum.horarios(config),
      // A ocupação do plano entra no job de catálogos e não num job
      // próprio porque muda na mesma frequência: quando alguém é
      // admitido ou demitido. Um job só para ela gastaria uma janela de
      // requisição por dia para ler dois números.
      verificarLicenca(config).catch(() => null),
    ]);
    requisicoes += 4;

    const nomes = (lista: unknown[]) =>
      (lista ?? []).map((i) => descricao(campo(i, "Descricao", "descricao", "Nome"))).filter(Boolean);

    const ativosHorario = (horarios ?? []).filter((h) => !campo(h, "Desativar", "desativar"));

    // O catalogo de horarios deixou de ser so linha de log e virou
    // tabela: e a escala que separa "esta de folga" de "faltou". Sem
    // ela, quem nao bateu ponto num domingo entraria como faltante.
    //
    // Obras e funcoes continuam sem tabela propria de proposito: elas
    // ja chegam por extenso dentro de secullum_funcionarios, e uma
    // segunda copia so criaria um lugar a mais para divergir.
    const linhasHorario = (horarios ?? [])
      .map((h) => {
        const numero = inteiro(campo(h, "Numero", "numero"));
        if (numero === null) return null;
        return {
          numero,
          descricao: descricao(campo(h, "Descricao", "descricao")),
          dias: escalaDeDias(campo(h, "Dias", "dias")),
          desativar: campo(h, "Desativar", "desativar") === true,
          sincronizado_em: new Date().toISOString(),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (linhasHorario.length > 0) {
      const { error: erroHorario } = await db
        .from("secullum_horarios")
        .upsert(linhasHorario, { onConflict: "numero" });
      if (erroHorario) throw new Error(`Falha ao gravar horarios: ${erroHorario.message}`);
    }

    const detalhe =
      `obras (${departamentos?.length ?? 0}): ${nomes(departamentos ?? []).join(", ")} · ` +
      `funções (${funcoes?.length ?? 0}): ${nomes(funcoes ?? []).join(", ")} · ` +
      `horários ativos (${ativosHorario.length} de ${horarios?.length ?? 0}, ` +
      `${linhasHorario.filter((h) => h.dias.length > 0).length} com escala conhecida): ` +
      ativosHorario
        .map(
          (h) =>
            `${texto(campo(h, "Numero", "numero"))}=${descricao(campo(h, "Descricao", "descricao"))}`,
        )
        .join(", ");

    // Falha aqui não derruba o job: catálogo sincronizado com licença
    // velha é melhor que catálogo nenhum, e o tile mostra a idade.
    if (licenca && (licenca.limite !== null || licenca.emUso !== null)) {
      await db.from("secullum_licenca").upsert(
        {
          id: true,
          limite: licenca.limite,
          em_uso: licenca.emUso,
          sincronizado_em: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }

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

// ------------------------------------------------------------
// Job 5 — afastamentos
// ------------------------------------------------------------
/**
 * Férias, atestado e licença. É o que enche três tiles da faixa de
 * hoje, e sem ele os três teriam que mostrar zero — que é uma
 * afirmação, não uma ausência: "ninguém está de férias".
 *
 * NÃO classifica na gravação. A justificativa entra como veio, em
 * texto livre, e a separação entre férias / afastamento / ausência
 * justificada acontece na leitura. Classificar aqui congelaria a regra
 * dentro de um job de madrugada: mudá-la exigiria re-sincronizar tudo,
 * e o histórico já gravado continuaria com a regra velha.
 *
 * O formato do endpoint NÃO foi confirmado contra a conta da GRD. Por
 * isso a leitura é tolerante e o job conta quantos registros não soube
 * ler, em vez de gravar linha vazia.
 */
export async function syncAfastamentos(): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "afastamentos");
  let requisicoes = 0;

  try {
    const config = exigirConfig();
    const lista = await secullum.afastamentos(config);
    requisicoes += 1;

    let ignorados = 0;
    const linhas = (lista ?? [])
      .map((a) => {
        const cpf = soDigitos(texto(campo(a, "Cpf", "cpf", "FuncionarioCpf")));
        const inicio = data(campo(a, "DataInicio", "dataInicio", "Inicio", "inicio"));
        // Sem CPF ou sem início não há como situar o afastamento na
        // pessoa nem no tempo: a linha não diria nada.
        if (cpf.length !== 11 || !inicio) {
          ignorados += 1;
          return null;
        }
        return {
          secullum_id: inteiro(campo(a, "Id", "id", "FuncionarioId")),
          cpf,
          justificativa: descricao(
            campo(a, "Justificativa", "justificativa", "Descricao", "Tipo", "tipo"),
          ),
          inicio,
          fim: data(campo(a, "DataFim", "dataFim", "Fim", "fim")),
          observacao: descricao(campo(a, "Observacao", "observacao", "Observacoes")),
          sincronizado_em: new Date().toISOString(),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (linhas.length > 0) {
      const { error } = await db
        .from("secullum_afastamentos")
        .upsert(linhas, { onConflict: "cpf,inicio,justificativa" });
      if (error) throw new Error(`Falha ao gravar: ${error.message}`);
    }

    const hoje = new Date().toISOString().slice(0, 10);
    const vigentes = linhas.filter((l) => l.inicio <= hoje && (!l.fim || l.fim >= hoje)).length;

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "afastamentos",
      registros: linhas.length,
      requisicoes,
      status: ignorados ? "parcial" : "ok",
      detalhe:
        `${linhas.length} afastamento(s) · ${vigentes} vigente(s) hoje` +
        (ignorados ? ` · ${ignorados} ignorado(s) por falta de CPF ou de data de início` : ""),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "afastamentos",
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
// Job 6 — pendências de inclusão de ponto
// ------------------------------------------------------------
/**
 * A fila de trabalho do DP: batida esquecida que alguém pediu para
 * incluir e ninguém aprovou ainda.
 *
 * Este é o único job que APAGA antes de gravar, e a diferença importa.
 * Os outros espelham fatos que não deixam de ter acontecido — uma
 * batida de terça continua tendo existido. Pendência é o contrário:
 * existe enquanto está na fila e some quando alguém aprova. Um upsert
 * deixaria pendência aprovada há três meses contando como pendente
 * para sempre, e o tile mentiria para cima.
 */
export async function syncPendencias(): Promise<ResultadoSync> {
  const db = supabaseAdmin();
  const diario = await abrirDiario(db, "pendencias");
  let requisicoes = 0;

  try {
    const config = exigirConfig();
    const lista = await secullum.pendencias(config);
    requisicoes += 1;

    let ignorados = 0;
    const linhas = (lista ?? [])
      .map((p) => {
        const cpf = soDigitos(texto(campo(p, "Cpf", "cpf", "FuncionarioCpf")));
        if (cpf.length !== 11) {
          ignorados += 1;
          return null;
        }
        return {
          secullum_id: inteiro(campo(p, "Id", "id")),
          cpf,
          data_referencia: data(campo(p, "Data", "data", "DataBatida")),
          tipo: descricao(campo(p, "Tipo", "tipo", "TipoSolicitacao")),
          descricao: descricao(campo(p, "Descricao", "descricao", "Justificativa", "Motivo")),
          solicitado_em: (() => {
            const t = texto(campo(p, "SolicitadoEm", "solicitadoEm", "DataSolicitacao")).trim();
            if (!t) return null;
            const d = new Date(t);
            return Number.isNaN(d.getTime()) ? null : d.toISOString();
          })(),
          sincronizado_em: new Date().toISOString(),
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    // Esvaziar e regravar, nesta ordem. Se a gravação falhar depois do
    // delete, a tabela fica vazia — e vazia é o estado honesto: a tela
    // mostra a idade do dado e o job entra como erro no diário. O
    // contrário, manter a fila velha, passaria por dado bom.
    const { error: erroLimpeza } = await db
      .from("secullum_pendencias")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (erroLimpeza) throw new Error(`Falha ao limpar a fila: ${erroLimpeza.message}`);

    if (linhas.length > 0) {
      const { error } = await db
        .from("secullum_pendencias")
        .upsert(linhas, { onConflict: "cpf,data_referencia,tipo,descricao" });
      if (error) throw new Error(`Falha ao gravar: ${error.message}`);
    }

    const resultado: ResultadoSync = {
      ok: true,
      tipo: "pendencias",
      registros: linhas.length,
      requisicoes,
      status: ignorados ? "parcial" : "ok",
      detalhe:
        `${linhas.length} solicitação(ões) na fila` +
        (ignorados ? ` · ${ignorados} ignorada(s) por CPF inválido` : ""),
    };
    await fecharDiario(db, diario, resultado);
    return resultado;
  } catch (e) {
    const resultado: ResultadoSync = {
      ok: false,
      tipo: "pendencias",
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
  afastamentos: syncAfastamentos,
  pendencias: syncPendencias,
};
