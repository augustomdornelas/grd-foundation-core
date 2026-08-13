// ============================================================
// Termo de Entrega / Recebimento de EPI (NR-6) em PDF
// ------------------------------------------------------------
// Identidade visual GRD (jsPDF): azul-marinho, faixa laranja,
// cabeçalho com logo + número do termo e rodapé.
//
// O logo vem do asset local (@/assets/logo_grd.png) — a versão
// anterior buscava https://grupogrdbrasil.com.br/logo_grd.jpeg,
// que responde 404, então todo termo saía sem logo.
// ============================================================
import { jsPDF } from "jspdf";
import logoGrd from "@/assets/logo_grd.png";

const NAVY: [number, number, number] = [33, 51, 104];
const ORANGE: [number, number, number] = [243, 112, 50];
const GREY_BG: [number, number, number] = [244, 244, 244];
const GREY_LINE: [number, number, number] = [210, 210, 215];
const TEXT_DARK: [number, number, number] = [40, 40, 45];
const TEXT_MUTED: [number, number, number] = [110, 110, 120];
const WHITE: [number, number, number] = [255, 255, 255];

// ---------- Carregamento de imagens ----------
type ImagemPdf = { dataUrl: string; w: number; h: number };

const cacheImagens = new Map<string, Promise<ImagemPdf | null>>();

/**
 * Baixa a imagem, reduz para `maxPx` e normaliza em PNG sobre fundo branco.
 * Passar pelo canvas resolve de uma vez formatos que o jsPDF não embute
 * (webp/avif) e transparência que alguns leitores renderizam escura.
 * Devolve null em qualquer falha — o termo sai sem a foto, nunca quebra.
 */
function carregarImagem(url: string, maxPx = 320): Promise<ImagemPdf | null> {
  const chave = `${url}|${maxPx}`;
  const emCache = cacheImagens.get(chave);
  if (emCache) return emCache;

  const promessa = (async (): Promise<ImagemPdf | null> => {
    try {
      const res = await fetch(url, { cache: "force-cache" });
      if (!res.ok) return null;
      const blobUrl = URL.createObjectURL(await res.blob());
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("imagem inválida"));
          el.src = blobUrl;
        });
        const escala = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const w = Math.max(1, Math.round(img.naturalWidth * escala));
        const h = Math.max(1, Math.round(img.naturalHeight * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return { dataUrl: canvas.toDataURL("image/png"), w, h };
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      return null;
    }
  })();

  cacheImagens.set(chave, promessa);
  return promessa;
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
  dataAdmissao?: string;
}

export interface TermoEpiItem {
  epiNome: string;
  ca: string;
  fabricante?: string;
  unidade?: string;
  fotoUrl?: string;
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

// Larguras da tabela de itens, em proporção de uma área útil de 180mm.
const COLUNAS: { titulo: string; larg: number; centro?: boolean }[] = [
  { titulo: "Foto", larg: 17, centro: true },
  { titulo: "EPI", larg: 42 },
  { titulo: "C.A.", larg: 19 },
  { titulo: "Fabricante", larg: 26 },
  { titulo: "Qtd.", larg: 15, centro: true },
  { titulo: "Motivo", larg: 25 },
  { titulo: "Entrega", larg: 18 },
  { titulo: "Validade", larg: 18 },
];
const LARG_BASE = COLUNAS.reduce((a, c) => a + c.larg, 0);

/**
 * Desenha um termo completo a partir da página atual do documento.
 * Separado de `gerarTermoEpiPDF` para que a entrega em lote consiga
 * emitir vários termos — um por funcionário — no mesmo arquivo.
 */
async function desenharTermo(doc: jsPDF, t: TermoEpiData) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const tableX = M;
  const tableW = W - 2 * M;
  const colsW = COLUNAS.map(c => (c.larg / LARG_BASE) * tableW);
  let y = M;

  const logo = await carregarImagem(logoGrd, 600);

