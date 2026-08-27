// ============================================================
// Documentos do RH em PDF — padrão visual GRD
// ------------------------------------------------------------
// Seis documentos, uma casca só: carta-proposta, ficha de admissão,
// parecer de entrevista, termo de consentimento LGPD, ficha do
// colaborador e requisição de vaga.
//
// O modelo é `termo-epi-pdf.ts`, do módulo de EPIs: mesmas cores,
// mesmo cabeçalho com logo e mesmo rodapé. O que muda é que aqui a
// casca virou função reaproveitável (`novoDocumento`), porque são
// seis documentos e não um — copiar o cabeçalho seis vezes é como as
// versões começam a divergir.
//
// Nada aqui busca dado no banco: quem chama passa o que já tem na
// tela. Assim o PDF nunca sai com um número diferente do que a pessoa
// acabou de ver.
// ============================================================
import { jsPDF } from "jspdf";
import logoGrd from "@/assets/logo_grd.png";
import { brl } from "@/lib/formato";
import { dataBr } from "@/lib/rh-regras";

const NAVY: [number, number, number] = [33, 51, 104];
const ORANGE: [number, number, number] = [243, 112, 50];
const GREY_BG: [number, number, number] = [244, 244, 244];
const GREY_LINE: [number, number, number] = [210, 210, 215];
const TEXT_DARK: [number, number, number] = [40, 40, 45];
const TEXT_MUTED: [number, number, number] = [110, 110, 120];

const EMPRESA = {
  nome: "GRUPO GRD",
  linha1: "Projetos e Construções",
  linha2: "Av. José Antunes de Oliveira, 307 · Agudos-SP",
  linha3: "(14) 3261-4194 · grupogrdbrasil.com.br",
};

// ---------- Logo ----------
type ImagemPdf = { dataUrl: string; w: number; h: number };
let cacheLogo: Promise<ImagemPdf | null> | null = null;

/**
 * Normaliza o logo em PNG sobre fundo branco. Devolve null em qualquer
 * falha — o documento sai sem logo, nunca quebra por causa da imagem.
 */
function carregarLogo(): Promise<ImagemPdf | null> {
  if (cacheLogo) return cacheLogo;
  cacheLogo = (async () => {
    try {
      const res = await fetch(logoGrd, { cache: "force-cache" });
      if (!res.ok) return null;
      const blobUrl = URL.createObjectURL(await res.blob());
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("imagem inválida"));
          el.src = blobUrl;
        });
        const escala = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight, 1));
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
  return cacheLogo;
}

// ============================================================
// A casca compartilhada
// ============================================================
export type Doc = {
  doc: jsPDF;
  /** Largura útil, já descontadas as margens. */
  larg: number;
  m: number;
  y: () => number;
  espaco: (altura: number) => void;
  titulo: (texto: string) => void;
  secao: (texto: string) => void;
  paragrafo: (texto: string, opcoes?: { negrito?: boolean; tamanho?: number }) => void;
  campos: (pares: [string, string][], colunas?: number) => void;
  tabela: (cabecalho: string[], linhas: string[][], larguras: number[]) => void;
  aviso: (texto: string) => void;
  assinaturas: (rotulos: string[]) => void;
  pular: (mm: number) => void;
  salvar: (nomeArquivo: string) => void;
};

