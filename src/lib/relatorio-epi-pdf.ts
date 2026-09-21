// ============================================================
// Relatório de Entrega de EPI por período — PDF para assinar à caneta
// ------------------------------------------------------------
// UMA FOLHA POR COLABORADOR: cada um começa em página nova, com o que
// recebeu no período e, no pé da última folha dele, os campos de
// assinatura em branco (colaborador e almoxarifado). Não leva foto — a
// foto continua sendo a assinatura de cada termo de entrega.
//
// Mesmo padrão visual do termo (termo-epi-pdf.ts): logo GRD,
// azul-marinho e faixa laranja.
//
// PAGINAÇÃO
//   - Itens que não cabem continuam na folha seguinte, que repete o
//     cabeçalho e os dados do colaborador com "(CONTINUAÇÃO)".
//   - As assinaturas ficam num lugar fixo, no pé da ÚLTIMA folha do
//     colaborador. Se a tabela terminar em cima desse lugar, o
//     colaborador ganha mais uma folha só para assinar.
//   - "Folha X de Y" conta só as folhas daquele colaborador; por isso o
//     rodapé é escrito no fim, quando já se sabe quantas são.
// ============================================================
import { jsPDF } from "jspdf";
import logoGrd from "@/assets/logo_grd.png";
import { carregarImagem } from "@/lib/termo-epi-pdf";

const NAVY: [number, number, number] = [33, 51, 104];
const ORANGE: [number, number, number] = [243, 112, 50];
const GREY_BG: [number, number, number] = [244, 244, 244];
const GREY_LINE: [number, number, number] = [210, 210, 215];
const TEXT_DARK: [number, number, number] = [40, 40, 45];
const TEXT_MUTED: [number, number, number] = [110, 110, 120];
const WHITE: [number, number, number] = [255, 255, 255];

export type ItemRelatorioEpi = {
  /** ISO AAAA-MM-DD */
  data: string;
  termo: string;
  epi: string;
  ca: string;
  quantidade: number;
  unidade: string;
  motivo: string;
  /** ISO; ausente = EPI sem validade */
  validade?: string;
};

export type ColaboradorRelatorioEpi = {
  nome: string;
  matricula: string;
  cpf: string;
  cargo: string;
  setor: string;
  itens: ItemRelatorioEpi[];
};

const DECLARACAO =
  "Declaro que recebi os Equipamentos de Proteção Individual abaixo relacionados, em perfeito estado, e fui orientado quanto ao uso, guarda e conservação, conforme NR-6 e art. 158 da CLT.";

