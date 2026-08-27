// ============================================================
// Cadastro de candidato
// ------------------------------------------------------------
// Regra 11: CPF é único. Ao digitar um CPF que já está na base, o
// formulário avisa e oferece abrir o cadastro existente — em vez de
// deixar o banco recusar com "duplicate key" depois de a pessoa ter
// preenchido a tela inteira.
//
// Regra 13: sem consentimento de LGPD marcado, o cadastro grava sem
// data de consentimento e sem prazo de retenção. É o RH que responde
// por isso, então o campo fica visível e explicado, não escondido.
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
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, UserSearch, Trash2, Plus } from "lucide-react";
import {
  DISPONIBILIDADE_LABEL,
  ORIGEM_LABEL,
  cpfValido,
  formatarCpf,
  formatarTelefone,
  lerNrsDeclaradas,
} from "@/lib/rh-regras";
import { useRhCatalogos, nrsConhecidas } from "@/lib/rh-catalogos-store";
import {
  useRhStore,
  usePapelRh,
  candidatoPorCpf,
  type Candidato,
  type CandidatoInput,
} from "@/lib/rh-store";

const VAZIO: CandidatoInput = {
  nome: "",
  cpf: "",
  rg: "",
  dataNascimento: null,
  email: "",
  telefone: "",
  whatsapp: "",
  cidade: "",
  uf: "",
  cargoPretendido: "",
  disponibilidade: "a_combinar",
  disponibilidadeViagem: false,
  possuiCnh: false,
  categoriaCnh: "",
  nrsDeclaradas: [],
  escolaridade: "",
  experienciaResumo: "",
  linkedin: "",
  origem: "cadastro_interno",
  origemDetalhe: "",
  indicadoPor: "",
  observacoes: "",
  lgpdConsentimento: false,
  pretensao: null,
};