async function novoDocumento(rodapeTexto: string): Promise<Doc> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 15;
  const larg = W - 2 * M;
  let y = M;

  const logo = await carregarLogo();

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
    doc.text(EMPRESA.nome, W - M, y + 5, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(EMPRESA.linha1, W - M, y + 10, { align: "right" });
    doc.text(EMPRESA.linha2, W - M, y + 14.5, { align: "right" });
    doc.text(EMPRESA.linha3, W - M, y + 19, { align: "right" });

    y += logoH + 5;
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(1);
    doc.line(M, y, W - M, y);
    doc.setLineWidth(0.2);
    y += 7;
  };

  const rodape = () => {
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.5);
    doc.line(M, H - M - 6, W - M, H - M - 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`${rodapeTexto} · Grupo GRD · grupogrdbrasil.com.br`, W / 2, H - M - 2, {
      align: "center",
    });
  };

  const novaPagina = () => {
    rodape();
    doc.addPage();
    cabecalho();
  };

  const espaco = (altura: number) => {
    if (y + altura > H - M - 12) novaPagina();
  };

  cabecalho();

  return {
    doc,
    larg,
    m: M,
    y: () => y,
    espaco,
    pular: (mm: number) => {
      y += mm;
    },

    titulo(texto: string) {
      espaco(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...NAVY);
      doc.text(texto.toUpperCase(), M, y);
      y += 8;
    },

    secao(texto: string) {
      espaco(12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...NAVY);
      doc.text(texto.toUpperCase(), M, y);
      y += 1.5;
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(0.6);
      doc.line(M, y, M + 45, y);
      doc.setLineWidth(0.2);
      y += 5;
    },

    paragrafo(texto: string, opcoes) {
      const tamanho = opcoes?.tamanho ?? 9.5;
      doc.setFont("helvetica", opcoes?.negrito ? "bold" : "normal");
      doc.setFontSize(tamanho);
      doc.setTextColor(...TEXT_DARK);
      const linhas = doc.splitTextToSize(texto, larg) as string[];
      for (const linha of linhas) {
        espaco(6);
        doc.text(linha, M, y);
        y += tamanho * 0.52;
      }
      y += 2.5;
    },

    /** Grade de rótulo/valor. Duas colunas por padrão. */
    campos(pares, colunas = 2) {
      const largCol = larg / colunas;
      let coluna = 0;
      let linhaY = y;
      for (const [rotulo, valor] of pares) {
        if (coluna === 0) {
          espaco(11);
          linhaY = y;
        }
        const x = M + coluna * largCol;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(rotulo.toUpperCase(), x, linhaY);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...TEXT_DARK);
        const texto = (doc.splitTextToSize(valor || "—", largCol - 4) as string[])[0] ?? "—";
        doc.text(texto, x, linhaY + 4.5);
        coluna += 1;
        if (coluna >= colunas) {
          coluna = 0;
          y = linhaY + 10;
        }
      }
      if (coluna !== 0) y = linhaY + 10;
      y += 2;
    },

    // O parâmetro chama-se `colunas` e não `cabecalho` de propósito:
    // `cabecalho` já é a função que desenha o topo da página, e o
    // nome repetido a escondia justamente na quebra de página.
    tabela(colunas, linhas, larguras) {
      const total = larguras.reduce((a, b) => a + b, 0);
      const cols = larguras.map((l) => (l / total) * larg);

      const desenharCabecalho = () => {
        espaco(10);
        doc.setFillColor(...NAVY);
        doc.rect(M, y, larg, 7, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        let x = M;
        colunas.forEach((t, i) => {
          doc.text(t.toUpperCase(), x + 2, y + 4.7);
          x += cols[i];
        });
        y += 7;
      };

      desenharCabecalho();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      linhas.forEach((linha, idx) => {
        // Altura da linha acompanha a célula que mais quebra.
        const celulas = linha.map((c, i) => doc.splitTextToSize(c || "—", cols[i] - 4) as string[]);
        const altura = Math.max(7, ...celulas.map((c) => c.length * 4 + 3));
        if (y + altura > doc.internal.pageSize.getHeight() - M - 12) {
          rodape();
          doc.addPage();
          cabecalho();
          desenharCabecalho();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }
        if (idx % 2 === 1) {
          doc.setFillColor(...GREY_BG);
          doc.rect(M, y, larg, altura, "F");
        }
        doc.setTextColor(...TEXT_DARK);
        let x = M;
        celulas.forEach((c, i) => {
          c.forEach((t, j) => doc.text(t, x + 2, y + 4.7 + j * 4));
          x += cols[i];
        });
        doc.setDrawColor(...GREY_LINE);
        doc.line(M, y + altura, M + larg, y + altura);
        y += altura;
      });
      y += 4;
    },

    aviso(texto: string) {
      const linhas = doc.splitTextToSize(texto, larg - 8) as string[];
      const altura = linhas.length * 4.2 + 6;
      espaco(altura + 2);
      doc.setFillColor(...GREY_BG);
      doc.rect(M, y, larg, altura, "F");
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(1.2);
      doc.line(M, y, M, y + altura);
      doc.setLineWidth(0.2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_DARK);
      linhas.forEach((l, i) => doc.text(l, M + 4, y + 5 + i * 4.2));
      y += altura + 5;
    },

    assinaturas(rotulos: string[]) {
      espaco(28);
      y += 12;
      const largCol = larg / rotulos.length;
      rotulos.forEach((rotulo, i) => {
        const x = M + i * largCol;
        doc.setDrawColor(...TEXT_MUTED);
        doc.line(x + 4, y, x + largCol - 8, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(rotulo, x + largCol / 2 - 4, y + 4.5, { align: "center" });
      });
      y += 12;
    },

    salvar(nomeArquivo: string) {
      rodape();
      doc.save(nomeArquivo);
    },
  };
}

