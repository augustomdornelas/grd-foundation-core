const map: Record<string, string> = {
  // Comercial — status de orçamentos
  "Levantamento": "bg-gray-100 text-gray-700 border-gray-200",
  "Aguardando Retorno": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Em negociação": "bg-blue-100 text-blue-700 border-blue-200",
  "Não aprovado": "bg-red-100 text-red-700 border-red-200",
  "Cancelado": "bg-slate-700 text-white border-slate-700",
  "Aprovado": "bg-green-100 text-green-700 border-green-200",

  // Compatibilidade / outros módulos
  "Enviado": "bg-blue-100 text-blue-700 border-blue-200",
  "Planejamento": "bg-amber-100 text-amber-800 border-amber-200",
  "Concluído": "bg-green-100 text-green-700 border-green-200",
  "Disponível": "bg-green-100 text-green-700 border-green-200",
  "Emprestado": "bg-[#213368] text-white border-[#213368]",
  "Em uso": "bg-[#213368] text-white border-[#213368]",
  "Devolvido": "bg-green-100 text-green-700 border-green-200",
  "Atrasado": "bg-red-100 text-red-700 border-red-200",
  "Manutenção": "bg-amber-100 text-amber-800 border-amber-200",
  "Ativo": "bg-green-100 text-green-700 border-green-200",
  "Inativo": "bg-muted text-muted-foreground border-border",
  "Paralisado": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Pago": "bg-green-100 text-green-700 border-green-200",
  "Pendente": "bg-amber-100 text-amber-800 border-amber-200",
  "Aprovada": "bg-green-100 text-green-700 border-green-200",
  "Enviada": "bg-blue-100 text-blue-700 border-blue-200",
  "Em análise": "bg-amber-100 text-amber-800 border-amber-200",
  "Aberta": "bg-amber-100 text-amber-800 border-amber-200",
  "Em andamento": "bg-blue-100 text-blue-700 border-blue-200",
  "Concluída": "bg-green-100 text-green-700 border-green-200",
  "Preventiva": "bg-blue-100 text-blue-700 border-blue-200",
  "Corretiva": "bg-amber-100 text-amber-800 border-amber-200",
  "Emergencial": "bg-red-100 text-red-700 border-red-200",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  const label = status === "Emprestado" ? "Alugado" : status;
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
