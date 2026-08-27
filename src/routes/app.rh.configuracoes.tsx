// ============================================================
// /app/rh/configuracoes — as regras do módulo, sem mexer em código
// ------------------------------------------------------------
// Quatro catálogos: etapas do funil, motivos de reprovação, tipos de
// documento e modelos de checklist de admissão.
//
// Nada aqui se apaga. Inativar uma etapa tira do Kanban e mantém o
// histórico de quem passou por ela; inativar um tipo de documento tira
// dos formulários e mantém os documentos já cadastrados.
//
// Duas coisas mudam comportamento de verdade e estão explicadas na
// tela: "quem move" (permite gestor) e "bloqueia alocação".
// ============================================================
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { Plus, Pencil, AlertTriangle } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { PERFIS_RH } from "@/lib/current-user";
import { TIPO_CONTRATACAO_LABEL } from "@/lib/rh-regras";
import { usePapelRh } from "@/lib/rh-store";
import {
  useRhCatalogos,
  catalogosActions,
  itensDoModelo,
  type ChecklistModelo,
  type ChecklistModeloItem,
  type EtapaTipo,
  type FunilEtapa,
  type MotivoReprovacao,
  type TipoDocumento,
} from "@/lib/rh-catalogos-store";
import { CATEGORIA_LABEL, RESPONSAVEL_LABEL, type ItemCategoria } from "@/lib/rh-admissao-store";

export const Route = createFileRoute("/app/rh/configuracoes")({ component: RhConfiguracoes });

const TIPO_ETAPA_LABEL: Record<EtapaTipo, string> = {
  inicial: "Inicial",
  intermediaria: "Intermediária",
  final_positiva: "Final positiva",
  final_negativa: "Final negativa",
  final_neutra: "Final neutra",
};

const CATEGORIA_DOC_LABEL: Record<string, string> = {
  pessoal: "Pessoal",
  saude: "Saúde",
  treinamento: "Treinamento",
  trabalhista: "Trabalhista",
  outro: "Outro",
};

function RhConfiguracoes() {
  const papel = usePapelRh();
  const carregado = useRhCatalogos((s) => s.carregado);

  if (!carregado) {
    return (
      <RhTela
        titulo="Configurações do RH"
        resumo="Carregando os catálogos..."
        perfis={PERFIS_RH.configuracoes}
      >
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </RhTela>
    );
  }

  return (
    <RhTela
      titulo="Configurações do RH"
      resumo="Etapas do funil, motivos de reprovação, tipos de documento e modelos de checklist. Nada se apaga: o que sai de uso é inativado."
      perfis={PERFIS_RH.configuracoes}
    >
      <Tabs defaultValue="etapas">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="etapas" className="flex-1">
            Etapas do funil
          </TabsTrigger>
          <TabsTrigger value="motivos" className="flex-1">
            Motivos de reprovação
          </TabsTrigger>
          <TabsTrigger value="documentos" className="flex-1">
            Tipos de documento
          </TabsTrigger>
          <TabsTrigger value="checklists" className="flex-1">
            Checklists de admissão
          </TabsTrigger>
        </TabsList>

        <TabsContent value="etapas" className="mt-4">
          <AbaEtapas podeEditar={papel.editaRh} />
        </TabsContent>
        <TabsContent value="motivos" className="mt-4">
          <AbaMotivos podeEditar={papel.editaRh} />
        </TabsContent>
        <TabsContent value="documentos" className="mt-4">
          <AbaTiposDocumento podeEditar={papel.editaRh} />
        </TabsContent>
        <TabsContent value="checklists" className="mt-4">
          <AbaChecklists podeEditar={papel.editaRh} />
        </TabsContent>
      </Tabs>
    </RhTela>
  );
}

