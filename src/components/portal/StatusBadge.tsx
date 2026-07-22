const map: Record<string, string> = {
  // Comercial — status de orçamentos
  "LEVANTAMENTO": "bg-gray-100 text-gray-700 border-gray-200",
  "AGUARDANDO RETORNO": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "EM NEGOCIAÇÃO": "bg-blue-100 text-blue-700 border-blue-200",
  "NÃO APROVADO": "bg-red-100 text-red-700 border-red-200",
  "CANCELADO": "bg-slate-700 text-white border-slate-700",
  "APROVADO": "bg-green-100 text-green-700 border-green-200",

  // Compatibilidade / outros módulos
  "ENVIADO": "bg-blue-100 text-blue-700 border-blue-200",
  "PLANEJAMENTO": "bg-amber-100 text-amber-800 border-amber-200",
  "CONCLUÍDO": "bg-green-100 text-green-700 border-green-200",
  "DISPONÍVEL": "bg-green-100 text-green-700 border-green-200",
  "ALUGADO": "bg-[#213368] text-white border-[#213368]",
  "EM USO": "bg-[#213368] text-white border-[#213368]",
  "DEVOLVIDO": "bg-green-100 text-green-700 border-green-200",
  "ATRASADO": "bg-red-100 text-red-700 border-red-200",
  "MANUTENÇÃO": "bg-amber-100 text-amber-800 border-amber-200",
  "ATIVO": "bg-green-100 text-green-700 border-green-200",
  "INATIVO": "bg-muted text-muted-foreground border-border",
  "PARALISADO": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "PAUSADO": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "PAGO": "bg-green-100 text-green-700 border-green-200",
  "PAGA": "bg-green-100 text-green-700 border-green-200",
  "PENDENTE": "bg-amber-100 text-amber-800 border-amber-200",
  "APROVADA": "bg-green-100 text-green-700 border-green-200",
  "ENVIADA": "bg-blue-100 text-blue-700 border-blue-200",
  "CANCELADA": "bg-slate-700 text-white border-slate-700",
  "EM ANÁLISE": "bg-amber-100 text-amber-800 border-amber-200",
  "ABERTA": "bg-amber-100 text-amber-800 border-amber-200",
  "EM ANDAMENTO": "bg-blue-100 text-blue-700 border-blue-200",
  "CONCLUÍDA": "bg-green-100 text-green-700 border-green-200",
  "PREVENTIVA": "bg-blue-100 text-blue-700 border-blue-200",
  "CORRETIVA": "bg-amber-100 text-amber-800 border-amber-200",
  "EMERGENCIAL": "bg-red-100 text-red-700 border-red-200",
  "LANÇADA": "bg-blue-100 text-blue-700 border-blue-200",
  "RECEBIDA": "bg-green-100 text-green-700 border-green-200",
  "PREVISTA": "bg-amber-100 text-amber-800 border-amber-200",
  "EM APROVAÇÃO": "bg-amber-100 text-amber-800 border-amber-200",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status ?? "").toString().toUpperCase();
  const cls = map[key] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{key}</span>;
}