/** Nome de arquivo sem acento nem espaço, para não quebrar download. */
function nomeArquivo(...partes: string[]): string {
  return (
    partes
      .join("-")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // acentos, agora separados pelo NFD
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() + ".pdf"
  );
}

const hoje = () => new Date().toLocaleDateString("pt-BR");

// ============================================================
// 1) Carta-proposta
// ============================================================
export type CartaProposta = {
  candidatoNome: string;
  cargo: string;
  obra: string;
  tipoContratacao: string;
  jornada: string;
  salario: number | null;
  beneficios: string;
  dataPrevistaInicio: string | null;
  validadeProposta: string | null;
  periodoExperiencia: string;
  responsavelNome: string;
};

export async function gerarCartaPropostaPDF(p: CartaProposta) {
  const d = await novoDocumento("Carta-proposta de trabalho");
  d.titulo("Proposta de trabalho");

  d.paragrafo(`Agudos-SP, ${hoje()}.`);
  d.paragrafo(`Prezado(a) ${p.candidatoNome},`);
  d.paragrafo(
    "É com satisfação que a GRD Projetos e Construções apresenta a proposta abaixo para a sua " +
      "contratação. Ela resume o que combinamos no processo seletivo e vale até a data indicada.",
  );

  d.secao("Condições propostas");
  d.campos([
    ["Cargo", p.cargo],
    ["Obra / local", p.obra],
    ["Tipo de contratação", p.tipoContratacao],
    ["Jornada", p.jornada],
    ["Salário", p.salario === null ? "A combinar" : brl(p.salario)],
    ["Início previsto", dataBr(p.dataPrevistaInicio)],
    ["Período de experiência", p.periodoExperiencia],
    ["Validade desta proposta", dataBr(p.validadeProposta)],
  ]);

  if (p.beneficios) {
    d.secao("Benefícios");
    d.paragrafo(p.beneficios);
  }

  d.aviso(
    "A contratação depende da entrega dos documentos, do exame admissional (ASO) com resultado apto e " +
      "das certificações de NR exigidas pelo cargo. Enquanto esses itens não estiverem completos, a " +
      "admissão não é concluída e o colaborador não é liberado para entrar em obra.",
  );

  d.paragrafo(
    "Para aceitar, assine as duas vias desta carta e devolva uma ao RH, ou responda pela área do " +
      "candidato no nosso site.",
  );

  d.assinaturas([`${p.responsavelNome}\nGrupo GRD`, `${p.candidatoNome}\nCandidato(a)`]);
  d.salvar(nomeArquivo("carta-proposta", p.candidatoNome));
}

// ============================================================
// 2) Ficha de admissão / registro de empregado
// ============================================================
export type FichaAdmissao = {
  codigo: string;
  candidatoNome: string;
  cpf: string;
  rg: string;
  dataNascimento: string | null;
  nomeMae: string;
  estadoCivil: string;
  nacionalidade: string;
  naturalidade: string;
  escolaridade: string;
  endereco: string;
  telefone: string;
  email: string;
  cargo: string;
  setor: string;
  obra: string;
  tipoContratacao: string;
  jornada: string;
  dataAdmissao: string | null;
  periodoExperiencia: string;
  salario: number | null;
  valeTransporte: boolean;
  valeRefeicao: boolean;
  pisNis: string;
  ctps: string;
  tituloEleitor: string;
  reservista: string;
  banco: string;
  agencia: string;
  conta: string;
  pix: string;
  dependentes: { nome: string; parentesco: string; nascimento: string; cpf: string }[];
  /** Deixe null quando quem imprime não pode ver salário. */
  mostrarSalario: boolean;
};

