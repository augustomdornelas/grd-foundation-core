import { jsPDF } from "jspdf";
import logoAsset from "@/assets/logo_grd.jpeg.asset.json";

const NAVY: [number, number, number] = [33, 51, 104];
const ORANGE: [number, number, number] = [243, 112, 50];
const GREY_BG: [number, number, number] = [244, 244, 244];
const GREY_LINE: [number, number, number] = [210, 210, 215];
const TEXT_DARK: [number, number, number] = [40, 40, 45];
const TEXT_MUTED: [number, number, number] = [110, 110, 120];

let logoDataUrl: string | null = null;
async function getLogoDataUrl(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const res = await fetch(logoAsset.url);
    const blob = await res.blob();
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    logoDataUrl = url;
    return url;
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
  emissao: string; // iso
  equipamento: {
    nome: string;
    codigo: string;
    categoria: string;
    descricao?: string;
  };
  // Empréstimo
  destino?: string;
  responsavel?: string;
  dataInicio?: string;
  dataDevolucaoPrevista?: string;
  custoPeriodo?: number;
  unidade?: string;
  custoTotalPrevisto?: number;
  // Devolução
  dataDevolucaoReal?: string;
  periodoEfetivo?: number;
  custoTotalFinal?: number;
  condicao?: string;
  // Comum
  observacoes?: string;
}