function fmtData(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function fmtDataHora(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

// Larguras em proporção de uma área útil de 180 mm.
const COLUNAS: { titulo: string; larg: number; centro?: boolean }[] = [
  { titulo: "DATA", larg: 19 },
  { titulo: "Nº DO TERMO", larg: 27 },
  { titulo: "EPI", larg: 58 },
  { titulo: "C.A.", larg: 17 },
  { titulo: "QTD.", larg: 15, centro: true },
  { titulo: "MOTIVO", larg: 25 },
  { titulo: "VALIDADE", larg: 19 },
];
const LARG_BASE = COLUNAS.reduce((a, c) => a + c.larg, 0);

export function nomeArquivoRelatorioEpi(deIso: string, ateIso: string) {
  return `relatorio-epi-${deIso}_a_${ateIso}.pdf`;
}

export type EntradaRelatorioEpi = {
  deIso: string;
  ateIso: string;
  colaboradores: ColaboradorRelatorioEpi[];
  geradoPor: string;
};

/** Gera e baixa o relatório. */
export async function gerarRelatorioEpiPDF(input: EntradaRelatorioEpi) {
  const doc = await montarRelatorioEpiPDF(input);
  doc.save(nomeArquivoRelatorioEpi(input.deIso, input.ateIso));
}

/** Monta o PDF sem baixar. */
export async function montarRelatorioEpiPDF(input: EntradaRelatorioEpi): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const larg = W - 2 * M;
  const colsW = COLUNAS.map((c) => (c.larg / LARG_BASE) * larg);
  const LIMITE = H - M - 12; // onde começa o rodapé
  const ASSINATURAS_H = 34;
  const Y_ASSINATURAS = LIMITE - ASSINATURAS_H;
  const periodo = `${fmtData(input.deIso)} A ${fmtData(input.ateIso)}`;
  const geradoEm = new Date();
  const logo = await carregarImagem(logoGrd, 600);

  let y = M;
  // Faixa de páginas de cada colaborador, para o "Folha X de Y".
  const faixas: { nome: string; primeira: number; ultima: number }[] = [];

  const cabecalho = () => {
    y = M;
    const logoH = 16;
    if (logo) {
      const logoW = Math.min(50, logoH * (logo.w / logo.h));
      try {
        doc.addImage(logo.dataUrl, "PNG", M, y, logoW, logoH);
      } catch {
        /* segue sem logo */
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
    y += logoH + 5;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(1);
    doc.line(M, y, W - M, y);
    doc.setLineWidth(0.2);
    y += 4;
  };

  const faixaTitulo = (continuacao: boolean) => {
    const bandH = 11;
    const leftW = larg * 0.62;
    const rightW = larg - leftW;
    doc.setFillColor(...NAVY);
    doc.rect(M, y, leftW, bandH, "F");
    doc.setFillColor(...GREY_BG);
    doc.rect(M + leftW, y, rightW, bandH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(continuacao ? 9.5 : 11);
    doc.setTextColor(...WHITE);
    doc.text(
      continuacao ? "RELATÓRIO DE ENTREGA DE EPI (CONTINUAÇÃO)" : "RELATÓRIO DE ENTREGA DE EPI",
      M + leftW / 2,
      y + 7.2,
      { align: "center" },
    );
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("PERÍODO", M + leftW + rightW / 2, y + 4.3, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(periodo, M + leftW + rightW / 2, y + 8.8, { align: "center" });
    y += bandH + 5;
  };

  const dadosColaborador = (c: ColaboradorRelatorioEpi) => {
    const boxH = 21;
    doc.setFillColor(...GREY_BG);
    doc.roundedRect(M, y, larg, boxH, 1.5, 1.5, "F");
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.2);
    doc.roundedRect(M, y, larg, boxH, 1.5, 1.5, "S");

    const campo = (rotulo: string, valor: string, x: number, yy: number, w: number) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(rotulo, x, yy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_DARK);
      doc.text(doc.splitTextToSize(valor || "—", w - 3).slice(0, 1), x, yy + 4);
    };
    const x0 = M + 4;
    const util = larg - 8;
    // Linha 1: nome (2/3) e matrícula; linha 2: CPF, cargo e setor.
    campo("NOME", c.nome.toUpperCase(), x0, y + 5, util * 0.7);
    campo("MATRÍCULA", c.matricula, x0 + util * 0.7, y + 5, util * 0.3);
    campo("CPF", c.cpf, x0, y + 14, util * 0.3);
    campo("CARGO", c.cargo, x0 + util * 0.3, y + 14, util * 0.4);
    campo("SETOR", c.setor, x0 + util * 0.7, y + 14, util * 0.3);
    y += boxH + 5;
  };

  const declaracao = () => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const linhas = doc.splitTextToSize(DECLARACAO, larg - 6) as string[];
    const h = linhas.length * 8.5 * 1.15 * 0.3528 + 5;
    doc.setDrawColor(...GREY_LINE);
    doc.roundedRect(M, y, larg, h, 1.5, 1.5, "S");
    doc.setTextColor(...TEXT_DARK);
    doc.text(linhas, M + 3, y + 4.5);
    y += h + 5;
  };

  const cabecalhoTabela = () => {
    const headH = 7.5;
    doc.setFillColor(...NAVY);
    doc.rect(M, y, larg, headH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...WHITE);
    let cx = M;
    COLUNAS.forEach((c, i) => {
      if (c.centro) doc.text(c.titulo, cx + colsW[i] / 2, y + 5, { align: "center" });
      else doc.text(c.titulo, cx + 1.5, y + 5);
      cx += colsW[i];
    });
    y += headH;
  };

  const celulas = (it: ItemRelatorioEpi) => [
    fmtData(it.data),
    it.termo || "—",
    it.epi || "—",
    it.ca || "—",
    `${it.quantidade} ${(it.unidade || "un").trim()}`,
    it.motivo || "—",
    it.validade ? fmtData(it.validade) : "—",
  ];

  /** Altura da linha pelo texto que mais quebra (até 2 linhas por célula). */
  const alturaLinha = (it: ItemRelatorioEpi) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const maxLinhas = Math.max(
      ...celulas(it).map(
        (t, i) => (doc.splitTextToSize(t, colsW[i] - 3) as string[]).slice(0, 2).length,
      ),
    );
    return Math.max(7, maxLinhas * 3.1 + 3);
  };

  const linhaTabela = (it: ItemRelatorioEpi, idx: number, h: number) => {
    if (idx % 2 === 1) {
      doc.setFillColor(...GREY_BG);
      doc.rect(M, y, larg, h, "F");
    }
    doc.setDrawColor(...GREY_LINE);
    doc.setLineWidth(0.1);
    doc.line(M, y + h, M + larg, y + h);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_DARK);
    let cx = M;
    celulas(it).forEach((t, i) => {
      const linhas = (doc.splitTextToSize(t, colsW[i] - 3) as string[]).slice(0, 2);
      const ty = y + (h - linhas.length * 3.1) / 2 + 2.4;
      if (COLUNAS[i].centro) doc.text(linhas, cx + colsW[i] / 2, ty, { align: "center" });
      else doc.text(linhas, cx + 1.5, ty);
      cx += colsW[i];
    });
    y += h;
  };

  const linhaTotal = (total: number) => {
    const h = 8;
    doc.setFillColor(...GREY_BG);
    doc.rect(M, y, larg, h, "F");
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + larg, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(`TOTAL DE ITENS: ${total}`, M + larg - 3, y + 5.5, { align: "right" });
    y += h;
  };

  /** Dois campos lado a lado, com ~15 mm em branco acima de cada linha. */
  const assinaturas = (c: ColaboradorRelatorioEpi) => {
    const gap = 12;
    const colW = (larg - gap) / 2;
    const top = Y_ASSINATURAS;
    const yLinha = top + 4 + 15;
    const blocos = [
      {
        x: M,
        rotulo: "ASSINATURA DO COLABORADOR",
        l1: c.nome.toUpperCase(),
        l2: "DATA: ____/____/______",
      },
      {
        x: M + colW + gap,
        rotulo: "RESPONSÁVEL PELO ALMOXARIFADO — GRD",
        l1: "NOME: ________________________________",
        l2: "DATA: ____/____/______",
      },
    ];
    for (const b of blocos) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_MUTED);
      doc.text(b.rotulo, b.x + colW / 2, top + 3, { align: "center" });
      doc.setDrawColor(...TEXT_DARK);
      doc.setLineWidth(0.3);
      doc.line(b.x, yLinha, b.x + colW, yLinha);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...NAVY);
      doc.text(doc.splitTextToSize(b.l1, colW).slice(0, 1), b.x + colW / 2, yLinha + 5, {
        align: "center",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_DARK);
      doc.text(b.l2, b.x + colW / 2, yLinha + 10, { align: "center" });
    }
  };

  const folhaDeContinuacao = (c: ColaboradorRelatorioEpi) => {
    doc.addPage();
    cabecalho();
    faixaTitulo(true);
    dadosColaborador(c);
  };

  // ------------------------------------------------------------
  // Uma folha (ou mais) por colaborador
  // ------------------------------------------------------------
  input.colaboradores.forEach((c, n) => {
    if (n > 0) doc.addPage();
    const primeira = doc.getNumberOfPages();
    cabecalho();
    faixaTitulo(false);
    dadosColaborador(c);
    declaracao();
    cabecalhoTabela();

    c.itens.forEach((it, idx) => {
      const h = alturaLinha(it);
      if (y + h > LIMITE) {
        folhaDeContinuacao(c);
        cabecalhoTabela();
      }
      linhaTabela(it, idx, h);
    });

    if (y + 8 > LIMITE) folhaDeContinuacao(c);
    linhaTotal(c.itens.reduce((a, i) => a + (i.quantidade || 0), 0));

    // As assinaturas têm lugar fixo no pé; se a tabela já passou dele,
    // mais uma folha só para assinar.
    if (y + 4 > Y_ASSINATURAS) folhaDeContinuacao(c);
    assinaturas(c);

    faixas.push({ nome: c.nome, primeira, ultima: doc.getNumberOfPages() });
  });

  // ------------------------------------------------------------
  // Rodapés, agora que se sabe quantas folhas cada um tem
  // ------------------------------------------------------------
  const gerado = `Gerado em ${fmtDataHora(geradoEm)} por ${input.geradoPor || "—"}`;
  for (const f of faixas) {
    const total = f.ultima - f.primeira + 1;
    for (let p = f.primeira; p <= f.ultima; p++) {
      doc.setPage(p);
      doc.setDrawColor(...NAVY);
      doc.setLineWidth(0.5);
      doc.line(M, H - M - 6, W - M, H - M - 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(
        doc
          .splitTextToSize(
            `${f.nome.toUpperCase()} · Folha ${p - f.primeira + 1} de ${total}`,
            larg * 0.55,
          )
          .slice(0, 1),
        M,
        H - M - 2,
      );
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...TEXT_MUTED);
      doc.text(gerado, W - M, H - M - 2, { align: "right" });
    }
  }

  return doc;
}
