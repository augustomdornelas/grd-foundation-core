// ============================================================
// Termo de EPI assinado por FOTO
// ------------------------------------------------------------
// A foto do colaborador recebendo os EPIs substitui a assinatura em
// papel. A ordem abaixo é o que garante a regra "nunca assinado sem a
// foto salva":
//
//   1. sobe a foto      termos-epi/<ano>/<numero_termo>/foto.jpg
//   2. gera o PDF com a foto e sobe   .../termo.pdf
//   3. SÓ ENTÃO marca a entrega como ASSINADO
//
// Se 1 ou 2 falhar, a entrega nem é tocada: continua PENDENTE e a tela
// oferece "TENTAR DE NOVO". Se 3 falhar, os arquivos ficam no Storage
// mas o termo continua PENDENTE — tentar de novo sobrescreve os dois
// (o bucket só deixa sobrescrever enquanto o termo não foi assinado;
// ver a migration 20260921100000_epis_termo_foto.sql).
//
// O bucket é PRIVADO (a foto mostra o rosto de alguém): leitura só por
// URL assinada, de vida curta.
// ============================================================
import { supabase } from "@/integrations/supabase/client";
import { epiActions, type Entrega, type EntregaItem, type Funcionario } from "@/lib/epis-store";
import {
  montarTermoEpiPDF,
  nomeArquivoTermoEpi,
  type TermoEpiData,
  type TermoEpiFoto,
} from "@/lib/termo-epi-pdf";

const BUCKET = "termos-epi";
const LADO_MAIOR = 1280;
const QUALIDADE_JPEG = 0.8;

// ------------------------------------------------------------
// Dados do termo
// ------------------------------------------------------------
/**
 * Monta o TermoEpiData de uma entrega. Tudo dos itens vem do snapshot
 * gravado na entrega, não do catálogo: o termo antigo mostra o que foi
 * entregue mesmo que o EPI tenha mudado ou sido excluído depois.
 */
export function dadosDoTermo(
  entrega: Entrega,
  funcionario: Funcionario | undefined,
  itens: EntregaItem[],
): TermoEpiData {
  return {
    numero: entrega.numeroTermo,
    emissao: entrega.dataEntrega,
    funcionario: {
      nome: funcionario?.nome ?? "",
      cpf: funcionario?.cpf,
      rg: funcionario?.rg,
      cargo: funcionario?.cargo,
      setor: funcionario?.setor,
      matricula: funcionario?.matricula,
      dataAdmissao: funcionario?.dataAdmissao,
    },
    itens: itens.map((i) => ({
      epiNome: i.epiNome,
      ca: i.ca,
      fabricante: i.fabricante,
      unidade: i.unidade,
      fotoUrl: i.epiFotoUrl,
      quantidade: i.quantidade,
      motivo: i.motivo,
      dataEntrega: i.dataEntrega,
      dataValidade: i.dataValidade,
    })),
    responsavelEntrega: entrega.responsavelEntrega,
    responsavelCargo: entrega.responsavelCargo,
    observacoes: entrega.observacoes,
  };
}

// ------------------------------------------------------------
// Foto
// ------------------------------------------------------------
export type FotoReduzida = {
  blob: Blob;
  dataUrl: string;
  w: number;
  h: number;
};

/**
 * Lado maior em 1280 px, JPEG 0.8. Uma foto de celular (4000 px, 3–5 MB)
 * cai para ~200 KB: sobe rápido no 4G da obra e não incha o PDF.
 *
 * createImageBitmap com imageOrientation "from-image" endireita a foto
 * pelo EXIF — sem isso, foto tirada com o celular em pé chega deitada.
 * Navegador que não tem createImageBitmap cai no <img>, que hoje também
 * respeita o EXIF.
 */
export async function reduzirFoto(arquivo: File): Promise<FotoReduzida> {
  let fonte: CanvasImageSource;
  let largura: number;
  let altura: number;
  let liberar = () => {};

  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    fonte = bmp;
    largura = bmp.width;
    altura = bmp.height;
    liberar = () => bmp.close();
  } catch {
    const url = URL.createObjectURL(arquivo);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("Não foi possível ler a foto."));
        el.src = url;
      });
      fonte = img;
      largura = img.naturalWidth;
      altura = img.naturalHeight;
    } finally {
      liberar = () => URL.revokeObjectURL(url);
    }
  }

  try {
    const escala = Math.min(1, LADO_MAIOR / Math.max(largura, altura, 1));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a foto.");
    ctx.fillStyle = "#ffffff"; // JPEG não tem transparência
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(fonte, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Não foi possível comprimir a foto."))),
        "image/jpeg",
        QUALIDADE_JPEG,
      ),
    );
    return { blob, dataUrl: canvas.toDataURL("image/jpeg", QUALIDADE_JPEG), w, h };
  } finally {
    liberar();
  }
}

