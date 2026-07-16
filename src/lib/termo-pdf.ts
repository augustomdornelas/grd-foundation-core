import { jsPDF } from "jspdf";
import logoAsset from "@/assets/logo_grd.jpeg.asset.json";

const NAVY: [number, number, number] = [33, 51, 104];
const ORANGE: [number, number, number] = [243, 112, 50];
const GREY_BG: [number, number, number] = [244, 244, 244];
const GREY_LINE: [number, number, number] = [210, 210, 215];
const TEXT_DARK: [number, number, number] = [40, 40, 45];
const TEXT_MUTED: [number, number, number] = [110, 110, 120];
const WHITE: [number, number, number] = [255, 255, 255];

let logoDataUrl: string | null = null;
let logoDims: { w: number; h: number } | null = null;

async function getLogoDataUrl(): Promise<{ url: string; w: number; h: number } | null> {
  if (logoDataUrl && logoDims) return { url: logoDataUrl, ...logoDims };
  try {
    const res = await fetch(logoAsset.url, { cache: "force-cache" });
    if (!res.ok) throw new Error("bad status");
    const blob = await res.blob();
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = url;
    });
    logoDataUrl = url;
    logoDims = dims;
    return { url, ...dims };
  } catch {
    return null;
  }
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type TermoTipo = "emprestimo" | "devolucao";

export interface TermoData {
  tipo: TermoTipo;
  numero: string;
  emissao: string;
  equipamento: {
    nome: string;
    codigo: string;
    categoria: string;
    descricao?: string;
  };
  destino?: string;
  responsavel?: string;
  responsavelCpf?: string;
  responsavelRg?: string;
  responsavelCargo?: string;
  dataInicio?: string;
  dataDevolucaoPrevista?: string;
  custoPeriodo?: number;
  unidade?: string;
  custoTotalPrevisto?: number;
  valorEquipamento?: number;
  dataDevolucaoReal?: string;
  periodoEfetivo?: number;
  custoTotalFinal?: number;
  condicao?: string;
  observacoes?: string;
  // Assinaturas
  respRetiradaNome?: string;
  respRetiradaCpf?: string;
  respRetiradaCargo?: string;
  respEntregaNome?: string;
  respEntregaCargo?: string;
}