  const desenharCabecalho = () => {
    y = M;
    const logoH = 16;
    if (logo) {
      const logoW = Math.min(50, logoH * (logo.w / logo.h));
      try { doc.addImage(logo.dataUrl, "PNG", M, y, logoW, logoH); } catch { /* segue sem logo */ }
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

    y += logoH + 5;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(1);
    doc.line(M, y, W - M, y);
    doc.setLineWidth(0.2);
    y += 4;
  };

  const desenharRodape = () => {
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.line(M, H - M - 6, W - M, H - M - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      `Termo de Entrega de EPI (NR-6) · Nº ${t.numero} · Grupo GRD · grupogrdbrasil.com.br`,
      W / 2, H - M - 2, { align: "center" },
    );
  };

  const novaPagina = () => {
    desenharRodape();
    doc.addPage();
    desenharCabecalho();
  };

  /** Quebra de página quando o bloco de `altura` não cabe no que resta. */
  const garantirEspaco = (altura: number) => {
    if (y + altura > H - M - 12) novaPagina();
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

  /** Grade rótulo/valor em 2 colunas; valores longos quebram em 2 linhas. */
  const drawGrid = (rows: [string, string][]) => {
    const cols = 2;
    const rowsPerCol = Math.ceil(rows.length / cols);
    const rowH = 9.5;
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
      doc.setFontSize(8.5);
      doc.setTextColor(...TEXT_DARK);
      const linhas = doc.splitTextToSize(r[1] || "—", colW - 8).slice(0, 2);
      doc.text(linhas, x, yy + 3.8);
    });
    y += boxH + 4;
  };