// ============================================================
// Etapas do funil
// ============================================================
function AbaEtapas({ podeEditar }: { podeEditar: boolean }) {
  const etapas = useRhCatalogos((s) => [...s.etapas].sort((a, b) => a.ordem - b.ordem));
  const [editando, setEditando] = useState<FunilEtapa | undefined>(undefined);
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          O SLA em dias é o que acende o semáforo do funil: até o prazo, neutro; até o dobro,
          amarelo; acima do dobro, vermelho. "Gestor pode mover" libera a etapa para o engenheiro da
          obra.
        </p>
        {podeEditar && (
          <Button
            onClick={() => {
              setEditando(undefined);
              setAberto(true);
            }}
            className="shrink-0 bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nova etapa
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ordem</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-center">SLA (dias)</TableHead>
                <TableHead className="text-center">Opcional</TableHead>
                <TableHead className="text-center">Gestor pode mover</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {etapas.map((e) => (
                <TableRow key={e.id} className={e.ativo ? "" : "opacity-60"}>
                  <TableCell className="text-sm">{e.ordem}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: e.cor }}
                      />
                      <span className="font-semibold text-[#213368]">{e.nome}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{TIPO_ETAPA_LABEL[e.tipo]}</TableCell>
                  <TableCell className="text-center text-sm">{e.slaDias || "—"}</TableCell>
                  <TableCell className="text-center text-sm">
                    {e.opcional ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {e.permiteGestor ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="text-sm">{e.ativo ? "Ativa" : "Inativa"}</TableCell>
                  <TableCell className="text-right">
                    {podeEditar && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditando(e);
                          setAberto(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <EtapaDialog
        aberto={aberto}
        etapa={editando}
        proximaOrdem={(etapas.at(-1)?.ordem ?? 0) + 1}
        onFechar={() => setAberto(false)}
      />
    </div>
  );
}

function EtapaDialog({
  aberto,
  etapa,
  proximaOrdem,
  onFechar,
}: {
  aberto: boolean;
  etapa?: FunilEtapa;
  proximaOrdem: number;
  onFechar: () => void;
}) {
  const [form, setForm] = useState<Omit<FunilEtapa, "id">>({
    nome: "",
    ordem: proximaOrdem,
    tipo: "intermediaria",
    slaDias: 3,
    cor: "#1F3367",
    opcional: false,
    permiteGestor: false,
    statusResultante: null,
    ativo: true,
  });
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const chaveAtual = `${aberto}|${etapa?.id ?? "nova"}`;
  if (aberto && chave !== chaveAtual) {
    setChave(chaveAtual);
    setErro("");
    setSalvando(false);
    setForm(
      etapa
        ? { ...etapa }
        : {
            nome: "",
            ordem: proximaOrdem,
            tipo: "intermediaria",
            slaDias: 3,
            cor: "#1F3367",
            opcional: false,
            permiteGestor: false,
            statusResultante: null,
            ativo: true,
          },
    );
  }

  function set<K extends keyof Omit<FunilEtapa, "id">>(k: K, v: Omit<FunilEtapa, "id">[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    if (form.nome.trim().length < 2) return;
    setSalvando(true);
    setErro("");
    const r = await catalogosActions.salvarEtapa(form, etapa?.id);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.");
      setSalvando(false);
      return;
    }
    toast.success(etapa ? "Etapa atualizada." : "Etapa criada.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{etapa ? `Editar ${etapa.nome}` : "Nova etapa do funil"}</DialogTitle>
          <DialogDescription>
            Etapas finais encerram a candidatura. O "status resultante" é o que a candidatura passa
            a ter ao entrar aqui — é ele, e não o nome da etapa, que o sistema lê.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={1}
                value={form.ordem}
                onChange={(e) => set("ordem", Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <select
                value={form.tipo}
                onChange={(e) => set("tipo", e.target.value as EtapaTipo)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(TIPO_ETAPA_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>SLA em dias</Label>
              <Input
                type="number"
                min={0}
                value={form.slaDias}
                onChange={(e) => set("slaDias", Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <Input
                type="color"
                value={form.cor}
                onChange={(e) => set("cor", e.target.value)}
                className="h-9 p-1"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status resultante</Label>
              <select
                value={form.statusResultante ?? ""}
                onChange={(e) => set("statusResultante", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Em andamento (padrão)</option>
                <option value="aprovado">Aprovado</option>
                <option value="reprovado">Reprovado</option>
                <option value="desistiu">Desistiu</option>
                <option value="contratado">Contratado</option>
                <option value="banco_talentos">Banco de talentos</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.permiteGestor}
                onCheckedChange={(v) => set("permiteGestor", v)}
              />
              <span>
                Gestor da obra pode mover para cá
                <span className="block text-xs text-muted-foreground">
                  Libera o engenheiro a mover candidatos das obras dele para esta etapa.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.opcional} onCheckedChange={(v) => set("opcional", v)} />
              <span>Etapa opcional</span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
              <span>
                Ativa
                <span className="block text-xs text-muted-foreground">
                  Inativar tira a coluna do Kanban sem apagar o histórico de quem passou por ela.
                </span>
              </span>
            </label>
          </div>

          {form.tipo === "final_negativa" && (
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
              Etapa final negativa exige motivo do catálogo mais texto livre na movimentação — o
              banco recusa sem os dois.
            </p>
          )}

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
            disabled={salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Motivos de reprovação
// ============================================================
function AbaMotivos({ podeEditar }: { podeEditar: boolean }) {
  const motivos = useRhCatalogos((s) => [...s.motivos].sort((a, b) => a.ordem - b.ordem));
  const [editando, setEditando] = useState<MotivoReprovacao | undefined>(undefined);
  const [nome, setNome] = useState("");
  const [aberto, setAberto] = useState(false);

  async function salvar() {
    const r = await catalogosActions.salvarMotivo(
      nome,
      editando?.ordem ?? (motivos.at(-1)?.ordem ?? 0) + 1,
      true,
      editando?.id,
    );
    if (!r.ok) {
      toast.error(r.erro ?? "Não foi possível salvar.");
      return;
    }
    toast.success(editando ? "Motivo atualizado." : "Motivo criado.");
    setAberto(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Escolher um destes é obrigatório para encerrar uma candidatura, junto com o texto do que
          aconteceu. É o que permite saber depois por que os candidatos estão saindo.
        </p>
        {podeEditar && (
          <Button
            onClick={() => {
              setEditando(undefined);
              setNome("");
              setAberto(true);
            }}
            className="shrink-0 bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Novo motivo
          </Button>
        )}
      </div>

      <Card className="divide-y">
        {motivos.map((m) => (
          <div
            key={m.id}
            className={`flex items-center justify-between px-4 py-2.5 ${m.ativo ? "" : "opacity-60"}`}
          >
            <div>
              <p className="text-sm font-medium text-[#213368]">{m.nome}</p>
              {!m.ativo && <p className="text-xs text-muted-foreground">inativo</p>}
            </div>
            {podeEditar && (
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setEditando(m);
                    setNome(m.nome);
                    setAberto(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={async () => {
                    const r = await catalogosActions.salvarMotivo(m.nome, m.ordem, !m.ativo, m.id);
                    if (r.ok) toast.success(m.ativo ? "Motivo inativado." : "Motivo reativado.");
                    else toast.error(r.erro ?? "Não foi possível mudar.");
                  }}
                >
                  {m.ativo ? "Inativar" : "Reativar"}
                </Button>
              </div>
            )}
          </div>
        ))}
        {motivos.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            Nenhum motivo cadastrado.
          </p>
        )}
      </Card>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar motivo" : "Novo motivo de reprovação"}</DialogTitle>
            <DialogDescription>
              Aparece na lista obrigatória ao encerrar uma candidatura.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: sem certificação exigida"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={salvar}
              disabled={nome.trim().length < 3}
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Tipos de documento
// ============================================================
function AbaTiposDocumento({ podeEditar }: { podeEditar: boolean }) {
  const tipos = useRhCatalogos((s) => [...s.tiposDocumento].sort((a, b) => a.ordem - b.ordem));
  const [editando, setEditando] = useState<TipoDocumento | undefined>(undefined);
  const [aberto, setAberto] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted-foreground">
          "Bloqueia alocação" é o campo que decide se o documento vencido derruba a aptidão para
          entrar em obra. ASO e as NRs de campo vêm marcados. "Obrigatório na admissão" entra no
          checklist padrão.
        </p>
        {podeEditar && (
          <Button
            onClick={() => {
              setEditando(undefined);
              setAberto(true);
            }}
            className="shrink-0 bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Novo tipo
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-center">Vence</TableHead>
                <TableHead className="text-center">Validade padrão</TableHead>
                <TableHead className="text-center">Obrigatório na admissão</TableHead>
                <TableHead className="text-center">Bloqueia alocação</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map((t) => (
                <TableRow key={t.id} className={t.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="font-medium text-[#213368]">{t.nome}</div>
                    {t.descricao && (
                      <div className="text-xs text-muted-foreground">{t.descricao}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {CATEGORIA_DOC_LABEL[t.categoria] ?? t.categoria}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {t.temVencimento ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {t.validadePadraoMeses > 0 ? `${t.validadePadraoMeses} meses` : "—"}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {t.obrigatorioAdmissao ? "Sim" : "Não"}
                  </TableCell>
                  <TableCell className="text-center">
                    {t.bloqueiaAlocacao ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        bloqueia
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">não</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {podeEditar && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditando(t);
                          setAberto(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <TipoDocumentoDialog
        aberto={aberto}
        tipo={editando}
        proximaOrdem={(tipos.at(-1)?.ordem ?? 0) + 10}
        onFechar={() => setAberto(false)}
      />
    </div>
  );
}

function TipoDocumentoDialog({
  aberto,
  tipo,
  proximaOrdem,
  onFechar,
}: {
  aberto: boolean;
  tipo?: TipoDocumento;
  proximaOrdem: number;
  onFechar: () => void;
}) {
  const vazio: Omit<TipoDocumento, "id"> = {
    nome: "",
    descricao: "",
    categoria: "outro",
    temVencimento: false,
    validadePadraoMeses: 0,
    obrigatorioAdmissao: false,
    bloqueiaAlocacao: false,
    ordem: proximaOrdem,
    ativo: true,
  };
  const [form, setForm] = useState<Omit<TipoDocumento, "id">>(vazio);
  const [chave, setChave] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const chaveAtual = `${aberto}|${tipo?.id ?? "novo"}`;
  if (aberto && chave !== chaveAtual) {
    setChave(chaveAtual);
    setErro("");
    setSalvando(false);
    setForm(tipo ? { ...tipo } : vazio);
  }

  function set<K extends keyof Omit<TipoDocumento, "id">>(k: K, v: Omit<TipoDocumento, "id">[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    if (form.nome.trim().length < 2) return;
    setSalvando(true);
    setErro("");
    const r = await catalogosActions.salvarTipoDocumento(form, tipo?.id);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.");
      setSalvando(false);
      return;
    }
    toast.success(tipo ? "Tipo atualizado." : "Tipo criado.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tipo ? `Editar ${tipo.nome}` : "Novo tipo de documento"}</DialogTitle>
          <DialogDescription>
            Para NRs, use o nome curto (NR-10, NR-35): é por ele que o catálogo de cargos referencia
            a exigência e que a aptidão é conferida.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <select
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value as TipoDocumento["categoria"])}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIA_DOC_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </div>

          <div className="space-y-2 rounded-lg border p-3">
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.temVencimento}
                onCheckedChange={(v) => set("temVencimento", v)}
              />
              <span>Tem vencimento</span>
            </label>
            {form.temVencimento && (
              <div className="space-y-1.5 pl-11">
                <Label className="text-xs">Validade padrão em meses</Label>
                <Input
                  type="number"
                  min={0}
                  className="w-32"
                  value={form.validadePadraoMeses}
                  onChange={(e) => set("validadePadraoMeses", Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  Sugere a data de vencimento quando o RH informa a emissão.
                </p>
              </div>
            )}
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.obrigatorioAdmissao}
                onCheckedChange={(v) => set("obrigatorioAdmissao", v)}
              />
              <span>Obrigatório na admissão</span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.bloqueiaAlocacao}
                onCheckedChange={(v) => set("bloqueiaAlocacao", v)}
              />
              <span>
                Bloqueia alocação em obra
                <span className="block text-xs text-muted-foreground">
                  Ausente ou vencido, derruba a aptidão do colaborador. Vale para o ASO e para as
                  NRs que o cargo exigir.
                </span>
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} />
              <span>Ativo</span>
            </label>
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
            disabled={salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Modelos de checklist
// ============================================================
function AbaChecklists({ podeEditar }: { podeEditar: boolean }) {
  const modelos = useRhCatalogos((s) => s.modelos);
  const tipos = useRhCatalogos((s) => s.tiposDocumento.filter((t) => t.ativo));
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const itens = useRhCatalogos((s) => (selecionado ? itensDoModelo(s, selecionado) : []));

  const [modeloAberto, setModeloAberto] = useState(false);
  const [editandoModelo, setEditandoModelo] = useState<ChecklistModelo | undefined>(undefined);
  const [itemAberto, setItemAberto] = useState(false);
  const [editandoItem, setEditandoItem] = useState<ChecklistModeloItem | undefined>(undefined);

  const modelo = modelos.find((m) => m.id === selecionado) ?? modelos[0];
  const modeloId = modelo?.id ?? null;
  if (modeloId && selecionado !== modeloId && !selecionado) setSelecionado(modeloId);

  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-sm text-muted-foreground">
        O modelo é o ponto de partida do checklist de admissão. Ao abrir uma admissão, o sistema
        copia estes itens e ainda soma as NRs exigidas pelo cargo e os EPIs padrão dele.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selecionado ?? ""}
          onChange={(e) => setSelecionado(e.target.value || null)}
          className="h-9 min-w-[240px] rounded-md border bg-background px-2 text-sm"
        >
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
              {m.ativo ? "" : " (inativo)"}
            </option>
          ))}
        </select>
        {podeEditar && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditandoModelo(undefined);
                setModeloAberto(true);
              }}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo modelo
            </Button>
            {modelo && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditandoModelo(modelo);
                  setModeloAberto(true);
                }}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar modelo
              </Button>
            )}
            {modelo && (
              <Button
                size="sm"
                className="bg-[#F37032] text-white hover:bg-[#ff8850]"
                onClick={() => {
                  setEditandoItem(undefined);
                  setItemAberto(true);
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo item
              </Button>
            )}
          </>
        )}
      </div>

      {!modelo ? (
        <Card className="px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum modelo cadastrado. O modelo padrão vem semeado pela migration do módulo.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ordem</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="text-center">Obrigatório</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">{i.ordem}</TableCell>
                    <TableCell>
                      <div className="font-medium text-[#213368]">{i.titulo}</div>
                      {i.instrucoes && (
                        <div className="text-xs text-muted-foreground">{i.instrucoes}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{CATEGORIA_LABEL[i.categoria]}</TableCell>
                    <TableCell className="text-sm">
                      {tipos.find((t) => t.id === i.tipoDocumentoId)?.nome ?? "—"}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {i.obrigatorio ? "Sim" : "Não"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {RESPONSAVEL_LABEL[i.responsavelPadrao]}
                    </TableCell>
                    <TableCell className="text-right">
                      {podeEditar && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditandoItem(i);
                              setItemAberto(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8"
                            onClick={async () => {
                              const r = await catalogosActions.inativarItemModelo(i.id);
                              if (r.ok) toast.success("Item removido do modelo.");
                              else toast.error(r.erro ?? "Não foi possível remover.");
                            }}
                          >
                            Remover
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {itens.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Este modelo ainda não tem itens.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <ModeloDialog
        aberto={modeloAberto}
        modelo={editandoModelo}
        onFechar={() => setModeloAberto(false)}
      />
      {modelo && (
        <ItemModeloDialog
          aberto={itemAberto}
          modeloId={modelo.id}
          item={editandoItem}
          proximaOrdem={(itens.at(-1)?.ordem ?? 0) + 10}
          tipos={tipos}
          onFechar={() => setItemAberto(false)}
        />
      )}
    </div>
  );
}

function ModeloDialog({
  aberto,
  modelo,
  onFechar,
}: {
  aberto: boolean;
  modelo?: ChecklistModelo;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipoContratacao, setTipoContratacao] = useState("clt");
  const [ativo, setAtivo] = useState(true);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState("");

  const chaveAtual = `${aberto}|${modelo?.id ?? "novo"}`;
  if (aberto && chave !== chaveAtual) {
    setChave(chaveAtual);
    setNome(modelo?.nome ?? "");
    setDescricao(modelo?.descricao ?? "");
    setTipoContratacao(modelo?.tipoContratacao ?? "clt");
    setAtivo(modelo?.ativo ?? true);
    setErro("");
  }

  async function salvar() {
    const r = await catalogosActions.salvarModelo(
      nome,
      descricao,
      tipoContratacao,
      ativo,
      modelo?.id,
    );
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.");
      return;
    }
    toast.success(modelo ? "Modelo atualizado." : "Modelo criado.");
    onFechar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a) onFechar();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modelo ? "Editar modelo" : "Novo modelo de checklist"}</DialogTitle>
          <DialogDescription>
            Cada tipo de contratação pode ter o seu: CLT, temporário, terceirizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de contratação</Label>
            <select
              value={tipoContratacao}
              onChange={(e) => setTipoContratacao(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              {Object.entries(TIPO_CONTRATACAO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={ativo} onCheckedChange={setAtivo} /> Ativo
          </label>
          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={nome.trim().length < 3}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemModeloDialog({
  aberto,
  modeloId,
  item,
  proximaOrdem,
  tipos,
  onFechar,
}: {
  aberto: boolean;
  modeloId: string;
  item?: ChecklistModeloItem;
  proximaOrdem: number;
  tipos: TipoDocumento[];
  onFechar: () => void;
}) {
  const vazio: Omit<ChecklistModeloItem, "id"> = {
    modeloId,
    titulo: "",
    categoria: "documento",
    tipoDocumentoId: null,
    obrigatorio: true,
    responsavelPadrao: "rh",
    ordem: proximaOrdem,
    instrucoes: "",
    ativo: true,
  };
  const [form, setForm] = useState<Omit<ChecklistModeloItem, "id">>(vazio);
  const [chave, setChave] = useState("");
  const [erro, setErro] = useState("");

  const chaveAtual = `${aberto}|${item?.id ?? "novo"}`;
  if (aberto && chave !== chaveAtual) {
    setChave(chaveAtual);
    setForm(item ? { ...item } : vazio);
    setErro("");
  }

  function set<K extends keyof Omit<ChecklistModeloItem, "id">>(
    k: K,
    v: Omit<ChecklistModeloItem, "id">[K],
  ) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    const r = await catalogosActions.salvarItemModelo({ ...form, modeloId }, item?.id);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.");
      return;
    }
    toast.success(item ? "Item atualizado." : "Item adicionado ao modelo.");
    onFechar();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(a) => {
        if (!a) onFechar();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item do checklist"}</DialogTitle>
          <DialogDescription>
            Item ligado a um tipo de documento vira documento do colaborador quando a admissão é
            concluída, com a data de validade junto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={form.titulo} onChange={(e) => set("titulo", e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <select
                value={form.categoria}
                onChange={(e) => set("categoria", e.target.value as ItemCategoria)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(CATEGORIA_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <select
                value={form.responsavelPadrao}
                onChange={(e) =>
                  set(
                    "responsavelPadrao",
                    e.target.value as ChecklistModeloItem["responsavelPadrao"],
                  )
                }
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(RESPONSAVEL_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <select
                value={form.tipoDocumentoId ?? ""}
                onChange={(e) => set("tipoDocumentoId", e.target.value || null)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Nenhum</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Ordem</Label>
              <Input
                type="number"
                min={0}
                value={form.ordem}
                onChange={(e) => set("ordem", Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Instruções</Label>
            <Textarea
              rows={2}
              value={form.instrucoes}
              onChange={(e) => set("instrucoes", e.target.value)}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={form.obrigatorio} onCheckedChange={(v) => set("obrigatorio", v)} />
            <span>
              Obrigatório
              <span className="block text-xs text-muted-foreground">
                Item obrigatório trava a conclusão da admissão até ser aprovado ou dispensado.
              </span>
            </span>
          </label>
          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={form.titulo.trim().length < 3}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