function deCandidato(c: Candidato): CandidatoInput {
  return {
    nome: c.nome,
    cpf: c.cpf,
    rg: c.rg,
    dataNascimento: c.dataNascimento,
    email: c.email,
    telefone: c.telefone,
    whatsapp: c.whatsapp,
    cidade: c.cidade,
    uf: c.uf,
    cargoPretendido: c.cargoPretendido,
    disponibilidade: c.disponibilidade,
    disponibilidadeViagem: c.disponibilidadeViagem,
    possuiCnh: c.possuiCnh,
    categoriaCnh: c.categoriaCnh,
    nrsDeclaradas: lerNrsDeclaradas(c.nrsDeclaradas).map((n) => ({
      nr: n.nr,
      validade: n.validade,
    })),
    escolaridade: c.escolaridade,
    experienciaResumo: c.experienciaResumo,
    linkedin: c.linkedin,
    origem: c.origem,
    origemDetalhe: c.origemDetalhe,
    indicadoPor: c.indicadoPor,
    observacoes: c.observacoes,
    lgpdConsentimento: c.lgpdConsentimento,
    pretensao: c.pretensao,
  };
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function CandidatoForm({
  aberto,
  candidato,
  onFechar,
  onSalvar,
  onAbrirExistente,
}: {
  aberto: boolean;
  candidato?: Candidato;
  onFechar: () => void;
  onSalvar: (input: CandidatoInput) => Promise<{ ok: boolean; erro?: string }>;
  onAbrirExistente?: (id: string) => void;
}) {
  const papel = usePapelRh();
  const nrsDisponiveis = useRhCatalogos(nrsConhecidas);
  const [form, setForm] = useState<CandidatoInput>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const duplicado = useRhStore((s) => candidatoPorCpf(s, form.cpf));
  const cpfConflita = duplicado !== undefined && duplicado.id !== candidato?.id;
  const cpfInvalido = form.cpf.replace(/\D/g, "").length > 0 && !cpfValido(form.cpf);

  useEffect(() => {
    if (!aberto) return;
    setForm(candidato ? deCandidato(candidato) : VAZIO);
    setErro("");
    setSalvando(false);
  }, [aberto, candidato]);

  function set<K extends keyof CandidatoInput>(k: K, v: CandidatoInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function addNr() {
    setForm((f) => ({
      ...f,
      nrsDeclaradas: [...f.nrsDeclaradas, { nr: nrsDisponiveis[0] ?? "NR-", validade: null }],
    }));
  }

  const podeSalvar = form.nome.trim().length >= 3 && !cpfInvalido && !cpfConflita && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro("");
    const r = await onSalvar(form);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar o candidato.");
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
          <DialogTitle>{candidato ? `Editar ${candidato.nome}` : "Novo candidato"}</DialogTitle>
          <DialogDescription>
            A base é única: o mesmo candidato pode ser inscrito em várias vagas sem ser cadastrado
            de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome completo">
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </Campo>
            <Campo label="CPF">
              <Input
                value={form.cpf}
                onChange={(e) => set("cpf", formatarCpf(e.target.value))}
                placeholder="000.000.000-00"
                className={cpfInvalido || cpfConflita ? "border-red-500" : ""}
              />
            </Campo>
          </div>

          {cpfInvalido && (
            <p className="text-sm text-red-600">CPF inválido — confira os dígitos.</p>
          )}

          {cpfConflita && duplicado && (
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <UserSearch className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                Este CPF já é de <strong>{duplicado.nome}</strong>. Não crie outro cadastro — abra o
                que existe e inscreva a pessoa na vaga nova.
              </span>
              {onAbrirExistente && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onFechar();
                    onAbrirExistente(duplicado.id);
                  }}
                >
                  Abrir cadastro
                </Button>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="RG">
              <Input value={form.rg} onChange={(e) => set("rg", e.target.value)} />
            </Campo>
            <Campo label="Nascimento">
              <Input
                type="date"
                value={form.dataNascimento ?? ""}
                onChange={(e) => set("dataNascimento", e.target.value || null)}
              />
            </Campo>
            <Campo label="Escolaridade">
              <Input
                value={form.escolaridade}
                onChange={(e) => set("escolaridade", e.target.value)}
                placeholder="Fundamental, médio, técnico..."
              />
            </Campo>
            <Campo label="Telefone">
              <Input
                value={form.telefone}
                onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
              />
            </Campo>
            <Campo label="WhatsApp">
              <Input
                value={form.whatsapp}
                onChange={(e) => set("whatsapp", formatarTelefone(e.target.value))}
              />
            </Campo>
            <Campo label="E-mail">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Campo>
            <Campo label="Cidade">
              <Input value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
            </Campo>
            <Campo label="UF">
              <Input
                maxLength={2}
                value={form.uf}
                onChange={(e) => set("uf", e.target.value.toUpperCase())}
              />
            </Campo>
            <Campo label="Cargo pretendido">
              <Input
                value={form.cargoPretendido}
                onChange={(e) => set("cargoPretendido", e.target.value)}
              />
            </Campo>
            <Campo label="Disponibilidade">
              <select
                value={form.disponibilidade}
                onChange={(e) => set("disponibilidade", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(DISPONIBILIDADE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Origem">
              <select
                value={form.origem}
                onChange={(e) => set("origem", e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Indicado por">
              <Input
                value={form.indicadoPor}
                onChange={(e) => set("indicadoPor", e.target.value)}
              />
            </Campo>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={form.possuiCnh} onCheckedChange={(v) => set("possuiCnh", v)} />
              Possui CNH
            </label>
            {form.possuiCnh && (
              <Input
                className="w-24"
                maxLength={3}
                value={form.categoriaCnh}
                onChange={(e) => set("categoriaCnh", e.target.value.toUpperCase())}
                placeholder="Cat."
              />
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.disponibilidadeViagem}
                onCheckedChange={(v) => set("disponibilidadeViagem", v)}
              />
              Disponível para viagem
            </label>
          </div>

          {/* NRs declaradas: é declaração do candidato, não documento.
              Vira documento quando o RH confere na admissão. */}
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-sm">NRs que o candidato declara ter</Label>
              <Button size="sm" variant="outline" onClick={addNr}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            {form.nrsDeclaradas.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">Nenhuma declarada.</p>
            ) : (
              <div className="space-y-2">
                {form.nrsDeclaradas.map((nr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      list="rh-nrs"
                      className="w-40"
                      value={nr.nr}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          nrsDeclaradas: f.nrsDeclaradas.map((x, idx) =>
                            idx === i ? { ...x, nr: e.target.value.toUpperCase() } : x,
                          ),
                        }))
                      }
                    />
                    <Input
                      type="date"
                      className="w-44"
                      value={nr.validade ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          nrsDeclaradas: f.nrsDeclaradas.map((x, idx) =>
                            idx === i ? { ...x, validade: e.target.value || null } : x,
                          ),
                        }))
                      }
                    />
                    <span className="text-xs text-muted-foreground">validade</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          nrsDeclaradas: f.nrsDeclaradas.filter((_, idx) => idx !== i),
                        }))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
                <datalist id="rh-nrs">
                  {nrsDisponiveis.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          {papel.veRemuneracao && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <Campo label="Pretensão salarial — visível só para Diretoria e RH">
                <InputMoeda valor={form.pretensao} onChange={(v) => set("pretensao", v)} />
              </Campo>
            </div>
          )}

          <Campo label="Resumo da experiência">
            <Textarea
              rows={3}
              value={form.experienciaResumo}
              onChange={(e) => set("experienciaResumo", e.target.value)}
            />
          </Campo>

          <Campo label="Observações">
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => set("observacoes", e.target.value)}
            />
          </Campo>

          <label className="flex items-start gap-2 rounded-md bg-muted/40 p-3 text-sm">
            <Checkbox
              checked={form.lgpdConsentimento}
              onCheckedChange={(v) => set("lgpdConsentimento", v === true)}
              className="mt-0.5"
            />
            <span>
              O candidato autorizou a GRD a guardar os dados dele para processos seletivos.
              <span className="block text-xs text-muted-foreground">
                Marcando aqui, o sistema grava a data e conta 24 meses de retenção. Sem marcar, o
                cadastro fica sem consentimento registrado — e é o RH que responde por isso.
              </span>
            </span>
          </label>

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
            {salvando ? "Salvando..." : candidato ? "Salvar alterações" : "Cadastrar candidato"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
