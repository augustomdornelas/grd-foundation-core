// ============================================================
// Checklist da admissão — upload e conferência item a item
// ------------------------------------------------------------
// Agrupado por categoria, na ordem em que a coisa acontece: documento,
// exame, treinamento, EPI, contrato e cadastros.
//
// Aprovar um item é privilégio de RH, Diretoria e Administrativo — e
// do Almoxarifado nos itens de EPI, porque é ele quem entrega e colhe
// a assinatura do termo. Quem barra isso é uma trigger no banco; aqui
// o botão só não aparece.
// ============================================================
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Upload,
  FileText,
  Check,
  X,
  MinusCircle,
  MoreHorizontal,
  Loader2,
  Paperclip,
} from "lucide-react";
import { dataBr } from "@/lib/rh-regras";
import { urlAssinada } from "@/lib/rh-store";
import {
  admissaoActions,
  CATEGORIA_LABEL,
  ITEM_STATUS_LABEL,
  RESPONSAVEL_LABEL,
  type AdmissaoItem,
  type ItemCategoria,
  type ItemStatus,
} from "@/lib/rh-admissao-store";

const ORDEM_CATEGORIAS: ItemCategoria[] = [
  "documento",
  "exame",
  "treinamento",
  "epi",
  "contrato",
  "sistema",
];

const STATUS_ESTILO: Record<ItemStatus, string> = {
  pendente: "bg-muted text-muted-foreground",
  enviado: "bg-sky-100 text-sky-800",
  aprovado: "bg-emerald-100 text-emerald-800",
  reprovado: "bg-red-100 text-red-700",
  dispensado: "bg-slate-200 text-slate-600",
};

export function AdmissaoChecklist({
  itens,
  candidatoId,
  podeConferir,
  ehAlmoxarifado,
  somenteLeitura,
}: {
  itens: AdmissaoItem[];
  candidatoId: string;
  podeConferir: boolean;
  ehAlmoxarifado: boolean;
  somenteLeitura: boolean;
}) {
  const grupos = ORDEM_CATEGORIAS.map((cat) => ({
    categoria: cat,
    itens: itens.filter((i) => i.categoria === cat).sort((a, b) => a.ordem - b.ordem),
  })).filter((g) => g.itens.length > 0);

  if (grupos.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Esta admissão ainda não tem checklist. Use "Regerar checklist" para montá-lo a partir do
        modelo do cargo.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.categoria}>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {CATEGORIA_LABEL[g.categoria]}
          </h4>
          <div className="divide-y rounded-lg border">
            {g.itens.map((item) => (
              <ItemLinha
                key={item.id}
                item={item}
                candidatoId={candidatoId}
                podeConferir={podeConferir || (ehAlmoxarifado && item.categoria === "epi")}
                somenteLeitura={somenteLeitura}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemLinha({
  item,
  candidatoId,
  podeConferir,
  somenteLeitura,
}: {
  item: AdmissaoItem;
  candidatoId: string;
  podeConferir: boolean;
  somenteLeitura: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [editandoDatas, setEditandoDatas] = useState(false);
  const [dataDoc, setDataDoc] = useState(item.dataDocumento ?? "");
  const [dataVenc, setDataVenc] = useState(item.dataVencimento ?? "");

  async function enviar(arquivo: File) {
    setEnviando(true);
    const r = await admissaoActions.enviarArquivo(item, candidatoId, arquivo);
    setEnviando(false);
    if (r.ok) toast.success(`${item.titulo}: arquivo enviado.`);
    else toast.error(r.erro ?? "Falha no envio.");
  }

  async function mudarStatus(status: ItemStatus) {
    const r = await admissaoActions.salvarItem(item.id, { status });
    if (r.ok) toast.success(`${item.titulo}: ${ITEM_STATUS_LABEL[status].toLowerCase()}.`);
    else toast.error(r.erro ?? "Não foi possível conferir o item.");
  }

  async function salvarDatas() {
    const r = await admissaoActions.salvarItem(item.id, {
      dataDocumento: dataDoc || null,
      dataVencimento: dataVenc || null,
    });
    setEditandoDatas(false);
    if (!r.ok) toast.error(r.erro ?? "Não foi possível salvar as datas.");
  }

  async function abrirArquivo() {
    const url = await urlAssinada("documentos-rh", item.arquivoPath);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const vencido =
    item.dataVencimento !== null && item.dataVencimento < new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-wrap items-start gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[#213368]">{item.titulo}</p>
          {item.obrigatorio ? (
            <Badge variant="outline" className="h-5 text-[10px]">
              obrigatório
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 text-[10px] text-muted-foreground">
              opcional
            </Badge>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_ESTILO[item.status]}`}
          >
            {ITEM_STATUS_LABEL[item.status]}
          </span>
          {vencido && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              vencido
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground">
          Responsável: {RESPONSAVEL_LABEL[item.responsavel]}
          {item.instrucoes ? ` · ${item.instrucoes}` : ""}
        </p>

        {(item.dataDocumento || item.dataVencimento) && !editandoDatas && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.dataDocumento && `Emitido em ${dataBr(item.dataDocumento)}`}
            {item.dataDocumento && item.dataVencimento && " · "}
            {item.dataVencimento && `Vence em ${dataBr(item.dataVencimento)}`}
          </p>
        )}

        {editandoDatas && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Emissão
              <Input
                type="date"
                value={dataDoc}
                onChange={(e) => setDataDoc(e.target.value)}
                className="mt-0.5 h-8 w-40"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Vencimento
              <Input
                type="date"
                value={dataVenc}
                onChange={(e) => setDataVenc(e.target.value)}
                className="mt-0.5 h-8 w-40"
              />
            </label>
            <Button size="sm" className="h-8" onClick={salvarDatas}>
              Salvar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setEditandoDatas(false)}
            >
              Cancelar
            </Button>
          </div>
        )}

        {item.conferidoEm && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Conferido em {dataBr(item.conferidoEm)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {item.arquivoPath && (
          <Button size="sm" variant="outline" className="h-8" onClick={abrirArquivo}>
            <FileText className="mr-1 h-3.5 w-3.5" /> Ver
          </Button>
        )}

        {!somenteLeitura && item.categoria !== "sistema" && item.categoria !== "epi" && (
          <>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void enviar(f);
                e.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={enviando}
              onClick={() => inputRef.current?.click()}
            >
              {enviando ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : item.arquivoPath ? (
                <Paperclip className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Upload className="mr-1 h-3.5 w-3.5" />
              )}
              {item.arquivoPath ? "Trocar" : "Anexar"}
            </Button>
          </>
        )}

        {!somenteLeitura && podeConferir && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label={`Conferir ${item.titulo}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => mudarStatus("aprovado")}>
                <Check className="mr-2 h-4 w-4 text-emerald-600" /> Aprovar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => mudarStatus("reprovado")}>
                <X className="mr-2 h-4 w-4 text-red-600" /> Reprovar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => mudarStatus("dispensado")}>
                <MinusCircle className="mr-2 h-4 w-4" /> Dispensar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => mudarStatus("pendente")}>
                Voltar para pendente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditandoDatas(true)}>
                Editar datas
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