export async function gerarFichaAdmissaoPDF(f: FichaAdmissao) {
  const d = await novoDocumento(`Ficha de registro de empregado · ${f.codigo}`);
  d.titulo(`Ficha de admissão — ${f.codigo}`);

  d.secao("Dados pessoais");
  d.campos([
    ["Nome completo", f.candidatoNome],
    ["CPF", f.cpf],
    ["RG", f.rg],
    ["Data de nascimento", dataBr(f.dataNascimento)],
    ["Nome da mãe", f.nomeMae],
    ["Estado civil", f.estadoCivil],
    ["Nacionalidade", f.nacionalidade],
    ["Naturalidade", f.naturalidade],
    ["Escolaridade", f.escolaridade],
    ["Telefone", f.telefone],
    ["E-mail", f.email],
    ["Endereço", f.endereco],
  ]);

  d.secao("Documentos");
  d.campos([
    ["PIS / NIS", f.pisNis],
    ["CTPS", f.ctps],
    ["Título de eleitor", f.tituloEleitor],
    ["Certificado de reservista", f.reservista],
  ]);

  d.secao("Dados contratuais");
  d.campos([
    ["Cargo", f.cargo],
    ["Setor", f.setor],
    ["Obra", f.obra],
    ["Tipo de contratação", f.tipoContratacao],
    ["Jornada", f.jornada],
    ["Data de admissão", dataBr(f.dataAdmissao)],
    ["Período de experiência", f.periodoExperiencia],
    ...(f.mostrarSalario
      ? ([["Salário", f.salario === null ? "—" : brl(f.salario)]] as [string, string][])
      : []),
    ["Vale-transporte", f.valeTransporte ? "Sim" : "Não"],
    ["Vale-refeição", f.valeRefeicao ? "Sim" : "Não"],
  ]);

  d.secao("Dados bancários");
  d.campos([
    ["Banco", f.banco],
    ["Agência", f.agencia],
    ["Conta", f.conta],
    ["Chave PIX", f.pix],
  ]);

  if (f.dependentes.length > 0) {
    d.secao("Dependentes");
    d.tabela(
      ["Nome", "Parentesco", "Nascimento", "CPF"],
      f.dependentes.map((dep) => [dep.nome, dep.parentesco, dep.nascimento, dep.cpf]),
      [45, 20, 18, 22],
    );
  }

  d.paragrafo(
    "Declaro que as informações acima são verdadeiras e me comprometo a comunicar ao RH qualquer " +
      "alteração de endereço, estado civil ou dependentes.",
  );
  d.assinaturas([`${f.candidatoNome}\nColaborador(a)`, "Grupo GRD\nRH / DP"]);
  d.salvar(nomeArquivo("ficha-admissao", f.codigo, f.candidatoNome));
}

// ============================================================
// 3) Parecer de entrevista
// ============================================================
export type ParecerPdf = {
  candidatoNome: string;
  vaga: string;
  cargo: string;
  tipo: string;
  avaliadorNome: string;
  dataHora: string | null;
  local: string;
  criterios: { criterio: string; nota: number }[];
  notaFinal: number | null;
  parecer: string;
  recomendacao: string;
};

export async function gerarParecerEntrevistaPDF(p: ParecerPdf) {
  const d = await novoDocumento("Parecer de entrevista · documento interno");
  d.titulo("Parecer de entrevista");

  d.campos(
    [
      ["Candidato", p.candidatoNome],
      ["Vaga", p.vaga],
      ["Cargo", p.cargo],
      ["Tipo de avaliação", p.tipo],
      ["Avaliador", p.avaliadorNome],
      ["Data e hora", p.dataHora ? new Date(p.dataHora).toLocaleString("pt-BR") : "—"],
      ["Local", p.local],
      ["Recomendação", p.recomendacao],
    ],
    2,
  );

  d.secao("Notas por critério");
  d.tabela(
    ["Critério", "Nota (0 a 10)"],
    p.criterios.map((c) => [c.criterio, String(c.nota)]),
    [70, 25],
  );
  d.paragrafo(
    `Nota final: ${p.notaFinal === null ? "—" : p.notaFinal.toFixed(1).replace(".", ",")}`,
    { negrito: true, tamanho: 11 },
  );

  d.secao("Parecer");
  d.paragrafo(p.parecer || "—");

  d.aviso(
    "Documento interno. Não deve ser entregue ao candidato nem anexado a documentação enviada a " +
      "cliente. O candidato acompanha apenas a etapa em que está.",
  );
  d.assinaturas([`${p.avaliadorNome}\nAvaliador(a)`]);
  d.salvar(nomeArquivo("parecer", p.candidatoNome, p.tipo));
}

