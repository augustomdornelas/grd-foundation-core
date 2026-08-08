// Helpers de formatação. Dados reais vêm do Supabase — não usar seeds aqui.
export function brl(n: number) {
  // Rede de segurança: null/undefined/NaN/Infinity chegando de uma conta
  // com dado ruim não pode virar "NaN" na tela nem quebrar o render.
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