export async function gerarTermoPDF(t: TermoData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  // ============ Cabeçalho ============
  const logo = await getLogoDataUrl();
  const logoH = 20;
  if (logo) {
    const ratio = logo.w / logo.h;
    const logoW = Math.min(50, logoH * ratio);
    try {
      doc.addImage(logo.url, "JPEG", M, y, logoW, logoH);
    } catch {
      /* ignore */
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text("GRUPO GRD", W - M, y + 5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Projetos e Construções", W - M, y + 10, { align: "right" });
  doc.text("Av. José Antunes de Oliveira, 307 · Agudos-SP", W - M, y + 14.5, { align: "right" });
  doc.text("(14) 3261-4194 · grupogrdbrasil.com.br", W - M, y + 19, { align: "right" });

  y += logoH + 4;

  // Linha divisória laranja
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(1);
  doc.line(M, y, W - M, y);
  doc.setLineWidth(0.2);
  y += 5;

  // ============ Faixa de título ============
  const titulo = t.tipo === "emprestimo"
    ? "TERMO DE EMPRÉSTIMO DE EQUIPAMENTO"
    : "TERMO DE DEVOLUÇÃO DE EQUIPAMENTO";
  const bandH = 11;
  const leftW = (W - 2 * M) * 0.66;
  const rightW = (W - 2 * M) - leftW;

  doc.setFillColor(...NAVY);
  doc.rect(M, y, leftW, bandH, "F");
  doc.setFillColor(...GREY_BG);
  doc.rect(M + leftW, y, rightW, bandH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.text(titulo, M + leftW / 2, y + 7.2, { align: "center" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(`Nº ${t.numero}`, M + leftW + rightW / 2, y + 4.8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Emissão: ${fmtDate(t.emissao)}`, M + leftW + rightW / 2, y + 9, { align: "center" });

  y += bandH + 6;

  // ============ helpers ============
  const drawSectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...NAVY);
    doc.text(title.toUpperCase(), M, y);
    y += 1.5;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 45, y);
    doc.setLineWidth(0.2);
    y += 4;
  };

  const drawGrid = (rows: [string, string][]) => {
    const cols = 2;
    const rowsPerCol = Math.ceil(rows.length / cols);
    const rowH = 10;
    const boxH = rowsPerCol * rowH + 3;
    const colW = (W - 2 * M) / cols;

    doc.setFillColor(...GREY_BG);
    doc.roundedRect(M, y, W - 2 * M, boxH, 1.5, 1.5, "F");
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, W - 2 * M, boxH, 1.5, 1.5, "S");

    rows.forEach((r, i) => {
      const col = Math.floor(i / rowsPerCol);
      const row = i % rowsPerCol;
      const x = M + col * colW + 4;
      const yy = y + 4 + row * rowH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(r[0].toUpperCase(), x, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT_DARK);
      const value = r[1] || "—";
      const lines = doc.splitTextToSize(value, colW - 8);
      doc.text(lines.slice(0, 1), x, yy + 4.5);
    });
    y += boxH + 5;
  };

  const drawTextBox = (text: string, minH = 16) => {
    const inner = W - 2 * M - 6;
    const lines = doc.splitTextToSize(text || "—", inner);
    const h = Math.max(minH, lines.length * 4.5 + 5);
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, W - 2 * M, h, 1.5, 1.5, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_DARK);
    doc.text(lines, M + 3, y + 5);
    y += h + 5;
  };

  // ============ Seção 1 — Equipamento ============
  drawSectionTitle("1. Dados do equipamento");
  drawGrid([
    ["Nome", t.equipamento.nome],
    ["Código / Patrimônio", t.equipamento.codigo],
    ["Categoria", t.equipamento.categoria],
    ["Descrição", t.equipamento.descricao || "—"],
  ]);

  // ============ Seção 2 — Empréstimo / Devolução ============
  if (t.tipo === "emprestimo") {
    drawSectionTitle("2. Dados do empréstimo");
    drawGrid([
      ["Destino / Obra", t.destino || "—"],
      ["Responsável pela retirada", t.responsavel || "—"],
      ["Data de saída", fmtDate(t.dataInicio)],
      ["Devolução prevista", fmtDate(t.dataDevolucaoPrevista)],
      ["Custo por período", `${brl(t.custoPeriodo || 0)} / ${t.unidade || "dia"}`],
      ["Custo total previsto", brl(t.custoTotalPrevisto || 0)],
    ]);
  } else {
    drawSectionTitle("2. Dados da devolução");
    drawGrid([
      ["Destino / Obra de origem", t.destino || "—"],
      ["Data real da devolução", fmtDate(t.dataDevolucaoReal)],
      ["Responsável", t.responsavel || "—"],
      ["Período efetivo", `${t.periodoEfetivo ?? 0} ${t.unidade || "dia"}(s)`],
      ["Data de saída", fmtDate(t.dataInicio)],
      ["Custo total final", brl(t.custoTotalFinal || 0)],
    ]);

    drawSectionTitle("3. Condição do equipamento na devolução");
    drawTextBox(t.condicao || "—", 14);
  }

  // ============ Observações ============
  drawSectionTitle(t.tipo === "emprestimo" ? "3. Observações" : "4. Observações");
  drawTextBox(t.observacoes?.trim() || "—", 18);

  // ============ Assinaturas ============
  const assinaturasH = 34;
  // Se não couber, empurra pra base
  if (y + assinaturasH + 12 > H - M) {
    y = H - M - assinaturasH - 12;
  }

  const gap = 8;
  const colW2 = (W - 2 * M - gap) / 2;
  const cols = [
    { x: M, label: "Responsável pela retirada", nome: t.respRetiradaNome, doc1: "CPF", doc1Val: t.respRetiradaCpf, extra: t.respRetiradaCargo ? `Cargo: ${t.respRetiradaCargo}` : "" },
    { x: M + colW2 + gap, label: "Responsável pela entrega (GRD)", nome: t.respEntregaNome, doc1: "Cargo", doc1Val: t.respEntregaCargo, extra: "" },
  ];

  cols.forEach((c) => {
    // Linha de assinatura
    doc.setDrawColor(...TEXT_DARK);
    doc.setLineWidth(0.3);
    doc.line(c.x, y + 14, c.x + colW2, y + 14);

    // Título
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(c.label, c.x + colW2 / 2, y + 19, { align: "center" });

    // Dados pré-preenchidos
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(`Nome: ${c.nome || "____________________________________"}`, c.x, y + 24.5);
    doc.text(`${c.doc1}: ${c.doc1Val || "____________________________________"}`, c.x, y + 29);
    if (c.extra) {
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(c.extra, c.x, y + 33);
    }
  });
  y += assinaturasH;

  // ============ Rodapé ============
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(M, H - M - 6, W - M, H - M - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("© 2026 Grupo GRD · grupogrdbrasil.com.br", W / 2, H - M - 2, { align: "center" });

  const nomeArq = `${t.tipo === "emprestimo" ? "termo-emprestimo" : "termo-devolucao"}-${t.equipamento.codigo}-${t.emissao.slice(0, 10)}.pdf`;
  doc.save(nomeArq);
}
