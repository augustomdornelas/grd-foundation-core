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
