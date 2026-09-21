// Formatadores compartilhados pelas abas de EPIs. Viviam dentro de
// app.epis.tsx; com as abas em arquivos separados, fmtBr passou a ser
// usado por Entregas, Compras e Catálogo.

/** Data ISO para dd/mm/aaaa. Sem data vira travessão, e não vazio. */
export function fmtBr(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

// ------------------------------------------------------------
// Data digitada em DD/MM/AAAA (input type="text", e não type="date",
// que mostraria o formato do navegador).
// ------------------------------------------------------------

/** Máscara enquanto digita: só dígitos, barras nos lugares certos. */
export function mascaraDataBr(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * DD/MM/AAAA -> AAAA-MM-DD. Devolve null se a data não existe: 31/02,
 * 00/05, 15/13 e ano com menos de 4 dígitos são recusados. Quem confere
 * é o próprio Date — 31/02 viraria 03/03, e aí os campos não batem.
 */
export function dataBrParaIso(br: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (ano < 1900 || mes < 1 || mes > 12 || dia < 1) return null;
  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Date local -> DD/MM/AAAA (sem passar por UTC, que muda o dia à noite). */
export function dataLocalBr(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
