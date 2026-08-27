// ============================================================
// Parecer de entrevista
// ------------------------------------------------------------
// Nota por critério de 0 a 10, parecer escrito e recomendação. A média
// dos critérios vira a nota final, e o banco recalcula o score da
// candidatura a partir dela — por trigger, porque o engenheiro que
// registra o parecer não tem permissão de escrever em rh_candidaturas.
//
// O parecer é interno: o candidato nunca vê nada disto.
// ============================================================
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import {
  AVALIACAO_TIPO_LABEL,
  CRITERIOS_PADRAO,
  RECOMENDACAO_LABEL,
  mediaCriterios,
  notaValida,
  type CriterioNota,
} from "@/lib/rh-regras";
import { useCurrentUser } from "@/lib/current-user";
import type { Avaliacao, AvaliacaoInput } from "@/lib/rh-store";

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  nao_compareceu: "Não compareceu",
  cancelada: "Cancelada",
};

function criteriosIniciais(existente?: Avaliacao): CriterioNota[] {
  if (existente && existente.criterios.length > 0) return existente.criterios;
  return CRITERIOS_PADRAO.map((c) => ({ criterio: c, nota: 0 }));
}

export function AvaliacaoDialog({
  aberto,
  candidaturaId,
  candidatoNome,
  existente,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  candidaturaId: string;
  candidatoNome: string;
  existente?: Avaliacao;
  onFechar: () => void;
  onSalvar: (input: AvaliacaoInput) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const user = useCurrentUser();
  const [tipo, setTipo] = useState("entrevista_rh");
  const [status, setStatus] = useState("realizada");
  const [dataHora, setDataHora] = useState("");
  const [local, setLocal] = useState("");
  const [criterios, setCriterios] = useState<CriterioNota[]>(criteriosIniciais());
  const [parecer, setParecer] = useState("");
  const [recomendacao, setRecomendacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setTipo(existente?.tipo ?? "entrevista_rh");
    setStatus(existente?.status ?? "realizada");
    setDataHora(existente?.dataHora ? existente.dataHora.slice(0, 16) : "");
    setLocal(existente?.local ?? "");
    setCriterios(criteriosIniciais(existente));
    setParecer(existente?.parecer ?? "");
    setRecomendacao(existente?.recomendacao ?? "");
    setErro("");
    setSalvando(false);
  }, [aberto, existente]);

  const media = mediaCriterios(criterios);
  // Parecer só é exigido quando a entrevista aconteceu — é o mesmo
  // CHECK que existe na tabela.
  const precisaParecer = status === "realizada";
  const podeSalvar = !salvando && (!precisaParecer || (notaValida(parecer) && recomendacao !== ""));

  function setNota(i: number, valor: string) {
    const n = Math.max(0, Math.min(10, Number(valor.replace(",", ".")) || 0));
    setCriterios((cs) => cs.map((c, idx) => (idx === i ? { ...c, nota: n } : c)));
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro("");
    const r = await onSalvar({
      id: existente?.id,
      candidaturaId,
      tipo,
      avaliadorId: existente?.avaliadorId ?? user.id ?? null,
      avaliadorNome: existente?.avaliadorNome || user.nome,
      dataHora: dataHora ? new Date(dataHora).toISOString() : null,
      local,
      criterios,
      parecer,
      recomendacao: recomendacao || null,
      status,
    });
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar o parecer.");
      setSalvando(false);
      return;
    }
    onFechar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a && !salvando) onFechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {existente ? "Editar parecer" : "Registrar parecer"} — {candidatoNome}
          </DialogTitle>
          <DialogDescription>
            Fica no histórico do candidato e alimenta o score. O candidato nunca vê este texto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(AVALIACAO_TIPO_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av-data">Data e hora</Label>
              <Input
                id="av-data"
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="av-local">Local</Label>
              <Input
                id="av-local"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Escritório, obra, vídeo"
              />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">Notas por critério (0 a 10)</Label>
              <span className="text-sm font-bold text-[#213368]">
                Média {media === null ? "—" : media.toFixed(1).replace(".", ",")}
              </span>
            </div>
            <div className="space-y-2">
              {criterios.map((c, i) => (
                <div key={c.criterio} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-sm text-muted-foreground">{c.criterio}</span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={c.nota}
                    onChange={(e) => setNota(i, e.target.value)}
                    className="h-1.5 flex-1 accent-[#F37032]"
                    aria-label={`Nota de ${c.criterio}`}
                  />
                  <span className="w-8 shrink-0 text-right text-sm font-semibold">{c.nota}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="av-parecer">
              Parecer{precisaParecer ? "" : " (opcional enquanto não realizada)"}
            </Label>
            <Textarea
              id="av-parecer"
              rows={4}
              value={parecer}
              onChange={(e) => setParecer(e.target.value)}
              placeholder="O que você viu na entrevista: experiência, postura de segurança, disponibilidade, o que ficou em dúvida."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recomendação</Label>
            <Select value={recomendacao} onValueChange={setRecomendacao}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(RECOMENDACAO_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {erro && (
            <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!podeSalvar}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Salvar parecer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
