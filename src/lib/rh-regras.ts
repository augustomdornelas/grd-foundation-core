// ============================================================
// Regras do módulo de RH que a tela precisa conhecer
// ------------------------------------------------------------
// Funções puras, sem Supabase: rótulos, semáforo de dias parados,
// validação de CPF e leitura das NRs declaradas pelo candidato.
//
// O semáforo é calculado no banco (vw_rh_funil.semaforo). O que está
// aqui é a MESMA conta, para o card que acabou de ser arrastado poder
// mostrar o estado novo antes do refetch. Se as duas discordarem, a
// do banco é a certa.
// ============================================================

export type Semaforo = "neutro" | "alerta" | "critico";

/** Mínimo de caracteres da nota, sem contar espaços. Igual ao CHECK do banco. */
export const NOTA_MIN_CARACTERES = 5;

export function notaValida(texto: string): boolean {
  return texto.replace(/\s/g, "").length >= NOTA_MIN_CARACTERES;
}

/**
 * Dias corridos entre a data informada e hoje, zerando a hora dos dois
 * lados — senão "ontem às 23h" viraria 0 dia.
 *
 * Existe um gêmeo desta função em orcamento-notas.ts, do funil
 * comercial. Não foram unificadas de propósito nesta etapa: mexer no
 * módulo do comercial não é escopo do RH.
 */
export function diasCorridosDesde(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((hoje.getTime() - d.getTime()) / 86_400_000));
}

/**
 * Até o SLA, neutro. Do SLA ao dobro, amarelo. Acima do dobro, vermelho.
 * Etapa final não tem semáforo: candidato contratado ou reprovado não
 * está "parado", está resolvido.
 */
export function semaforoDaEtapa(dias: number, slaDias: number, tipoEtapa: string): Semaforo {
  if (tipoEtapa !== "inicial" && tipoEtapa !== "intermediaria") return "neutro";
  if (!slaDias || slaDias <= 0) return "neutro";
  if (dias <= slaDias) return "neutro";
  if (dias <= slaDias * 2) return "alerta";
  return "critico";
}

export const SEMAFORO_ESTILO: Record<Semaforo, { chip: string; ponto: string; titulo: string }> = {
  neutro: {
    chip: "bg-muted text-muted-foreground",
    ponto: "bg-muted-foreground/40",
    titulo: "Dentro do prazo da etapa",
  },
  alerta: {
    chip: "bg-amber-100 text-amber-800",
    ponto: "bg-amber-500",
    titulo: "Passou do prazo da etapa",
  },
  critico: {
    chip: "bg-red-100 text-red-800",
    ponto: "bg-red-600",
    titulo: "Parado há mais que o dobro do prazo da etapa",
  },
};

export function rotuloDias(dias: number): string {
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

// ------------------------------------------------------------
// CPF
// ------------------------------------------------------------
/** Mesma conta de public.rh_cpf_valido. Vazio passa: nem todo candidato deixa CPF. */
export function cpfValido(cpf: string): boolean {
  const v = (cpf ?? "").replace(/\D/g, "");
  if (!v) return true;
  if (v.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(v)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += Number(v[i]) * (10 - i);
  let d1 = 11 - (s % 11);
  if (d1 >= 10) d1 = 0;
  s = 0;
  for (let i = 0; i < 10; i++) s += Number(v[i]) * (11 - i);
  let d2 = 11 - (s % 11);
  if (d2 >= 10) d2 = 0;
  return d1 === Number(v[9]) && d2 === Number(v[10]);
}

export function apenasDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

/** Máscara progressiva, para o campo aceitar digitação parcial. */
export function formatarCpf(v: string): string {
  const d = apenasDigitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarTelefone(v: string): string {
  const d = apenasDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

// ------------------------------------------------------------
// NRs declaradas pelo candidato
// ------------------------------------------------------------
export type NrDeclarada = { nr: string; validade: string | null; valida: boolean };

/**
 * `rh_candidatos.nrs_declaradas` é jsonb livre porque vem do formulário
 * público. Aqui ele vira lista tipada, ignorando o que não tiver nome
 * de NR — e o que o candidato declara continua sendo declaração, não
 * documento: só vira documento quando o RH confere na admissão.
 */
export function lerNrsDeclaradas(bruto: unknown): NrDeclarada[] {
  if (!Array.isArray(bruto)) return [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return bruto
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      const nr = String(o.nr ?? "")
        .trim()
        .toUpperCase();
      if (!nr) return null;
      const validade = o.validade ? String(o.validade).slice(0, 10) : null;
      const valida = validade ? new Date(`${validade}T00:00:00`) >= hoje : true;
      return { nr, validade, valida };
    })
    .filter((x): x is NrDeclarada => x !== null);
}

export function temNrDeclarada(bruto: unknown, nr: string): boolean {
  const alvo = nr.trim().toUpperCase();
  return lerNrsDeclaradas(bruto).some((n) => n.nr === alvo && n.valida);
}

// ------------------------------------------------------------
// Rótulos — os valores no banco são minúsculos e com underline
// ------------------------------------------------------------
export const VAGA_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovada: "Aprovada",
  publicada: "Publicada",
  congelada: "Congelada",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};

export const VAGA_STATUS_ESTILO: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aguardando_aprovacao: "bg-amber-100 text-amber-800",
  aprovada: "bg-sky-100 text-sky-800",
  publicada: "bg-emerald-100 text-emerald-800",
  congelada: "bg-slate-200 text-slate-700",
  encerrada: "bg-slate-100 text-slate-500",
  cancelada: "bg-red-100 text-red-700",
};

export const CANDIDATURA_STATUS_LABEL: Record<string, string> = {
  em_andamento: "Em andamento",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  desistiu: "Desistiu",
  contratado: "Contratado",
  banco_talentos: "Banco de talentos",
};

export const CANDIDATO_STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  em_processo: "Em processo",
  contratado: "Contratado",
  banco_talentos: "Banco de talentos",
  descartado: "Descartado",
  nao_disponivel: "Não disponível",
};

