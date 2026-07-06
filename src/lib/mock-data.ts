export const orcamentos = [
  { id: "ORC-2041", cliente: "Vale Verde Logística", obra: "Galpão Industrial Fase 2", valor: 4_820_000, data: "2026-06-14", status: "Aprovado", responsavel: "Usuário Demo 1" },
  { id: "ORC-2042", cliente: "Construtora Aurora", obra: "Edifício Corporativo", valor: 2_340_000, data: "2026-06-18", status: "Em análise", responsavel: "Usuário Demo 2" },
  { id: "ORC-2043", cliente: "Prefeitura de Ubatuba", obra: "Escola Municipal", valor: 1_180_000, data: "2026-06-22", status: "Enviado", responsavel: "Usuário Demo 1" },
  { id: "ORC-2044", cliente: "AutoTech Indústria", obra: "Ampliação Fábrica", valor: 6_950_000, data: "2026-06-25", status: "Aprovado", responsavel: "Usuário Demo 3" },
  { id: "ORC-2045", cliente: "Hospital Norte", obra: "Reforma Ala B", valor: 890_000, data: "2026-06-28", status: "Recusado", responsavel: "Usuário Demo 2" },
  { id: "ORC-2046", cliente: "Grupo Águas Claras", obra: "Condomínio Residencial", valor: 3_420_000, data: "2026-07-01", status: "Em análise", responsavel: "Usuário Demo 3" },
  { id: "ORC-2047", cliente: "BR-Sul Concessão", obra: "Passarela Km 128", valor: 720_000, data: "2026-07-03", status: "Aprovado", responsavel: "Usuário Demo 1" },
];

export const comercialSerie = [
  { mes: "Jan", valor: 3200000 },
  { mes: "Fev", valor: 2800000 },
  { mes: "Mar", valor: 4100000 },
  { mes: "Abr", valor: 3900000 },
  { mes: "Mai", valor: 5200000 },
  { mes: "Jun", valor: 6100000 },
  { mes: "Jul", valor: 4700000 },
];

export const comercialStatus = [
  { name: "Aprovado", value: 42, color: "#16A34A" },
  { name: "Em análise", value: 28, color: "#F59E0B" },
  { name: "Enviado", value: 18, color: "#213368" },
  { name: "Recusado", value: 12, color: "#DC2626" },
];

export const projetos = [
  { id: "P-001", nome: "Galpão Industrial Fase 2", cliente: "Vale Verde", status: "Em andamento", progresso: 62, financeiro: 58 },
  { id: "P-002", nome: "Edifício Corporativo Aurora", cliente: "Aurora", status: "Em andamento", progresso: 34, financeiro: 30 },
  { id: "P-003", nome: "Escola Municipal Ubatuba", cliente: "Prefeitura Ubatuba", status: "Planejamento", progresso: 8, financeiro: 5 },
  { id: "P-004", nome: "Ampliação Fábrica AutoTech", cliente: "AutoTech", status: "Em andamento", progresso: 78, financeiro: 74 },
  { id: "P-005", nome: "Condomínio Águas Claras", cliente: "Grupo AC", status: "Concluído", progresso: 100, financeiro: 100 },
  { id: "P-006", nome: "Passarela BR-Sul Km 128", cliente: "BR-Sul", status: "Em andamento", progresso: 45, financeiro: 42 },
];

export const projetoFinanceiro = [
  { mes: "Jan", previsto: 400000, realizado: 380000 },
  { mes: "Fev", previsto: 500000, realizado: 470000 },
  { mes: "Mar", previsto: 620000, realizado: 640000 },
  { mes: "Abr", previsto: 700000, realizado: 690000 },
  { mes: "Mai", previsto: 820000, realizado: 780000 },
  { mes: "Jun", previsto: 900000, realizado: 870000 },
];

export const equipamentos = [
  { id: "EQ-101", nome: "Escavadeira CAT 320", codigo: "CAT-320-01", status: "Emprestado", local: "Obra Vale Verde", custo: 4500 },
  { id: "EQ-102", nome: "Betoneira 400L", codigo: "BET-400-03", status: "Disponível", local: "Almoxarifado SP", custo: 350 },
  { id: "EQ-103", nome: "Andaime Multidirecional", codigo: "AND-MD-12", status: "Emprestado", local: "Obra Aurora", custo: 890 },
  { id: "EQ-104", nome: "Compactador Wacker", codigo: "WKR-05", status: "Manutenção", local: "Oficina Central", custo: 620 },
  { id: "EQ-105", nome: "Gerador 60kVA", codigo: "GEN-60-02", status: "Emprestado", local: "Obra AutoTech", custo: 1200 },
  { id: "EQ-106", nome: "Guindaste Móvel 25t", codigo: "GRD-25-01", status: "Disponível", local: "Almoxarifado SP", custo: 8900 },
];

export const usuarios = [
  { id: 1, nome: "Usuário Demo 1", email: "demo1@exemplo.com", perfil: "Administrador", status: "Ativo" },
  { id: 2, nome: "Usuário Demo 2", email: "demo2@exemplo.com", perfil: "Comercial", status: "Ativo" },
  { id: 3, nome: "Usuário Demo 3", email: "demo3@exemplo.com", perfil: "Comercial", status: "Ativo" },
  { id: 4, nome: "Usuário Demo 4", email: "demo4@exemplo.com", perfil: "Projetos", status: "Ativo" },
  { id: 5, nome: "Usuário Demo 5", email: "demo5@exemplo.com", perfil: "Almoxarifado", status: "Inativo" },
];

export const emails = [
  { id: 1, de: "financeiro@cliente-exemplo.com", assunto: "Aprovação do orçamento ORC-2041", preview: "Boa tarde. Segue em anexo a aprovação...", data: "10:24", nao_lido: true },
  { id: 2, de: "obras@cliente-exemplo.com", assunto: "Cronograma revisado — Edifício Aurora", preview: "Conforme conversamos, encaminho o cronograma revisto...", data: "09:12", nao_lido: true },
  { id: 3, de: "compras@exemplo.com", assunto: "Cotações fechadas — insumos julho", preview: "Todas as cotações foram concluídas dentro do prazo...", data: "Ontem", nao_lido: false },
  { id: 4, de: "rh@exemplo.com", assunto: "Treinamento NR-35", preview: "Lembramos que o treinamento será realizado na próxima...", data: "Ontem", nao_lido: false },
  { id: 5, de: "diretoria@exemplo.com", assunto: "Reunião mensal de resultados", preview: "Segue convocação para a reunião mensal de resultados...", data: "Seg", nao_lido: false },
];

export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
