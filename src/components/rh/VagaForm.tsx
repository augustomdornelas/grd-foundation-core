// ============================================================
// Requisição de vaga — criar e editar
// ------------------------------------------------------------
// A vaga nasce sempre como rascunho: aprovar e publicar são passos à
// parte, com nota, e o banco recusa uma vaga que já nasça publicada.
//
// Escolher o cargo preenche setor, descrição e requisitos a partir do
// catálogo. É o cargo que carrega a exigência (NR, escolaridade), e
// redigitar isso à mão em cada vaga é como as exigências somem.
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
import { InputMoeda } from "@/components/ui/input-moeda";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle } from "lucide-react";
import { MOTIVO_ABERTURA_LABEL, TIPO_CONTRATACAO_LABEL } from "@/lib/rh-regras";
import { useRhCatalogos } from "@/lib/rh-catalogos-store";
import { useRhStore, usePapelRh, type Vaga, type VagaInput } from "@/lib/rh-store";

const VAZIO: VagaInput = {
  titulo: "",
  cargoId: null,
  setor: "",
  projetoId: null,
  tipoContratacao: "clt",
  quantidadePosicoes: 1,
  jornada: "",
  localTrabalho: "",
  cidade: "",
  uf: "",
  salarioConfidencial: true,
  beneficios: "",
  descricao: "",
  requisitos: "",
  diferenciais: "",
  motivoAbertura: "aumento_quadro",
  dataPrevistaInicio: null,
  dataLimite: null,
  responsavelRhId: null,
  faixaMin: null,
  faixaMax: null,
};

function deVaga(v: Vaga): VagaInput {
  return {
    titulo: v.titulo,
    cargoId: v.cargoId,
    setor: v.setor,
    projetoId: v.projetoId,
    tipoContratacao: v.tipoContratacao,
    quantidadePosicoes: v.quantidadePosicoes,
    jornada: v.jornada,
    localTrabalho: v.localTrabalho,
    cidade: v.cidade,
    uf: v.uf,
    salarioConfidencial: v.salarioConfidencial,
    beneficios: v.beneficios,
    descricao: v.descricao,
    requisitos: v.requisitos,
    diferenciais: v.diferenciais,
    motivoAbertura: v.motivoAbertura,
    dataPrevistaInicio: v.dataPrevistaInicio,
    dataLimite: v.dataLimite,
    responsavelRhId: v.responsavelRhId,
    faixaMin: v.faixaMin,
    faixaMax: v.faixaMax,
  };
}