// ============================================================
// 4) Termo de consentimento LGPD
// ============================================================
export type TermoLgpd = {
  candidatoNome: string;
  cpf: string;
  retencaoMeses: number;
};

export async function gerarTermoLgpdPDF(t: TermoLgpd) {
  const d = await novoDocumento("Termo de consentimento · LGPD (Lei 13.709/2018)");
  d.titulo("Consentimento para tratamento de dados");

  d.campos([
    ["Titular dos dados", t.candidatoNome],
    ["CPF", t.cpf],
  ]);

  d.secao("O que coletamos");
  d.paragrafo(
    "Nome, CPF, RG, data de nascimento, endereço, telefone, e-mail, currículo, escolaridade, " +
      "experiência profissional, certificações de segurança do trabalho (NRs), CNH quando o cargo " +
      "exige, e as informações que você registrar ao se candidatar.",
  );

  d.secao("Para que usamos");
  d.paragrafo(
    "Exclusivamente para conduzir processos seletivos da GRD Projetos e Construções: avaliar seu " +
      "perfil para as vagas, entrar em contato, e — em caso de contratação — dar entrada na admissão " +
      "junto ao departamento pessoal e aos órgãos exigidos por lei.",
  );

  d.secao("Por quanto tempo");
  d.paragrafo(
    `Seus dados ficam guardados por ${t.retencaoMeses} meses a partir deste consentimento, para que ` +
      "possamos considerá-lo em vagas futuras. Vencido o prazo, o cadastro é anonimizado: nome, CPF, " +
      "contatos e currículo são apagados.",
  );

  d.secao("Com quem compartilhamos");
  d.paragrafo(
    "Em caso de contratação, com a contabilidade e com o cliente da obra, quando ele exigir " +
      "documentação da equipe para liberação de acesso — o que é comum em planta industrial. " +
      "Não vendemos nem cedemos seus dados para publicidade.",
  );

  d.secao("Seus direitos");
  d.paragrafo(
    "Você pode, a qualquer momento, pedir acesso aos seus dados, correção, atualização ou exclusão. " +
      "Basta escrever para o RH ou usar a área do candidato no nosso site. A exclusão apaga seus " +
      "dados pessoais; mantemos apenas o registro estatístico do processo, sem identificação.",
  );

  d.aviso(
    "Ao assinar, você concorda com o tratamento dos seus dados nos termos acima. A recusa não impede " +
      "sua participação em processo seletivo presencial, mas impede que guardemos seu currículo para " +
      "vagas futuras.",
  );

  d.assinaturas([`${t.candidatoNome}\nTitular dos dados`, "Grupo GRD\nRH / DP"]);
  d.salvar(nomeArquivo("termo-lgpd", t.candidatoNome));
}

// ============================================================
// 5) Ficha do colaborador — a que o cliente industrial pede
// ============================================================
export type FichaColaborador = {
  nome: string;
  matricula: string;
  cpf: string;
  rg: string;
  cargo: string;
  setor: string;
  obra: string;
  situacao: string;
  dataAdmissao: string | null;
  telefone: string;
  contatoEmergencia: string;
  apto: boolean;
  pendencias: string[];
  documentos: {
    tipo: string;
    numero: string;
    emissao: string;
    vencimento: string;
    situacao: string;
  }[];
  epis: { termo: string; data: string; assinado: boolean; itens: string }[];
};

