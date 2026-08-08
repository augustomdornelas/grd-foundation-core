// ============================================================
// Termo de Entrega / Recebimento de EPI (NR-6) em PDF
// ------------------------------------------------------------
// Mesma identidade visual dos termos de equipamento (jsPDF):
// azul-marinho GRD, faixa laranja, cabeçalho com logo e rodapé.
// ============================================================
import { jsPDF } from "jspdf";

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
    const res = await fetch("https://grupogrdbrasil.com.br/logo_grd.jpeg", { cache: "force-cache" });
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

export interface TermoEpiFuncionario {
  nome: string;
  cpf?: string;
  rg?: string;
  cargo?: string;
  setor?: string;
  matricula?: string;
}

export interface TermoEpiItem {
  epiNome: string;
  ca: string;
  quantidade: number;
  motivo: string;
  dataEntrega?: string;
  dataValidade?: string;
}

export interface TermoEpiData {
  numero: string;
  emissao: string;
  funcionario: TermoEpiFuncionario;
  itens: TermoEpiItem[];
  responsavelEntrega?: string;
  responsavelCargo?: string;
  observacoes?: string;
}

export async function gerarTermoEpiPDF(t: TermoEpiData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  let y = M;

  const desenharCabecalho = async () => {
    y = M;
    const logo = await getLogoDataUrl();
    const logoH = 20;
    if (logo) {
      const ratio = logo.w / logo.h;
      const logoW = Math.min(50, logoH * ratio);
      try { doc.addImage(logo.url, "JPEG", M, y, logoW, logoH); } catch { /* ignore */ }
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
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(1);
    doc.line(M, y, W - M, y);
    doc.setLineWidth(0.2);
    y += 5;
  };

  const desenharRodape = () => {
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.line(M, H - M - 6, W - M, H - M - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("© 2026 Grupo GRD · grupogrdbrasil.com.br · Termo de Entrega de EPI (NR-6)", W / 2, H - M - 2, { align: "center" });
  };

  const novaPagina = async () => {
    desenharRodape();
    doc.addPage();
    await desenharCabecalho();
  };

  const garantirEspaco = async (altura: number) => {
    if (y + altura > H - M - 12) await novaPagina();
  };

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

  // ============ Página 1 — cabeçalho e título ============
  await desenharCabecalho();

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
  doc.text("TERMO DE ENTREGA DE EPI", M + leftW / 2, y + 7.2, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(`Nº ${t.numero}`, M + leftW + rightW / 2, y + 4.8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Emissão: ${fmtDate(t.emissao)}`, M + leftW + rightW / 2, y + 9, { align: "center" });
  y += bandH + 6;

  // ============ Seção 1 — Funcionário ============
  drawSectionTitle("1. Dados do funcionário");
  drawGrid([
    ["Nome", t.funcionario.nome],
    ["CPF", t.funcionario.cpf || "—"],
    ["RG", t.funcionario.rg || "—"],
    ["Matrícula", t.funcionario.matricula || "—"],
    ["Cargo / Função", t.funcionario.cargo || "—"],
    ["Setor", t.funcionario.setor || "—"],
  ]);

  // ============ Seção 2 — Tabela de EPIs ============
  drawSectionTitle("2. Equipamentos de proteção entregues");

  // Colunas: EPI | CA | Qtd | Motivo | Entrega | Validade
  const tableX = M;
  const tableW = W - 2 * M;
  const colsW = [tableW * 0.30, tableW * 0.15, tableW * 0.09, tableW * 0.20, tableW * 0.13, tableW * 0.13];
  const heads = ["EPI", "C.A.", "Qtd", "Motivo", "Entrega", "Validade"];
  const rowH = 8;

  const drawTableHead = () => {
    doc.setFillColor(...NAVY);
    doc.rect(tableX, y, tableW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    let cx = tableX;
    heads.forEach((h, i) => {
      doc.text(h, cx + 2, y + 5.3);
      cx += colsW[i];
    });
    y += rowH;
  };

  drawTableHead();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  for (let idx = 0; idx < t.itens.length; idx++) {
    await garantirEspaco(rowH + 2);
    // Se acabou de mudar de página, redesenha cabeçalho da tabela.
    if (y <= M + 30) { drawSectionTitle("2. Equipamentos de proteção entregues (cont.)"); drawTableHead(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
    const it = t.itens[idx];
    if (idx % 2 === 1) {
      doc.setFillColor(...GREY_BG);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.1);
    doc.line(tableX, y + rowH, tableX + tableW, y + rowH);

    const cells = [
      it.epiNome || "—",
      it.ca || "—",
      String(it.quantidade ?? 1),
      it.motivo || "—",
      fmtDate(it.dataEntrega),
      it.dataValidade ? fmtDate(it.dataValidade) : "—",
    ];
    doc.setTextColor(...TEXT_DARK);
    let cx = tableX;
    cells.forEach((c, i) => {
      const txt = doc.splitTextToSize(String(c), colsW[i] - 3).slice(0, 1);
      doc.text(txt, cx + 2, y + 5.3);
      cx += colsW[i];
    });
    y += rowH;
  }
  // Borda externa da tabela
  y += 4;

  // ============ Seção 3 — Termo de responsabilidade (NR-6) ============
  await garantirEspaco(60);
  drawSectionTitle("3. Termo de responsabilidade");
  const nome = (t.funcionario.nome || "____________________").toUpperCase();
  const cpf = t.funcionario.cpf || "________________";
  const texto =
    `Declaro, para os devidos fins, que recebi gratuitamente do GRUPO GRD os Equipamentos de Proteção Individual (EPIs) discriminados neste termo, em perfeito estado de conservação e funcionamento, tendo sido devidamente orientado(a) quanto ao seu uso correto, guarda e conservação, nos termos da Norma Regulamentadora NR-6 e do art. 158 da CLT. Eu, ${nome}, CPF ${cpf}, comprometo-me a:\n` +
    `• Utilizar o EPI apenas para a finalidade a que se destina e durante toda a jornada de trabalho;\n` +
    `• Responsabilizar-me pela guarda e conservação dos equipamentos recebidos;\n` +
    `• Comunicar ao empregador qualquer alteração que os torne impróprios para uso, bem como solicitar a substituição em caso de dano, extravio ou vencimento da validade;\n` +
    `• Devolver o EPI ao término do contrato de trabalho ou quando solicitado;\n` +
    `• Cumprir as determinações do empregador sobre o uso adequado, sob pena das sanções previstas na NR-6 e na legislação trabalhista.`;
  drawTextBox(texto, 46);

  // ============ Seção 4 — Observações ============
  if (t.observacoes && t.observacoes.trim()) {
    await garantirEspaco(24);
    drawSectionTitle("4. Observações");
    drawTextBox(t.observacoes.trim(), 16);
  }

  // ============ Assinaturas ============
  const assinaturasH = 34;
  await garantirEspaco(assinaturasH + 12);
  if (y + assinaturasH + 12 > H - M) y = H - M - assinaturasH - 12;

  const gap = 8;
  const colW2 = (W - 2 * M - gap) / 2;
  const cols = [
    { x: M, label: "Funcionário (recebedor)", nome: t.funcionario.nome, linha2: `CPF: ${t.funcionario.cpf || "____________________"}` },
    { x: M + colW2 + gap, label: "Responsável pela entrega (GRD)", nome: t.responsavelEntrega, linha2: t.responsavelCargo ? `Cargo: ${t.responsavelCargo}` : "Cargo: ____________________" },
  ];
  cols.forEach((c) => {
    doc.setDrawColor(...TEXT_DARK);
    doc.setLineWidth(0.3);
    doc.line(c.x, y + 14, c.x + colW2, y + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...NAVY);
    doc.text(c.label, c.x + colW2 / 2, y + 19, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    doc.text(`Nome: ${c.nome || "____________________________________"}`, c.x, y + 24.5);
    doc.text(c.linha2, c.x, y + 29);
  });
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Data: ${fmtDate(t.emissao)}`, M, y + 33.5);
  y += assinaturasH;

  desenharRodape();

  const nomeArq = `termo-epi-${(t.funcionario.nome || "funcionario").replace(/\s+/g, "-").toLowerCase()}-${t.numero}.pdf`;
  doc.save(nomeArq);
}