  /**
   * Caixa de texto corrido. A fonte é definida ANTES de quebrar as linhas —
   * splitTextToSize mede com a fonte corrente — e a altura da caixa usa o
   * espaçamento real do jsPDF (fonte × lineHeightFactor), sem folga chutada.
   */
  const drawTextBox = (text: string, minH = 16, fonte = 8.5) => {
    const inner = W - 2 * M - 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fonte);
    const lines = doc.splitTextToSize(text || "—", inner) as string[];
    const alturaLinha = fonte * 1.15 * 0.3528; // pt -> mm
    const h = Math.max(minH, lines.length * alturaLinha + 5);
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, W - 2 * M, h, 1.5, 1.5, "S");
    doc.setTextColor(...TEXT_DARK);
    doc.text(lines, M + 3, y + 4.5);
    y += h + 4;
  };

  // ============ Cabeçalho e faixa do título ============
  desenharCabecalho();

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
    ["Data de admissão", t.funcionario.dataAdmissao ? fmtDate(t.funcionario.dataAdmissao) : "—"],
    ["Data de entrega", fmtDate(t.emissao)],
  ]);

  // ============ Seção 2 — Tabela de EPIs (com foto) ============
  drawSectionTitle("2. Equipamentos de proteção entregues");

  // Baixa as fotos distintas antes de montar a tabela.
  const urls = [...new Set(t.itens.map(i => i.fotoUrl).filter((u): u is string => !!u))];
  const fotos = new Map<string, ImagemPdf | null>();
  await Promise.all(urls.map(async u => { fotos.set(u, await carregarImagem(u, 320)); }));

  const headH = 7.5;
  const rowH = 13;

  const drawTableHead = () => {
    doc.setFillColor(...NAVY);
    doc.rect(tableX, y, tableW, headH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    let cx = tableX;
    COLUNAS.forEach((c, i) => {
      if (c.centro) doc.text(c.titulo, cx + colsW[i] / 2, y + 5, { align: "center" });
      else doc.text(c.titulo, cx + 2, y + 5);
      cx += colsW[i];
    });
    y += headH;
  };

  /** Texto centralizado verticalmente na célula, com até 3 linhas. */
  const celulaTexto = (texto: string, x: number, larg: number, centro?: boolean) => {
    const linhas = doc.splitTextToSize(texto, larg - 3).slice(0, 3) as string[];
    const ty = y + (rowH - linhas.length * 3.05) / 2 + 2.4;
    if (centro) doc.text(linhas, x + larg / 2, ty, { align: "center" });
    else doc.text(linhas, x + 1.5, ty);
  };

  drawTableHead();

  for (let idx = 0; idx < t.itens.length; idx++) {
    const it = t.itens[idx];
    if (y + rowH > H - M - 12) {
      novaPagina();
      drawSectionTitle("2. Equipamentos de proteção entregues (cont.)");
      drawTableHead();
    }

    if (idx % 2 === 1) {
      doc.setFillColor(...GREY_BG);
      doc.rect(tableX, y, tableW, rowH, "F");
    }
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.1);
    doc.line(tableX, y + rowH, tableX + tableW, y + rowH);

    // Foto (primeira coluna), encaixada preservando proporção.
    const foto = it.fotoUrl ? fotos.get(it.fotoUrl) : null;
    if (foto) {
      const cx = tableX;
      const maxW = colsW[0] - 4;
      const maxH = rowH - 3;
      const escala = Math.min(maxW / foto.w, maxH / foto.h);
      const iw = foto.w * escala;
      const ih = foto.h * escala;
      try {
        doc.addImage(foto.dataUrl, "PNG", cx + (colsW[0] - iw) / 2, y + (rowH - ih) / 2, iw, ih);
      } catch { /* segue sem a foto do item */ }
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("sem foto", tableX + colsW[0] / 2, y + rowH / 2 + 1, { align: "center" });
    }

    const unidade = (it.unidade || "un").trim();
    const celulas = [
      "", // foto, já desenhada
      it.epiNome || "—",
      it.ca || "—",
      it.fabricante || "—",
      `${it.quantidade ?? 1} ${unidade}`,
      it.motivo || "—",
      fmtDate(it.dataEntrega),
      it.dataValidade ? fmtDate(it.dataValidade) : "—",
    ];

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_DARK);
    let cx = tableX;
    celulas.forEach((c, i) => {
      if (i > 0) celulaTexto(String(c), cx, colsW[i], COLUNAS[i].centro);
      cx += colsW[i];
    });
    y += rowH;
  }
  y += 4;

  // ============ Seção 3 — Termo de responsabilidade (NR-6) ============
  garantirEspaco(60);
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
  drawTextBox(texto, 40);

  // ============ Seção 4 — Observações ============
  if (t.observacoes && t.observacoes.trim()) {
    garantirEspaco(24);
    drawSectionTitle("4. Observações");
    drawTextBox(t.observacoes.trim(), 16);
  }

  // ============ Assinaturas ============
  // Espaço para assinar, linha, e abaixo dela nome e cargo impressos.
  const assinaturasH = 36;
  garantirEspaco(assinaturasH + 6);
  if (y + assinaturasH + 6 > H - M) y = H - M - assinaturasH - 6;

  const gap = 10;
  const colW2 = (W - 2 * M - gap) / 2;
  const blocos = [
    {
      x: M,
      papel: "Funcionário (recebedor)",
      nome: t.funcionario.nome,
      cargo: t.funcionario.cargo,
      extra: `CPF: ${t.funcionario.cpf || "____________________"}`,
    },
    {
      x: M + colW2 + gap,
      papel: "Responsável pela entrega — GRD",
      nome: t.responsavelEntrega,
      cargo: t.responsavelCargo,
      extra: `Data: ${fmtDate(t.emissao)}`,
    },
  ];

  blocos.forEach(b => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(b.papel.toUpperCase(), b.x + colW2 / 2, y + 3, { align: "center" });

    // Linha de assinatura, com espaço em branco acima para assinar.
    const yLinha = y + 17;
    doc.setDrawColor(...TEXT_DARK);
    doc.setLineWidth(0.3);
    doc.line(b.x, yLinha, b.x + colW2, yLinha);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    const nomeLinha = doc.splitTextToSize((b.nome || "____________________").toUpperCase(), colW2).slice(0, 1);
    doc.text(nomeLinha, b.x + colW2 / 2, yLinha + 5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_DARK);
    const cargoLinha = doc.splitTextToSize(b.cargo || "____________________", colW2).slice(0, 1);
    doc.text(cargoLinha, b.x + colW2 / 2, yLinha + 9.5, { align: "center" });

    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(b.extra, b.x + colW2 / 2, yLinha + 14, { align: "center" });
  });
  y += assinaturasH;

  desenharRodape();
}

function nomeArquivo(t: TermoEpiData) {
  const slug = (t.funcionario.nome || "funcionario").replace(/\s+/g, "-").toLowerCase();
  return `termo-epi-${slug}-${t.numero}.pdf`;
}

/** Gera e baixa o termo de um funcionário. */
export async function gerarTermoEpiPDF(t: TermoEpiData) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await desenharTermo(doc, t);
  doc.save(nomeArquivo(t));
}

/**
 * Gera os termos de vários funcionários num único arquivo, cada termo
 * começando em página nova — um PDF só evita o bloqueio de downloads
 * múltiplos do navegador e é mais prático de imprimir em lote.
 */
export async function gerarTermosEpiPDF(termos: TermoEpiData[], nomeArq?: string) {
  if (!termos.length) return;
  if (termos.length === 1) return gerarTermoEpiPDF(termos[0]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  for (let i = 0; i < termos.length; i++) {
    if (i > 0) doc.addPage();
    await desenharTermo(doc, termos[i]);
  }
  const ano = new Date().getFullYear();
  doc.save(nomeArq ?? `termos-epi-${ano}-${termos.length}-funcionarios.pdf`);
}