export async function gerarFichaColaboradorPDF(f: FichaColaborador) {
  const d = await novoDocumento(`Ficha do colaborador · ${f.matricula || f.nome}`);
  d.titulo("Ficha do colaborador");

  d.campos([
    ["Nome", f.nome],
    ["Matrícula", f.matricula],
    ["CPF", f.cpf],
    ["RG", f.rg],
    ["Cargo", f.cargo],
    ["Setor", f.setor],
    ["Obra atual", f.obra],
    ["Situação", f.situacao],
    ["Admissão", dataBr(f.dataAdmissao)],
    ["Telefone", f.telefone],
    ["Contato de emergência", f.contatoEmergencia],
    ["Apto para alocação", f.apto ? "Sim" : "Não"],
  ]);

  if (!f.apto && f.pendencias.length > 0) {
    d.aviso(
      "Este colaborador NÃO está apto para entrar em obra. Pendências: " +
        f.pendencias.join("; ") +
        ".",
    );
  }

  d.secao("Documentos e validades");
  if (f.documentos.length === 0) {
    d.paragrafo("Nenhum documento cadastrado.");
  } else {
    d.tabela(
      ["Documento", "Número", "Emissão", "Vencimento", "Situação"],
      f.documentos.map((doc) => [doc.tipo, doc.numero, doc.emissao, doc.vencimento, doc.situacao]),
      [38, 22, 18, 18, 20],
    );
  }

  d.secao("Entregas de EPI");
  if (f.epis.length === 0) {
    d.paragrafo("Nenhuma entrega registrada.");
  } else {
    d.tabela(
      ["Termo", "Data", "Assinado", "Itens"],
      f.epis.map((e) => [e.termo || "—", e.data, e.assinado ? "Sim" : "Não", e.itens]),
      [20, 18, 16, 60],
    );
  }

  d.paragrafo(
    `Documento emitido em ${hoje()}. As validades refletem o cadastro do RH nesta data.`,
    { tamanho: 8 },
  );
  d.salvar(nomeArquivo("ficha-colaborador", f.matricula || f.nome));
}

// ============================================================
// 6) Requisição de vaga
// ============================================================
export type RequisicaoVaga = {
  codigo: string;
  titulo: string;
  cargo: string;
  setor: string;
  obra: string;
  tipoContratacao: string;
  posicoes: number;
  jornada: string;
  local: string;
  motivoAbertura: string;
  dataAbertura: string | null;
  dataPrevistaInicio: string | null;
  dataLimite: string | null;
  solicitante: string;
  descricao: string;
  requisitos: string;
  nrsExigidas: string[];
  faixaMin: number | null;
  faixaMax: number | null;
  mostrarFaixa: boolean;
};

export async function gerarRequisicaoVagaPDF(v: RequisicaoVaga) {
  const d = await novoDocumento(`Requisição de vaga · ${v.codigo}`);
  d.titulo(`Requisição de vaga — ${v.codigo}`);

  d.campos([
    ["Vaga", v.titulo],
    ["Cargo", v.cargo],
    ["Setor", v.setor],
    ["Obra", v.obra],
    ["Tipo de contratação", v.tipoContratacao],
    ["Posições", String(v.posicoes)],
    ["Jornada", v.jornada],
    ["Local de trabalho", v.local],
    ["Motivo da abertura", v.motivoAbertura],
    ["Solicitante", v.solicitante],
    ["Aberta em", dataBr(v.dataAbertura)],
    ["Início previsto", dataBr(v.dataPrevistaInicio)],
    ["Data limite", dataBr(v.dataLimite)],
    ...(v.mostrarFaixa
      ? ([
          [
            "Faixa salarial",
            v.faixaMin === null && v.faixaMax === null
              ? "—"
              : `${brl(v.faixaMin)} a ${brl(v.faixaMax)}`,
          ],
        ] as [string, string][])
      : []),
  ]);

  d.secao("Descrição");
  d.paragrafo(v.descricao || "—");

  d.secao("Requisitos");
  d.paragrafo(v.requisitos || "—");

  if (v.nrsExigidas.length > 0) {
    d.aviso(
      "Exigências de segurança do cargo: " +
        v.nrsExigidas.join(", ") +
        ". Sem essas certificações válidas o colaborador não é liberado para entrar em obra.",
    );
  }

  d.assinaturas(["Solicitante", "RH / DP", "Diretoria"]);
  d.salvar(nomeArquivo("requisicao-vaga", v.codigo));
}