export const TIPO_CONTRATACAO_LABEL: Record<string, string> = {
  clt: "CLT",
  temporario: "Temporário",
  experiencia: "Experiência",
  estagio: "Estágio",
  pj: "PJ",
  terceirizado: "Terceirizado",
};

export const MOTIVO_ABERTURA_LABEL: Record<string, string> = {
  aumento_quadro: "Aumento de quadro",
  substituicao: "Substituição",
  nova_obra: "Nova obra",
  temporario: "Temporário",
};

export const DISPONIBILIDADE_LABEL: Record<string, string> = {
  imediata: "Imediata",
  "15_dias": "15 dias",
  "30_dias": "30 dias",
  a_combinar: "A combinar",
};

export const ORIGEM_LABEL: Record<string, string> = {
  site: "Site",
  indicacao: "Indicação",
  whatsapp: "WhatsApp",
  banco_talentos: "Banco de talentos",
  agencia: "Agência",
  mural: "Mural",
  cadastro_interno: "Cadastro interno",
};

export const AVALIACAO_TIPO_LABEL: Record<string, string> = {
  triagem: "Triagem",
  entrevista_rh: "Entrevista RH",
  entrevista_tecnica: "Entrevista técnica",
  teste_pratico: "Teste prático",
  dinamica: "Dinâmica",
};

export const RECOMENDACAO_LABEL: Record<string, string> = {
  aprovar: "Aprovar",
  talvez: "Talvez",
  reprovar: "Reprovar",
};

export const RECOMENDACAO_ESTILO: Record<string, string> = {
  aprovar: "bg-emerald-100 text-emerald-800",
  talvez: "bg-amber-100 text-amber-800",
  reprovar: "bg-red-100 text-red-700",
};

/** Critérios padrão do parecer de entrevista, na ordem em que aparecem. */
export const CRITERIOS_PADRAO = [
  "Experiência",
  "Técnica",
  "Segurança",
  "Comunicação",
  "Disponibilidade",
] as const;

export type CriterioNota = { criterio: string; nota: number };

/** Média simples dos critérios preenchidos, na escala 0–10. */
export function mediaCriterios(criterios: CriterioNota[]): number | null {
  const validos = criterios.filter((c) => Number.isFinite(c.nota) && c.nota > 0);
  if (validos.length === 0) return null;
  const soma = validos.reduce((acc, c) => acc + c.nota, 0);
  return Math.round((soma / validos.length) * 10) / 10;
}

/** Nota 0–10 do parecer vira score 0–100 da candidatura. */
export function scoreDeNota(nota: number | null): number | null {
  if (nota === null) return null;
  return Math.max(0, Math.min(100, Math.round(nota * 10)));
}

/** Data ISO (yyyy-mm-dd ou timestamp) em pt-BR, sem quebrar com nulo. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function dataHoraBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// ------------------------------------------------------------
// Papel do usuário dentro do módulo
// ------------------------------------------------------------
export type PapelRh = {
  direcao: boolean;
  editaRh: boolean;
  leRh: boolean;
  gestor: boolean;
  almoxarifado: boolean;
  veRemuneracao: boolean;
};

/**
 * Espelho, em TypeScript, das funções rh_pode_editar / rh_pode_ler /
 * rh_e_gestor do banco. Serve para a tela não oferecer um botão que a
 * RLS vai recusar — não é o que garante a regra. Quem garante é o banco.
 *
 * "projetos" conta como Engenharia enquanto as contas antigas não forem
 * reclassificadas, igual ao que a migration faz.
 */
export function papelRh(perfil: string): PapelRh {
  const p = (perfil ?? "").trim().toLowerCase();
  const direcao = ["administrador", "admin", "diretoria"].includes(p);
  const editaRh = direcao || p === "rh";
  return {
    direcao,
    editaRh,
    leRh: editaRh || p === "administrativo",
    gestor: ["engenharia", "projetos"].includes(p),
    almoxarifado: p === "almoxarifado",
    veRemuneracao: editaRh,
  };
}

export function iniciaisDoNome(nome: string): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