function Campo({
  label,
  children,
  dica,
}: {
  label: string;
  children: React.ReactNode;
  dica?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function VagaForm({
  aberto,
  vaga,
  onFechar,
  onSalvar,
}: {
  aberto: boolean;
  /** Ausente = nova vaga. */
  vaga?: Vaga;
  onFechar: () => void;
  onSalvar: (input: VagaInput) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const papel = usePapelRh();
  const cargos = useRhCatalogos((s) => s.cargos.filter((c) => c.ativo));
  const projetos = useRhStore((s) => s.projetos);
  const pessoas = useRhStore((s) => s.pessoas);

  const [form, setForm] = useState<VagaInput>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!aberto) return;
    setForm(vaga ? deVaga(vaga) : VAZIO);
    setErro("");
    setSalvando(false);
  }, [aberto, vaga]);

  function set<K extends keyof VagaInput>(k: K, v: VagaInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /** Preenche o que estiver em branco a partir do cargo escolhido. */
  function escolherCargo(id: string) {
    const cargo = cargos.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      cargoId: id || null,
      titulo: f.titulo || cargo?.nome || "",
      setor: f.setor || cargo?.setor || "",
      descricao: f.descricao || cargo?.descricao || "",
      requisitos:
        f.requisitos ||
        [
          cargo?.requisitos,
          cargo?.nrsExigidas.length ? `NRs exigidas: ${cargo.nrsExigidas.join(", ")}.` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      faixaMin: f.faixaMin ?? cargo?.faixaMin ?? null,
      faixaMax: f.faixaMax ?? cargo?.faixaMax ?? null,
    }));
  }

  const podeSalvar = form.titulo.trim().length >= 3 && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro("");
    const r = await onSalvar(form);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar a vaga.");
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{vaga ? `Editar ${vaga.codigo}` : "Nova requisição de vaga"}</DialogTitle>
          <DialogDescription>
            {vaga
              ? "As mudanças valem imediatamente. Aprovação e publicação são passos à parte."
              : "A vaga nasce como rascunho. Depois ela vai para aprovação da Diretoria e só então pode ir para o site."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Cargo">
              <select
                value={form.cargoId ?? ""}
                onChange={(e) => escolherCargo(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Sem cargo do catálogo</option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Título da vaga" dica="É o que aparece no site.">
              <Input
                value={form.titulo}
                onChange={(e) => set("titulo", e.target.value)}
                placeholder="Ex.: Eletricista industrial"
              />
            </Campo>

            <Campo label="Obra">
              <select
                value={form.projetoId ?? ""}
                onChange={(e) => set("projetoId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Sem obra específica</option>
                {projetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Setor">
              <Input value={form.setor} onChange={(e) => set("setor", e.target.value)} />
            </Campo>

            <Campo label="Tipo de contratação">
              <select
                value={form.tipoContratacao}
                onChange={(e) => set("tipoContratacao", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(TIPO_CONTRATACAO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Posições">
              <InputMoeda
                valor={form.quantidadePosicoes}
                onChange={(v) => set("quantidadePosicoes", Math.max(1, v ?? 1))}
                casas={0}
                prefixo={null}
              />
            </Campo>

            <Campo label="Motivo da abertura">
              <select
                value={form.motivoAbertura}
                onChange={(e) => set("motivoAbertura", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(MOTIVO_ABERTURA_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Responsável no RH">
              <select
                value={form.responsavelRhId ?? ""}
                onChange={(e) => set("responsavelRhId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">A definir</option>
                {pessoas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Jornada">
              <Input
                value={form.jornada}
                onChange={(e) => set("jornada", e.target.value)}
                placeholder="Ex.: 44h semanais, seg a sex"
              />
            </Campo>

            <Campo label="Local de trabalho">
              <Input
                value={form.localTrabalho}
                onChange={(e) => set("localTrabalho", e.target.value)}
                placeholder="Ex.: Planta da Bracell, Lençóis Paulista"
              />
            </Campo>

            <Campo label="Cidade">
              <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </Campo>

            <Campo label="UF">
              <Input
                value={form.uf}
                maxLength={2}
                onChange={(e) => set("uf", e.target.value.toUpperCase())}
              />
            </Campo>

            <Campo label="Início previsto">
              <Input
                type="date"
                value={form.dataPrevistaInicio ?? ""}
                onChange={(e) => set("dataPrevistaInicio", e.target.value || null)}
              />
            </Campo>

            <Campo label="Data limite" dica="Depois dela a vaga perde o sentido.">
              <Input
                type="date"
                value={form.dataLimite ?? ""}
                onChange={(e) => set("dataLimite", e.target.value || null)}
              />
            </Campo>
          </div>

          {/* Faixa salarial: o campo nem existe para quem não pode ver.
              E não é só a tela — a tabela rh_vaga_faixa tem RLS própria. */}
          {papel.veRemuneracao && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-3 text-sm font-semibold text-[#213368]">
                Faixa salarial{" "}
                <span className="font-normal text-muted-foreground">
                  — visível só para Diretoria e RH
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Campo label="Mínimo">
                  <InputMoeda valor={form.faixaMin} onChange={(v) => set("faixaMin", v)} />
                </Campo>
                <Campo label="Máximo">
                  <InputMoeda valor={form.faixaMax} onChange={(v) => set("faixaMax", v)} />
                </Campo>
                <div className="flex items-end gap-2 pb-2">
                  <Switch
                    id="vaga-confidencial"
                    checked={form.salarioConfidencial}
                    onCheckedChange={(v) => set("salarioConfidencial", v)}
                  />
                  <Label htmlFor="vaga-confidencial" className="text-sm">
                    Não mostrar no site
                  </Label>
                </div>
              </div>
            </div>
          )}

          <Campo label="Descrição">
            <Textarea
              rows={3}
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
            />
          </Campo>

          <Campo label="Requisitos" dica="Obrigatório para publicar no site.">
            <Textarea
              rows={3}
              value={form.requisitos}
              onChange={(e) => set("requisitos", e.target.value)}
            />
          </Campo>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Diferenciais">
              <Textarea
                rows={2}
                value={form.diferenciais}
                onChange={(e) => set("diferenciais", e.target.value)}
              />
            </Campo>
            <Campo label="Benefícios">
              <Textarea
                rows={2}
                value={form.beneficios}
                onChange={(e) => set("beneficios", e.target.value)}
                placeholder="VT, VR, cesta básica, seguro de vida"
              />
            </Campo>
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
            {salvando ? "Salvando..." : vaga ? "Salvar alterações" : "Criar rascunho"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
