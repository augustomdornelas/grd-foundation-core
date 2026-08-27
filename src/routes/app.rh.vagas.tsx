// ============================================================
// /app/rh/vagas — requisição, aprovação e publicação
// ------------------------------------------------------------
// O caminho de uma vaga: rascunho → aguardando aprovação → aprovada →
// publicada. Cada passo exige nota e vai para o histórico. Aprovar é
// só da Diretoria; publicar exige título, cargo, descrição, requisitos,
// local e tipo de contratação preenchidos — quem confere isso é o
// banco, então o botão daqui não é a trava, é a conveniência.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Search,
  Globe,
  CheckCircle2,
  Snowflake,
  Copy,
  Pencil,
  XCircle,
} from "lucide-react";
import { FileDown } from "lucide-react";
import { gerarRequisicaoVagaPDF } from "@/lib/rh-pdf";
import { RhTela } from "@/components/rh/RhTela";
import { VagaForm } from "@/components/rh/VagaForm";
import { NotaDialog } from "@/components/rh/NotaDialog";
import { CandidatoCard } from "@/components/rh/CandidatoCard";
import { CandidatoFicha } from "@/components/rh/CandidatoFicha";
import { PERFIS_RH } from "@/lib/current-user";
import { brl } from "@/lib/formato";
import {
  MOTIVO_ABERTURA_LABEL,
  TIPO_CONTRATACAO_LABEL,
  VAGA_STATUS_ESTILO,
  VAGA_STATUS_LABEL,
  dataBr,
  dataHoraBr,
  diasCorridosDesde,
} from "@/lib/rh-regras";
import {
  useRhStore,
  usePapelRh,
  rhActions,
  listarHistoricoVaga,
  candidatosEmProcesso,
  funilDaVaga,
  nomeDaPessoa,
  nomeDoProjeto,
  type FunilItem,
  type HistoricoVaga,
  type Vaga,
  type VagaStatus,
} from "@/lib/rh-store";
import { useRhCatalogos } from "@/lib/rh-catalogos-store";

export const Route = createFileRoute("/app/rh/vagas")({ component: RhVagas });

/** Ação de status pendente de nota. */
type AcaoStatus = {
  vaga: Vaga;
  tipo:
    | "aprovar"
    | "enviar_aprovacao"
    | "publicar"
    | "despublicar"
    | "congelar"
    | "encerrar"
    | "cancelar";
};

const ACAO_TEXTO: Record<
  AcaoStatus["tipo"],
  { titulo: string; descricao: string; botao: string; destrutivo?: boolean }
> = {
  enviar_aprovacao: {
    titulo: "Enviar para aprovação",
    descricao: "A vaga vai para a Diretoria. Escreva por que ela precisa ser aberta.",
    botao: "Enviar",
  },
  aprovar: {
    titulo: "Aprovar vaga",
    descricao: "Aprovada, a vaga pode ser publicada no site pelo RH.",
    botao: "Aprovar",
  },
  publicar: {
    titulo: "Publicar no site",
    descricao: "A vaga passa a aparecer em grupogrdbrasil.com/trabalhe-conosco.",
    botao: "Publicar",
  },
  despublicar: {
    titulo: "Tirar do site",
    descricao: "A vaga sai do site e volta para aprovada. As candidaturas continuam.",
    botao: "Despublicar",
  },
  congelar: {
    titulo: "Congelar vaga",
    descricao: "A vaga sai do site e para de receber candidatos, sem ser encerrada.",
    botao: "Congelar",
  },
  encerrar: {
    titulo: "Encerrar vaga",
    descricao: "Encerrada, a vaga sai do site e do funil ativo. Não se apaga: fica no histórico.",
    botao: "Encerrar",
    destrutivo: true,
  },
  cancelar: {
    titulo: "Cancelar vaga",
    descricao: "Use quando a vaga deixou de existir — obra cancelada, orçamento cortado.",
    botao: "Cancelar vaga",
    destrutivo: true,
  },
};

