import { PDFViewer, PDFDownloadLink } from "@react-pdf/renderer";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  TermoEmprestimoDocument, termoFileName,
  type TermoEmprestimoData,
} from "@/lib/termo-emprestimo-pdf";

export default function TermoPreview({
  t, onClose,
}: { t: TermoEmprestimoData; onClose: () => void }) {
  return (
    <div className="flex flex-col" style={{ height: "80vh" }}>
      <div className="flex-1 bg-[#f0f0f2]">
        <PDFViewer style={{ width: "100%", height: "100%", border: 0 }} showToolbar={false}>
          <TermoEmprestimoDocument t={t} />
        </PDFViewer>
      </div>
      <div className="flex items-center justify-end gap-2 border-t bg-white px-6 py-3">
        <Button variant="outline" onClick={onClose}>Fechar</Button>
        <PDFDownloadLink
          document={<TermoEmprestimoDocument t={t} />}
          fileName={termoFileName(t)}
        >
          {({ loading }) => (
            <Button className="bg-[#F37032] text-white hover:bg-[#d95d24]">
              <Download className="mr-2 h-4 w-4" />
              {loading ? "Preparando…" : "Baixar PDF"}
            </Button>
          )}
        </PDFDownloadLink>
      </div>
    </div>
  );
}