// ------------------------------------------------------------
// Caminhos no Storage
// ------------------------------------------------------------
/** Sem acento, sem espaço, só [A-Za-z0-9._-]. */
function seguro(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * termos-epi/<ano>/<numero_termo>/. O número (EPI-2026-0001) já é seguro
 * e é ele que a policy do bucket compara para saber se o termo ainda
 * está aberto. Termo antigo sem número usa o id da entrega.
 */
export function pastaDoTermo(entrega: Entrega): string {
  const ano = (entrega.dataEntrega || new Date().toISOString()).slice(0, 4);
  const numero = seguro(entrega.numeroTermo) || seguro(entrega.id);
  return `${ano}/${numero}`;
}

// ------------------------------------------------------------
// Assinar
// ------------------------------------------------------------
export type ResultadoAssinatura = { ok: true } | { ok: false; erro: string };

/**
 * Sobe a foto, gera e sobe o PDF, marca ASSINADO e baixa o PDF para quem
 * está com o celular na mão. Ver a ordem no topo do arquivo.
 */
export async function assinarTermoComFoto(input: {
  entrega: Entrega;
  termo: TermoEpiData;
  foto: FotoReduzida;
  usuario: { id: string; nome: string };
}): Promise<ResultadoAssinatura> {
  const { entrega, termo, foto, usuario } = input;
  const pasta = pastaDoTermo(entrega);
  const fotoPath = `${pasta}/foto.jpg`;
  const pdfPath = `${pasta}/termo.pdf`;
  const storage = supabase.storage.from(BUCKET);

  // 1. Foto. upsert: tentar de novo sobrescreve a tentativa anterior.
  const upFoto = await storage.upload(fotoPath, foto.blob, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (upFoto.error) return { ok: false, erro: `a foto não subiu (${upFoto.error.message})` };

  // 2. PDF com a foto.
  const assinadoEm = new Date();
  const fotoPdf: TermoEpiFoto = {
    dataUrl: foto.dataUrl,
    w: foto.w,
    h: foto.h,
    registradoEm: assinadoEm,
    registradoPor: usuario.nome,
  };
  let doc;
  try {
    doc = await montarTermoEpiPDF({ ...termo, fotoRecebimento: fotoPdf });
  } catch (err) {
    return {
      ok: false,
      erro: `o PDF não foi gerado (${err instanceof Error ? err.message : "erro desconhecido"})`,
    };
  }
  const pdf = doc.output("blob");
  const upPdf = await storage.upload(pdfPath, pdf, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (upPdf.error) return { ok: false, erro: `o PDF não subiu (${upPdf.error.message})` };

  // 3. Só agora a entrega vira ASSINADO.
  const erro = await epiActions.registrarAssinaturaComFoto({
    entregaId: entrega.id,
    fotoPath,
    pdfPath,
    assinadoEm,
    assinadoPor: usuario.id || null,
  });
  if (erro) return { ok: false, erro: `o termo não foi marcado como assinado (${erro})` };

  // Baixar é o último passo e não pode desfazer nada: se o navegador
  // bloquear o download, o termo já está salvo e assinado.
  try {
    doc.save(nomeArquivoTermoEpi(termo));
  } catch {
    /* o PDF continua no Storage; dá para baixar pela lista */
  }
  return { ok: true };
}

// ------------------------------------------------------------
// Leitura (bucket privado)
// ------------------------------------------------------------
/** URL assinada de 5 minutos para mostrar a foto na tela. */
export async function urlDaFoto(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  return error ? null : data.signedUrl;
}

/**
 * Baixa o termo.pdf salvo — o mesmo arquivo gerado na assinatura, e não
 * um PDF novo. A URL assinada com `download` faz o servidor mandar como
 * anexo, com o nome de arquivo certo.
 */
export async function baixarTermoSalvo(path: string, nomeArquivo: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60, { download: seguro(nomeArquivo) || "termo-epi.pdf" });
  if (error) return error.message;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return null;
}