function RhVagas() {
  const papel = usePapelRh();
  const vagas = useRhStore((s) => s.vagas);
  const carregado = useRhStore((s) => s.carregado);
  const estado = useRhStore((s) => s);
  const cargos = useRhCatalogos((s) => s.cargos);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("ativas");
  const [filtroObra, setFiltroObra] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Vaga | undefined>(undefined);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [acao, setAcao] = useState<AcaoStatus | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vagas
      .filter((v) => v.ativo)
      .filter((v) => {
        if (filtroStatus === "ativas") return !["encerrada", "cancelada"].includes(v.status);
        if (filtroStatus === "todas") return true;
        return v.status === filtroStatus;
      })
      .filter((v) => (filtroObra ? v.projetoId === filtroObra : true))
      .filter(
        (v) => !q || `${v.codigo} ${v.titulo} ${v.cidade} ${v.setor}`.toLowerCase().includes(q),
      );
  }, [vagas, busca, filtroStatus, filtroObra]);

  const vagaDetalhe = vagas.find((v) => v.id === detalhe);

  async function executar(a: AcaoStatus, nota: string) {
    const mapa: Record<AcaoStatus["tipo"], () => Promise<{ ok: boolean; erro?: string }>> = {
      enviar_aprovacao: () => rhActions.moverVaga(a.vaga.id, "aguardando_aprovacao", nota),
      aprovar: () => rhActions.moverVaga(a.vaga.id, "aprovada", nota),
      publicar: () => rhActions.publicarVaga(a.vaga.id, nota),
      despublicar: () => rhActions.despublicarVaga(a.vaga.id, nota),
      congelar: () => rhActions.moverVaga(a.vaga.id, "congelada", nota),
      encerrar: () => rhActions.moverVaga(a.vaga.id, "encerrada", nota),
      cancelar: () => rhActions.moverVaga(a.vaga.id, "cancelada", nota),
    };
    const r = await mapa[a.tipo]();
    if (!r.ok) throw new Error(r.erro ?? "Não foi possível registrar.");
    toast.success(`${ACAO_TEXTO[a.tipo].titulo}: ${a.vaga.codigo}.`);
    setAcao(null);
  }

  return (
    <RhTela
      titulo="Vagas"
      resumo="Requisição, aprovação e publicação. A obra pede gente aqui, a Diretoria aprova e o RH publica no site."
      perfis={PERFIS_RH.vagas}
    >
      <div className="space-y-4">
        {/* ---------- Filtros ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, título, cidade..."
              className="pl-9"
            />
          </div>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="ativas">Vagas em aberto</option>
            <option value="todas">Todos os status</option>
            {Object.entries(VAGA_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={filtroObra}
            onChange={(e) => setFiltroObra(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todas as obras</option>
            {estado.projetos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <Button
            onClick={() => {
              setEditando(undefined);
              setFormAberto(true);
            }}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nova vaga
          </Button>
        </div>

        {/* ---------- Tabela ---------- */}
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
                {vagas.length === 0 ? "Nenhuma vaga cadastrada ainda" : "Nada com esses filtros"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {vagas.length === 0
                  ? "Quando a obra precisar de gente, abra a requisição aqui. Ela nasce como rascunho e vai para a Diretoria aprovar."
                  : "Tente limpar a busca ou trocar o filtro de status."}
              </p>
              {vagas.length === 0 && (
                <Button
                  className="mt-4 bg-[#F37032] text-white hover:bg-[#ff8850]"
                  onClick={() => {
                    setEditando(undefined);
                    setFormAberto(true);
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" /> Abrir a primeira vaga
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead className="text-center">Posições</TableHead>
                    <TableHead className="text-center">No funil</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Dias aberta</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((v) => {
                    const dias = diasCorridosDesde(v.dataAbertura) ?? 0;
                    const noFunil = candidatosEmProcesso(estado, v.id);
                    const cargo = cargos.find((c) => c.id === v.cargoId);
                    return (
                      <TableRow
                        key={v.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setDetalhe(v.id)}
                      >
                        <TableCell className="font-mono text-xs">{v.codigo}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[#213368]">{v.titulo}</div>
                          <div className="text-xs text-muted-foreground">
                            {cargo?.nome ?? "sem cargo"} ·{" "}
                            {TIPO_CONTRATACAO_LABEL[v.tipoContratacao] ?? v.tipoContratacao}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {nomeDoProjeto(estado, v.projetoId)}
                        </TableCell>
                        <TableCell className="text-center text-sm">
                          {v.quantidadePreenchida}/{v.quantidadePosicoes}
                        </TableCell>
                        <TableCell className="text-center text-sm">{noFunil || "—"}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${VAGA_STATUS_ESTILO[v.status]}`}
                          >
                            {VAGA_STATUS_LABEL[v.status]}
                            {v.publicadaSite && <Globe className="h-3 w-3" />}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{dias}</TableCell>
                        <TableCell className="text-sm">
                          {nomeDaPessoa(estado, v.responsavelRhId)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <AcoesVaga
                            vaga={v}
                            podeEditar={papel.editaRh}
                            podeAprovar={papel.direcao}
                            onEditar={() => {
                              setEditando(v);
                              setFormAberto(true);
                            }}
                            onAcao={(tipo) => setAcao({ vaga: v, tipo })}
                            onDuplicar={async () => {
                              const r = await rhActions.duplicarVaga(v.id);
                              if (r.ok) toast.success("Vaga duplicada como rascunho.");
                              else toast.error(r.erro ?? "Não foi possível duplicar.");
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <VagaForm
        aberto={formAberto}
        vaga={editando}
        onFechar={() => setFormAberto(false)}
        onSalvar={async (input) => {
          const r = editando
            ? await rhActions.atualizarVaga(editando.id, input)
            : await rhActions.criarVaga(input);
          if (r.ok) toast.success(editando ? "Vaga atualizada." : "Rascunho de vaga criado.");
          return r;
        }}
      />

      {acao && (
        <NotaDialog
          aberto
          titulo={`${ACAO_TEXTO[acao.tipo].titulo} — ${acao.vaga.codigo}`}
          descricao={ACAO_TEXTO[acao.tipo].descricao}
          rotuloConfirmar={ACAO_TEXTO[acao.tipo].botao}
          destrutivo={ACAO_TEXTO[acao.tipo].destrutivo}
          onCancelar={() => setAcao(null)}
          onConfirmar={(nota) => executar(acao, nota)}
        />
      )}

      <VagaDetalhe vaga={vagaDetalhe} onFechar={() => setDetalhe(null)} />
    </RhTela>
  );
}

function AcoesVaga({
  vaga,
  podeEditar,
  podeAprovar,
  onEditar,
  onAcao,
  onDuplicar,
}: {
  vaga: Vaga;
  podeEditar: boolean;
  podeAprovar: boolean;
  onEditar: () => void;
  onAcao: (tipo: AcaoStatus["tipo"]) => void;
  onDuplicar: () => void;
}) {
  const final = ["encerrada", "cancelada"].includes(vaga.status);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Ações da vaga ${vaga.codigo}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {podeEditar && !final && (
          <DropdownMenuItem onClick={onEditar}>
            <Pencil className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
        )}
        {vaga.status === "rascunho" && (
          <DropdownMenuItem onClick={() => onAcao("enviar_aprovacao")}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Enviar para aprovação
          </DropdownMenuItem>
        )}
        {vaga.status === "aguardando_aprovacao" && podeAprovar && (
          <DropdownMenuItem onClick={() => onAcao("aprovar")}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar
          </DropdownMenuItem>
        )}
        {vaga.status === "aguardando_aprovacao" && !podeAprovar && (
          <DropdownMenuItem disabled>Aguardando a Diretoria aprovar</DropdownMenuItem>
        )}
        {podeEditar && vaga.status === "aprovada" && (
          <DropdownMenuItem onClick={() => onAcao("publicar")}>
            <Globe className="mr-2 h-4 w-4" /> Publicar no site
          </DropdownMenuItem>
        )}
        {podeEditar && vaga.publicadaSite && (
          <DropdownMenuItem onClick={() => onAcao("despublicar")}>
            <Globe className="mr-2 h-4 w-4" /> Tirar do site
          </DropdownMenuItem>
        )}
        {podeEditar && !final && vaga.status !== "congelada" && (
          <DropdownMenuItem onClick={() => onAcao("congelar")}>
            <Snowflake className="mr-2 h-4 w-4" /> Congelar
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {podeEditar && (
          <DropdownMenuItem onClick={onDuplicar}>
            <Copy className="mr-2 h-4 w-4" /> Duplicar
          </DropdownMenuItem>
        )}
        {podeEditar && !final && (
          <>
            <DropdownMenuItem onClick={() => onAcao("encerrar")} className="text-red-600">
              <XCircle className="mr-2 h-4 w-4" /> Encerrar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAcao("cancelar")} className="text-red-600">
              <XCircle className="mr-2 h-4 w-4" /> Cancelar vaga
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// Detalhe da vaga — Dados, Funil e Histórico
// ============================================================
function VagaDetalhe({ vaga, onFechar }: { vaga?: Vaga; onFechar: () => void }) {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const cargos = useRhCatalogos((s) => s.cargos);
  const [historico, setHistorico] = useState<HistoricoVaga[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [fichaDe, setFichaDe] = useState<FunilItem | null>(null);

  const itens = vaga ? funilDaVaga(estado, vaga.id) : [];
  const cargo = cargos.find((c) => c.id === vaga?.cargoId);

  function abrirHistorico() {
    if (!vaga) return;
    setCarregando(true);
    void listarHistoricoVaga(vaga.id).then((h) => {
      setHistorico(h);
      setCarregando(false);
    });
  }

  return (
    <>
      <Sheet
        open={vaga !== undefined}
        onOpenChange={(a) => {
          if (!a) onFechar();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {vaga && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">
                  {vaga.codigo} · {vaga.titulo}
                </SheetTitle>
                <SheetDescription className="text-left">
                  {nomeDoProjeto(estado, vaga.projetoId)} ·{" "}
                  {TIPO_CONTRATACAO_LABEL[vaga.tipoContratacao] ?? vaga.tipoContratacao} ·{" "}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${VAGA_STATUS_ESTILO[vaga.status]}`}
                  >
                    {VAGA_STATUS_LABEL[vaga.status]}
                  </span>
                </SheetDescription>
              </SheetHeader>

              <Tabs
                defaultValue="dados"
                className="mt-5"
                onValueChange={(v) => {
                  if (v === "historico") abrirHistorico();
                }}
              >
                <TabsList className="w-full">
                  <TabsTrigger value="dados" className="flex-1">
                    Dados
                  </TabsTrigger>
                  <TabsTrigger value="funil" className="flex-1">
                    Funil ({itens.length})
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="flex-1">
                    Histórico
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="mt-4 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Info rotulo="Cargo" valor={cargo?.nome ?? "—"} />
                    <Info rotulo="Setor" valor={vaga.setor || "—"} />
                    <Info
                      rotulo="Posições"
                      valor={`${vaga.quantidadePreenchida} de ${vaga.quantidadePosicoes}`}
                    />
                    <Info
                      rotulo="Motivo"
                      valor={MOTIVO_ABERTURA_LABEL[vaga.motivoAbertura] ?? vaga.motivoAbertura}
                    />
                    <Info rotulo="Aberta em" valor={dataBr(vaga.dataAbertura)} />
                    <Info rotulo="Início previsto" valor={dataBr(vaga.dataPrevistaInicio)} />
                    <Info rotulo="Data limite" valor={dataBr(vaga.dataLimite)} />
                    <Info
                      rotulo="Local"
                      valor={
                        vaga.localTrabalho || `${vaga.cidade}${vaga.uf ? `/${vaga.uf}` : ""}` || "—"
                      }
                    />
                    <Info rotulo="Jornada" valor={vaga.jornada || "—"} />
                    <Info rotulo="Responsável" valor={nomeDaPessoa(estado, vaga.responsavelRhId)} />
                    {papel.veRemuneracao && (
                      <Info
                        rotulo="Faixa salarial"
                        valor={
                          vaga.faixaMin === null && vaga.faixaMax === null
                            ? "Não informada"
                            : `${brl(vaga.faixaMin)} a ${brl(vaga.faixaMax)}${vaga.salarioConfidencial ? " (não vai para o site)" : ""}`
                        }
                      />
                    )}
                  </div>
                  {cargo && cargo.nrsExigidas.length > 0 && (
                    <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                      <strong>Exigência do cargo:</strong> {cargo.nrsExigidas.join(", ")}. Sem essas
                      NRs válidas, o colaborador não é alocável em obra.
                    </div>
                  )}
                  <Bloco titulo="Descrição" texto={vaga.descricao} />
                  <Bloco titulo="Requisitos" texto={vaga.requisitos} />
                  <Bloco titulo="Diferenciais" texto={vaga.diferenciais} />
                  <Bloco titulo="Benefícios" texto={vaga.beneficios} />

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void gerarRequisicaoVagaPDF({
                        codigo: vaga.codigo,
                        titulo: vaga.titulo,
                        cargo: cargo?.nome ?? "—",
                        setor: vaga.setor,
                        obra: nomeDoProjeto(estado, vaga.projetoId),
                        tipoContratacao:
                          TIPO_CONTRATACAO_LABEL[vaga.tipoContratacao] ?? vaga.tipoContratacao,
                        posicoes: vaga.quantidadePosicoes,
                        jornada: vaga.jornada,
                        local: vaga.localTrabalho || vaga.cidade,
                        motivoAbertura:
                          MOTIVO_ABERTURA_LABEL[vaga.motivoAbertura] ?? vaga.motivoAbertura,
                        dataAbertura: vaga.dataAbertura,
                        dataPrevistaInicio: vaga.dataPrevistaInicio,
                        dataLimite: vaga.dataLimite,
                        solicitante: nomeDaPessoa(estado, vaga.solicitanteId),
                        descricao: vaga.descricao,
                        requisitos: vaga.requisitos,
                        nrsExigidas: cargo?.nrsExigidas ?? [],
                        faixaMin: vaga.faixaMin,
                        faixaMax: vaga.faixaMax,
                        mostrarFaixa: papel.veRemuneracao,
                      })
                    }
                  >
                    <FileDown className="mr-1.5 h-3.5 w-3.5" /> Requisição em PDF
                  </Button>
                </TabsContent>

                <TabsContent value="funil" className="mt-4 space-y-2">
                  {itens.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum candidato inscrito nesta vaga ainda.
                    </p>
                  ) : (
                    itens
                      .slice()
                      .sort((a, b) => a.etapaOrdem - b.etapaOrdem)
                      .map((i) => (
                        <div key={i.candidaturaId} className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {i.etapaNome}
                          </p>
                          <CandidatoCard item={i} onAbrir={() => setFichaDe(i)} />
                        </div>
                      ))
                  )}
                </TabsContent>

                <TabsContent value="historico" className="mt-4">
                  {carregando ? (
                    <div className="space-y-2">
                      <div className="h-14 animate-pulse rounded bg-muted" />
                      <div className="h-14 animate-pulse rounded bg-muted" />
                    </div>
                  ) : historico.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      Sem mudanças de status registradas.
                    </p>
                  ) : (
                    <ol className="space-y-3 border-l pl-4">
                      {historico.map((h) => (
                        <li key={h.id} className="relative">
                          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[#F37032]" />
                          <p className="text-xs text-muted-foreground">
                            {dataHoraBr(h.criadoEm)} · {h.autorNome || "—"}
                          </p>
                          <p className="text-sm font-medium text-[#213368]">
                            {VAGA_STATUS_LABEL[h.statusAnterior] ?? (h.statusAnterior || "—")} →{" "}
                            {VAGA_STATUS_LABEL[h.statusNovo] ?? h.statusNovo}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm">{h.nota}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <CandidatoFicha
        aberto={fichaDe !== null}
        candidatoId={fichaDe?.candidatoId ?? null}
        candidaturaId={fichaDe?.candidaturaId ?? null}
        onFechar={() => setFichaDe(null)}
      />
    </>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-sm">{valor}</p>
    </div>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {titulo}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{texto}</p>
    </div>
  );
}
