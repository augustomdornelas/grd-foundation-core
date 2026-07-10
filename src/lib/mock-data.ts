// Helpers de formatação. Dados reais vêm do Supabase — não usar seeds aqui.
export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
