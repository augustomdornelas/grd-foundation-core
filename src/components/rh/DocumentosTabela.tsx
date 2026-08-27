// ============================================================
// Tabela de documentos com vencimento
// ------------------------------------------------------------
// Serve nas duas telas: na ficha de um colaborador e na visão
// consolidada de /app/rh/documentos, que é a que se abre quando o
// cliente industrial pede a documentação da equipe.
//
// A situação (vencido, vence em 7, vence em 30) vem de
// vw_rh_documentos_vencimento, recalculada na leitura. A coluna
// `status` da tabela é cache e pode estar velha — por isso não é ela
// que aparece aqui.
// ============================================================
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileText, ShieldAlert } from "lucide-react";
import { dataBr } from "@/lib/rh-regras";
import { urlAssinada } from "@/lib/rh-store";
import {
  SITUACAO_DOC_ESTILO,
  SITUACAO_DOC_LABEL,
  type DocumentoVencimento,
} from "@/lib/rh-colaboradores-store";

export function SituacaoDocumento({ doc }: { doc: DocumentoVencimento }) {
  const rotulo =
    doc.situacaoDocumento === "vencido"
      ? "Vencido"
      : doc.situacaoDocumento === "sem_vencimento"
        ? "Sem vencimento"
        : doc.diasParaVencer !== null && doc.diasParaVencer >= 0
          ? `${doc.diasParaVencer} ${doc.diasParaVencer === 1 ? "dia" : "dias"}`
          : SITUACAO_DOC_LABEL[doc.situacaoDocumento];

  return (
    <span
      title={SITUACAO_DOC_LABEL[doc.situacaoDocumento]}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        SITUACAO_DOC_ESTILO[doc.situacaoDocumento]
      }`}
    >
      {doc.bloqueiaAlocacao && doc.situacaoDocumento === "vencido" && (
        <ShieldAlert className="h-3 w-3" />
      )}
      {rotulo}
    </span>
  );
}

async function abrir(path: string | null) {
  const url = await urlAssinada("documentos-rh", path);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

export function DocumentosTabela({
  documentos,
  mostrarColaborador = false,
  nomeDaObra,
  onEditar,
  vazio,
}: {
  documentos: DocumentoVencimento[];
  mostrarColaborador?: boolean;
  nomeDaObra?: (projetoId: string | null) => string;
  onEditar?: (documentoId: string) => void;
  vazio?: React.ReactNode;
}) {
  if (documentos.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        {vazio ?? "Nenhum documento cadastrado."}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {mostrarColaborador && <TableHead>Colaborador</TableHead>}
            {mostrarColaborador && nomeDaObra && <TableHead>Obra</TableHead>}
            <TableHead>Documento</TableHead>
            <TableHead>Número</TableHead>
            <TableHead>Emissão</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Bloqueia obra</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {documentos.map((d) => (
            <TableRow
              key={d.documentoId}
              className={d.situacaoDocumento === "vencido" ? "bg-red-50/50" : ""}
            >
              {mostrarColaborador && (
                <TableCell>
                  <div className="font-medium text-[#213368]">{d.funcionarioNome}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.matricula ? `${d.matricula} · ` : ""}
                    {d.cargo || "—"}
                  </div>
                </TableCell>
              )}
              {mostrarColaborador && nomeDaObra && (
                <TableCell className="text-sm">{nomeDaObra(d.projetoId)}</TableCell>
              )}
              <TableCell className="text-sm">{d.tipoNome}</TableCell>
              <TableCell className="text-sm">{d.numero || "—"}</TableCell>
              <TableCell className="text-sm">{dataBr(d.dataEmissao)}</TableCell>
              <TableCell className="text-sm">{dataBr(d.dataVencimento)}</TableCell>
              <TableCell>
                <SituacaoDocumento doc={d} />
              </TableCell>
              <TableCell className="text-sm">{d.bloqueiaAlocacao ? "Sim" : "Não"}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {d.arquivoPath && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Abrir arquivo"
                      onClick={() => void abrir(d.arquivoPath)}
                    >
                      <FileText className="h-4 w-4" />
                    </Button>
                  )}
                  {onEditar && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => onEditar(d.documentoId)}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
