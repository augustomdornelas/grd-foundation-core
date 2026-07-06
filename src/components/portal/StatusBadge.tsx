const map: Record<string, string> = {
  "Aprovado": "bg-green-100 text-green-700 border-green-200",
  "Em análise": "bg-amber-100 text-amber-800 border-amber-200",
  "Enviado": "bg-blue-100 text-blue-700 border-blue-200",
  "Recusado": "bg-red-100 text-red-700 border-red-200",
  "Em andamento": "bg-blue-100 text-blue-700 border-blue-200",
  "Planejamento": "bg-amber-100 text-amber-800 border-amber-200",
  "Concluído": "bg-green-100 text-green-700 border-green-200",
  "Disponível": "bg-green-100 text-green-700 border-green-200",
  "Emprestado": "bg-amber-100 text-amber-800 border-amber-200",
  "Manutenção": "bg-red-100 text-red-700 border-red-200",
  "Ativo": "bg-green-100 text-green-700 border-green-200",
  "Inativo": "bg-muted text-muted-foreground border-border",
  "Paralisado": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Pago": "bg-green-100 text-green-700 border-green-200",
  "Pendente": "bg-amber-100 text-amber-800 border-amber-200",
  "Cancelado": "bg-red-100 text-red-700 border-red-200",
  "Aprovada": "bg-green-100 text-green-700 border-green-200",
  "Enviada": "bg-blue-100 text-blue-700 border-blue-200",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = map[status] ?? "bg-muted text-muted-foreground border-border";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{status}</span>;
}