export async function gerarTermoPDF(t: TermoData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18;
  let y = M;

  // Header — logo
  const logo = await getLogoDataUrl();
  if (logo) {
    try { doc.addImage(logo, "JPEG", M, y, 26, 26); } catch { /* ignore */ }
  }

  // Header — texto direita
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text("GRUPO GRD", W - M, y + 6, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Projetos e Construções", W - M, y + 11, { align: "right" });
  doc.text("Av. José Antunes de Oliveira, 307 · Agudos-SP", W - M, y + 16, { align: "right" });
  doc.text("(14) 3261-4194 · grupogrdbrasil.com.br", W - M, y + 21, { align: "right" });

  y += 28;

  // Linha divisória laranja
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(1.2);
  doc.line(M, y, W - M, y);
  doc.setLineWidth(0.2);
  y += 8;

  // Título
  const titulo = t.tipo === "emprestimo"
    ? "TERMO DE EMPRÉSTIMO DE EQUIPAMENTO"
    : "TERMO DE DEVOLUÇÃO DE EQUIPAMENTO";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY);
  doc.text(titulo, W / 2, y, { align: "center" });

  // Nº e data à direita
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Nº ${t.numero}`, W - M, y - 3, { align: "right" });
  doc.text(`Emissão: ${fmtDate(t.emissao)}`, W - M, y + 2, { align: "right" });

  y += 10;

  // helpers
  const drawSectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(title, M, y);
    y += 2;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 40, y);
    doc.setLineWidth(0.2);
    y += 5;
  };

  const drawBox = (rows: [string, string][], opts?: { bg?: boolean }) => {
    const cols = 2;
    const rowsPerCol = Math.ceil(rows.length / cols);
    const rowH = 7;
    const boxH = rowsPerCol * rowH + 6;
    if (opts?.bg) {
      doc.setFillColor(...GREY_BG);
      doc.roundedRect(M, y, W - 2 * M, boxH, 1.5, 1.5, "F");
    } else {
      doc.setDrawColor(...GREY_LINE);
      doc.roundedRect(M, y, W - 2 * M, boxH, 1.5, 1.5, "S");
    }
    const colW = (W - 2 * M) / cols;
    rows.forEach((r, i) => {
      const col = Math.floor(i / rowsPerCol);
      const row = i % rowsPerCol;
      const x = M + col * colW + 4;
      const yy = y + 6 + row * rowH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(r[0].toUpperCase(), x, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...TEXT_DARK);
      const value = r[1] || "—";
      doc.text(doc.splitTextToSize(value, colW - 8), x, yy + 4);
    });
    y += boxH + 6;
  };

  // Seção 1 — Equipamento
  drawSectionTitle("1. Dados do equipamento");
  drawBox([
    ["Nome", t.equipamento.nome],
    ["Código / Patrimônio", t.equipamento.codigo],
    ["Categoria", t.equipamento.categoria],
    ["Descrição", t.equipamento.descricao || "—"],
  ], { bg: true });

  // Seção 2 — Empréstimo / Devolução
  if (t.tipo === "emprestimo") {
    drawSectionTitle("2. Dados do empréstimo");
    drawBox([
      ["Destino / Obra", t.destino || "—"],
      ["Responsável pela retirada", t.responsavel || "—"],
      ["Data de saída", fmtDate(t.dataInicio)],
      ["Devolução prevista", fmtDate(t.dataDevolucaoPrevista)],
      ["Custo por período", `${brl(t.custoPeriodo || 0)} / ${t.unidade || "dia"}`],
      ["Custo total previsto", brl(t.custoTotalPrevisto || 0)],
    ]);
  } else {
    drawSectionTitle("2. Dados da devolução");
    drawBox([
      ["Destino / Obra de origem", t.destino || "—"],
      ["Responsável", t.responsavel || "—"],
      ["Data de saída", fmtDate(t.dataInicio)],
      ["Data real da devolução", fmtDate(t.dataDevolucaoReal)],
      ["Período efetivo", `${t.periodoEfetivo ?? 0} ${t.unidade || "dia"}(s)`],
      ["Custo total final", brl(t.custoTotalFinal || 0)],
    ]);
    drawSectionTitle("3. Condição do equipamento na devolução");
    const cond = t.condicao || "—";
    doc.setDrawColor(...GREY_LINE);
    const linesC = doc.splitTextToSize(cond, W - 2 * M - 8);
    const hC = Math.max(14, linesC.length * 5 + 6);
    doc.roundedRect(M, y, W - 2 * M, hC, 1.5, 1.5, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    doc.text(linesC, M + 4, y + 6);
    y += hC + 6;
  }

  // Seção Observações
  drawSectionTitle(t.tipo === "emprestimo" ? "3. Observações" : "4. Observações");
  const obs = t.observacoes?.trim() || "—";
  const linesO = doc.splitTextToSize(obs, W - 2 * M - 8);
  const hO = Math.max(20, linesO.length * 5 + 6);
  doc.setDrawColor(...GREY_LINE);
  doc.roundedRect(M, y, W - 2 * M, hO, 1.5, 1.5, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_DARK);
  doc.text(linesO, M + 4, y + 6);
  y += hO + 14;

  // Assinaturas — se não couber, avança pro fim da página
  const assinaturasH = 40;
  if (y + assinaturasH + 20 > H - M) {
    y = H - M - assinaturasH - 20;
  }

  const colW = (W - 2 * M - 10) / 2;
  const cols = [M, M + colW + 10];
  cols.forEach((cx, i) => {
    doc.setDrawColor(...TEXT_DARK);
    doc.setLineWidth(0.3);
    doc.line(cx, y + 14, cx + colW, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(i === 0 ? "Responsável pela retirada" : "Responsável pela entrega (GRD)", cx + colW / 2, y + 20, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(i === 0 ? "Nome: ________________________________" : "Nome: ________________________________", cx, y + 27);
    doc.text(i === 0 ? "CPF: __________________________________" : "Cargo: ________________________________", cx, y + 33);
  });
  y += assinaturasH;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("Li e concordo com os termos deste documento.", W / 2, y, { align: "center" });

  // Rodapé final
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.4);
  doc.line(M, H - M - 8, W - M, H - M - 8);
  if (logo) {
    try { doc.addImage(logo, "JPEG", M, H - M - 7, 6, 6); } catch { /* ignore */ }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text("© 2026 Grupo GRD · grupogrdbrasil.com.br", W - M, H - M - 3, { align: "right" });

  const nomeArq = `${t.tipo === "emprestimo" ? "termo-emprestimo" : "termo-devolucao"}-${t.equipamento.codigo}-${t.emissao.slice(0, 10)}.pdf`;
  doc.save(nomeArq);
}
