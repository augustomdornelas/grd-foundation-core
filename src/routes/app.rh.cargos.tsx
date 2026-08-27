// ============================================================
// /app/rh/cargos — o catálogo que amarra exigência a função
// ------------------------------------------------------------
// É aqui que se decide quem pode entrar em obra. As NRs marcadas no
// cargo viram item obrigatório do checklist de admissão e passam a
// bloquear a alocação quando vencem. Os EPIs padrão viram item de
// entrega para o almoxarifado.
//
// Nenhum cargo é excluído: inativar tira dos comboboxes e mantém as
// vagas e os colaboradores antigos com o cargo que tinham.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { InputMoeda } from "@/components/ui/input-moeda";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, AlertTriangle } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { PERFIS_RH } from "@/lib/current-user";
import { brl } from "@/lib/formato";
import { useEpiStore } from "@/lib/epis-store";
import {
  useRhCatalogos,
  catalogosActions,
  type Cargo,
  type CargoInput,
} from "@/lib/rh-catalogos-store";
import { usePapelRh } from "@/lib/rh-store";

export const Route = createFileRoute("/app/rh/cargos")({ component: RhCargos });

const VAZIO: CargoInput = {
  nome: "",
  cbo: "",
  setor: "",
  descricao: "",
  atividades: "",
  requisitos: "",
  escolaridadeMinima: "",
  nrsExigidas: [],
  exigeCnh: false,
  categoriaCnh: "",
  episPadrao: [],
  checklistModeloId: null,
  faixaMin: null,
  faixaMax: null,
};

function deCargo(c: Cargo): CargoInput {
  return {
    nome: c.nome,
    cbo: c.cbo,
    setor: c.setor,
    descricao: c.descricao,
    atividades: c.atividades,
    requisitos: c.requisitos,
    escolaridadeMinima: c.escolaridadeMinima,
    nrsExigidas: c.nrsExigidas,
    exigeCnh: c.exigeCnh,
    categoriaCnh: c.categoriaCnh,
    episPadrao: c.episPadrao,
    checklistModeloId: c.checklistModeloId,
    faixaMin: c.faixaMin,
    faixaMax: c.faixaMax,
  };
}

function RhCargos() {
  const papel = usePapelRh();
  const cargos = useRhCatalogos((s) => s.cargos);
  const carregado = useRhCatalogos((s) => s.carregado);
  const modelos = useRhCatalogos((s) => s.modelos);

  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [editando, setEditando] = useState<Cargo | undefined>(undefined);
  const [formAberto, setFormAberto] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cargos
      .filter((c) => (mostrarInativos ? true : c.ativo))
      .filter(
        (c) =>
          !q ||
          `${c.nome} ${c.setor} ${c.cbo} ${c.nrsExigidas.join(" ")}`.toLowerCase().includes(q),
      );
  }, [cargos, busca, mostrarInativos]);

  return (
    <RhTela
      titulo="Catálogo de cargos"
      resumo="Cargo, CBO, setor, NRs exigidas, EPIs padrão e faixa salarial. É o cargo que carrega a exigência — não o encarregado da obra."
      perfis={PERFIS_RH.cargos}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cargo, setor, CBO, NR..."
              className="pl-9"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={mostrarInativos} onCheckedChange={setMostrarInativos} />
            Mostrar inativos
          </label>
          {papel.editaRh && (
            <Button
              onClick={() => {
                setEditando(undefined);
                setFormAberto(true);
              }}
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo cargo
            </Button>
          )}
        </div>

        <Card className="overflow-hidden">
          {!carregado ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h3 className="text-base font-bold text-[#213368]">
                {cargos.length === 0 ? "O catálogo está vazio" : "Nada com esses filtros"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {cargos.length === 0
                  ? "Os cargos padrão são semeados pela migration do módulo. Se esta tela está vazia, a migration não foi aplicada neste banco."
                  : "Limpe a busca ou mostre os inativos."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>CBO</TableHead>
                    <TableHead>NRs exigidas</TableHead>
                    <TableHead>CNH</TableHead>
                    {papel.veRemuneracao && <TableHead>Faixa salarial</TableHead>}
                    <TableHead>Checklist</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                      <TableCell>
                        <div className="font-semibold text-[#213368]">{c.nome}</div>
                        {c.escolaridadeMinima && (
                          <div className="text-xs text-muted-foreground">
                            {c.escolaridadeMinima}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{c.setor || "—"}</TableCell>
                      <TableCell className="text-sm">{c.cbo || "—"}</TableCell>
                      <TableCell>
                        {c.nrsExigidas.length === 0 ? (
                          <span className="text-xs text-muted-foreground">nenhuma</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.nrsExigidas.map((nr) => (
                              <span
                                key={nr}
                                className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                              >
                                {nr}
                              </span>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {c.exigeCnh ? `Sim${c.categoriaCnh ? ` (${c.categoriaCnh})` : ""}` : "Não"}
                      </TableCell>
                      {papel.veRemuneracao && (
                        <TableCell className="text-sm">
                          {c.faixaMin === null && c.faixaMax === null
                            ? "—"
                            : `${brl(c.faixaMin)} a ${brl(c.faixaMax)}`}
                        </TableCell>
                      )}
                      <TableCell className="text-sm">
                        {modelos.find((m) => m.id === c.checklistModeloId)?.nome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {papel.editaRh && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              title="Editar"
                              onClick={() => {
                                setEditando(c);
                                setFormAberto(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8"
                              onClick={async () => {
                                const r = await catalogosActions.alternarCargo(c.id, !c.ativo);
                                if (r.ok)
                                  toast.success(c.ativo ? "Cargo inativado." : "Cargo reativado.");
                                else toast.error(r.erro ?? "Não foi possível mudar.");
                              }}
                            >
                              {c.ativo ? "Inativar" : "Reativar"}
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <CargoForm aberto={formAberto} cargo={editando} onFechar={() => setFormAberto(false)} />
    </RhTela>
  );
}

// ============================================================
// Formulário de cargo
// ============================================================
function CargoForm({
  aberto,
  cargo,
  onFechar,
}: {
  aberto: boolean;
  cargo?: Cargo;
  onFechar: () => void;
}) {
  const papel = usePapelRh();
  const tipos = useRhCatalogos((s) => s.tiposDocumento);
  const modelos = useRhCatalogos((s) => s.modelos.filter((m) => m.ativo));
  const epis = useEpiStore((s) => s.epis.filter((e) => e.ativo));

  const [form, setForm] = useState<CargoInput>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [iniciado, setIniciado] = useState<string | null>(null);

  // Recarrega o formulário quando muda o cargo em edição. Usar estado
  // em vez de useEffect evita um render intermediário com o cargo velho.
  const chave = `${aberto}|${cargo?.id ?? "novo"}`;
  if (aberto && iniciado !== chave) {
    setIniciado(chave);
    setForm(cargo ? deCargo(cargo) : VAZIO);
    setErro("");
    setSalvando(false);
  }

  const nrsDisponiveis = tipos.filter((t) => t.ativo && t.nome.startsWith("NR-"));

  function set<K extends keyof CargoInput>(k: K, v: CargoInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function alternarNr(nome: string) {
    setForm((f) => ({
      ...f,
      nrsExigidas: f.nrsExigidas.includes(nome)
        ? f.nrsExigidas.filter((n) => n !== nome)
        : [...f.nrsExigidas, nome],
    }));
  }

  function alternarEpi(id: string) {
    setForm((f) => ({
      ...f,
      episPadrao: f.episPadrao.includes(id)
        ? f.episPadrao.filter((e) => e !== id)
        : [...f.episPadrao, id],
    }));
  }

  async function salvar() {
    if (form.nome.trim().length < 2) return;
    setSalvando(true);
    setErro("");
    const r = await catalogosActions.salvarCargo(form, cargo?.id);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar o cargo.");
      setSalvando(false);
      return;
    }
    toast.success(cargo ? "Cargo atualizado." : "Cargo criado.");
    setSalvando(false);
    onFechar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a && !salvando) onFechar();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{cargo ? `Editar ${cargo.nome}` : "Novo cargo"}</DialogTitle>
          <DialogDescription>
            O que for marcado aqui vira exigência real: NR marcada bloqueia alocação quando vence,
            EPI marcado vira item do checklist de admissão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome do cargo</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Input value={form.setor} onChange={(e) => set("setor", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>CBO</Label>
              <Input
                value={form.cbo}
                onChange={(e) => set("cbo", e.target.value)}
                placeholder="Código da Classificação Brasileira de Ocupações"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Escolaridade mínima</Label>
              <Input
                value={form.escolaridadeMinima}
                onChange={(e) => set("escolaridadeMinima", e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <Label className="text-sm">NRs exigidas por este cargo</Label>
            <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
              Cada NR marcada entra no checklist de admissão e passa a bloquear a alocação em obra
              quando estiver ausente ou vencida.
            </p>
            {nrsDisponiveis.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhuma NR cadastrada em tipos de documento. Cadastre em Configurações.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {nrsDisponiveis.map((t) => {
                  const marcada = form.nrsExigidas.includes(t.nome);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => alternarNr(t.nome)}
                      title={t.descricao}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                        marcada
                          ? "bg-amber-100 text-amber-900 ring-1 ring-amber-400"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3">
            <Label className="text-sm">EPIs padrão do cargo</Label>
            <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
              Viram item de entrega para o almoxarifado no checklist, e a aptidão só fecha com o
              termo assinado.
            </p>
            {epis.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum EPI cadastrado no módulo de EPIs.
              </p>
            ) : (
              <div className="max-h-40 overflow-y-auto">
                <div className="flex flex-wrap gap-1.5">
                  {epis.map((e) => {
                    const marcado = form.episPadrao.includes(e.id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => alternarEpi(e.id)}
                        className={`rounded-full px-2.5 py-1 text-xs transition ${
                          marcado ? "bg-[#213368] text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {e.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <Switch checked={form.exigeCnh} onCheckedChange={(v) => set("exigeCnh", v)} />
              <Label>Exige CNH</Label>
              {form.exigeCnh && (
                <Input
                  className="w-20"
                  maxLength={3}
                  value={form.categoriaCnh}
                  onChange={(e) => set("categoriaCnh", e.target.value.toUpperCase())}
                  placeholder="Cat."
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Modelo de checklist de admissão</Label>
              <select
                value={form.checklistModeloId ?? ""}
                onChange={(e) => set("checklistModeloId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Nenhum</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {papel.veRemuneracao && (
            <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Faixa salarial mínima</Label>
                <InputMoeda valor={form.faixaMin} onChange={(v) => set("faixaMin", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Faixa salarial máxima</Label>
                <InputMoeda valor={form.faixaMax} onChange={(v) => set("faixaMax", v)} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Visível só para Diretoria e RH. A faixa mora em outra tabela, com política própria —
                não é a tela que esconde.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.descricao}
              onChange={(e) => set("descricao", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Atividades</Label>
            <Textarea
              rows={3}
              value={form.atividades}
              onChange={(e) => set("atividades", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Requisitos</Label>
            <Textarea
              rows={3}
              value={form.requisitos}
              onChange={(e) => set("requisitos", e.target.value)}
            />
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
            disabled={form.nome.trim().length < 2 || salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : cargo ? "Salvar alterações" : "Criar cargo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
