// ============================================================
// /app/rh/admissoes — checklist, conferência e conversão
// ------------------------------------------------------------
// O botão "Concluir admissão e gerar colaborador" fica desabilitado
// enquanto falta item obrigatório, e o tooltip diz exatamente o quê.
// Mesmo habilitado, quem decide é o banco: rh_concluir_admissao()
// refaz a conferência inteira antes de criar o colaborador.
//
// A conversão é uma chamada só, de propósito. Fosse feita em vários
// passos daqui, uma queda de rede no meio deixaria colaborador criado
// sem admissão fechada — ou o contrário.
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
import { Progress } from "@/components/ui/progress";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, FileDown, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { AdmissaoChecklist } from "@/components/rh/AdmissaoChecklist";
import { NotaDialog } from "@/components/rh/NotaDialog";
import { PERFIS_RH, useCurrentUser } from "@/lib/current-user";
import { brl } from "@/lib/formato";
import { TIPO_CONTRATACAO_LABEL, dataBr, dataHoraBr } from "@/lib/rh-regras";
import { gerarCartaPropostaPDF, gerarFichaAdmissaoPDF } from "@/lib/rh-pdf";
import { useRhCatalogos } from "@/lib/rh-catalogos-store";
import { useRhStore, usePapelRh, candidatoPorId, nomeDoProjeto } from "@/lib/rh-store";
import {
  useAdmissoes,
  admissaoActions,
  progressoDaAdmissao,
  bloqueiosDaConclusao,
  listarHistoricoAdmissao,
  ADMISSAO_STATUS_ESTILO,
  ADMISSAO_STATUS_LABEL,
  PERIODO_EXPERIENCIA_LABEL,
  type Admissao,
  type AdmissaoInput,
  type AdmissaoStatus,
  type HistoricoAdmissao,
} from "@/lib/rh-admissao-store";

export const Route = createFileRoute("/app/rh/admissoes")({ component: RhAdmissoes });

function RhAdmissoes() {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const admissoes = useAdmissoes((s) => s.admissoes);
  const itens = useAdmissoes((s) => s.itens);
  const carregado = useAdmissoes((s) => s.carregado);
  const cargos = useRhCatalogos((s) => s.cargos);

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("abertas");
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [novaAberta, setNovaAberta] = useState(false);

  const podeConduzir = papel.leRh; // Diretoria, RH e Administrativo

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return admissoes
      .filter((a) => a.ativo)
      .filter((a) => {
        if (fStatus === "abertas") return !["concluida", "cancelada"].includes(a.status);
        if (fStatus === "todas") return true;
        return a.status === fStatus;
      })
      .filter((a) => {
        if (!q) return true;
        const cand = candidatoPorId(estado, a.candidatoId);
        return `${a.codigo} ${cand?.nome ?? ""} ${a.setor}`.toLowerCase().includes(q);
      });
  }, [admissoes, busca, fStatus, estado]);

  const admissaoDetalhe = admissoes.find((a) => a.id === detalhe);

  return (
    <RhTela
      titulo="Admissões"
      resumo="O checklist que transforma candidato em colaborador: documentos, exame, treinamentos, EPIs e contrato."
      perfis={PERFIS_RH.admissoes}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código ou nome do candidato..."
              className="pl-9"
            />
          </div>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="abertas">Em andamento</option>
            <option value="todas">Todas</option>
            {Object.entries(ADMISSAO_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {podeConduzir && (
            <Button
              onClick={() => setNovaAberta(true)}
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Nova admissão
            </Button>
          )}
        </div>

        <Card className="overflow-hidden">
          {!carregado ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : lista.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <h3 className="text-base font-bold text-[#213368]">
                {admissoes.length === 0 ? "Nenhuma admissão aberta" : "Nada com esses filtros"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {admissoes.length === 0
                  ? "Quando um candidato aceitar a proposta, abra a admissão aqui. O checklist é montado a partir do cargo — documentos, ASO, as NRs exigidas e os EPIs padrão."
                  : "Limpe a busca ou troque o filtro."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Cargo / obra</TableHead>
                    <TableHead>Prevista</TableHead>
                    <TableHead className="w-56">Checklist</TableHead>
                    <TableHead>Travando</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((a) => {
                    const meus = itens.filter((i) => i.admissaoId === a.id);
                    const p = progressoDaAdmissao(meus);
                    const cand = candidatoPorId(estado, a.candidatoId);
                    const cargo = cargos.find((c) => c.id === a.cargoId);
                    return (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setDetalhe(a.id)}
                      >
                        <TableCell className="font-mono text-xs">{a.codigo}</TableCell>
                        <TableCell className="font-semibold text-[#213368]">
                          {cand?.nome ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{cargo?.nome ?? a.setor ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            {nomeDoProjeto(estado, a.projetoId)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{dataBr(a.dataPrevistaAdmissao)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={p.pct} className="h-2 flex-1" />
                            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                              {p.concluidos}/{p.obrigatorios}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm text-muted-foreground">
                          {a.status === "concluida" ? "—" : (p.travando?.titulo ?? "nada")}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ADMISSAO_STATUS_ESTILO[a.status]}`}
                          >
                            {ADMISSAO_STATUS_LABEL[a.status]}
                          </span>
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

      <AdmissaoDetalhe
        admissao={admissaoDetalhe}
        podeConduzir={podeConduzir}
        onFechar={() => setDetalhe(null)}
      />

      <NovaAdmissaoDialog aberto={novaAberta} onFechar={() => setNovaAberta(false)} />
    </RhTela>
  );
}

// ============================================================
// Detalhe da admissão
// ============================================================
function AdmissaoDetalhe({
  admissao: admissaoProp,
  podeConduzir,
  onFechar,
}: {
  admissao?: Admissao;
  podeConduzir: boolean;
  onFechar: () => void;
}) {
  const user = useCurrentUser();
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const cargos = useRhCatalogos((s) => s.cargos);
  const itens = useAdmissoes((s) =>
    admissaoProp ? s.itens.filter((i) => i.admissaoId === admissaoProp.id) : [],
  );
  const [historico, setHistorico] = useState<HistoricoAdmissao[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [mudandoStatus, setMudandoStatus] = useState<AdmissaoStatus | null>(null);

  if (!admissaoProp) {
    return (
      <Sheet open={false} onOpenChange={() => onFechar()}>
        <SheetContent />
      </Sheet>
    );
  }
  // Cópia em const depois da guarda: parâmetro de função é binding
  // mutável, e o TypeScript descarta o estreitamento dentro das funções
  // declaradas abaixo. Com const, o tipo não volta a ser opcional.
  const admissao = admissaoProp;

  const candidato = candidatoPorId(estado, admissao.candidatoId);
  const cargo = cargos.find((c) => c.id === admissao.cargoId);
  const progresso = progressoDaAdmissao(itens);
  const bloqueios = bloqueiosDaConclusao(itens);
  const concluida = admissao.status === "concluida";
  const podeConcluir = podeConduzir && !concluida && bloqueios.length === 0;

  function carregarHistorico() {
    setCarregandoHist(true);
    void listarHistoricoAdmissao(admissao.id).then((h) => {
      setHistorico(h);
      setCarregandoHist(false);
    });
  }

  async function baixarCartaProposta() {
    if (!candidato) return;
    await gerarCartaPropostaPDF({
      candidatoNome: candidato.nome,
      cargo: cargo?.nome ?? admissao.setor,
      obra: nomeDoProjeto(estado, admissao.projetoId),
      tipoContratacao: TIPO_CONTRATACAO_LABEL[admissao.tipoContratacao] ?? admissao.tipoContratacao,
      jornada: admissao.jornada,
      salario: admissao.salario,
      beneficios: [
        admissao.valeTransporte ? "Vale-transporte" : "",
        admissao.valeRefeicao ? "Vale-refeição" : "",
      ]
        .filter(Boolean)
        .join(", "),
      dataPrevistaInicio: admissao.dataPrevistaAdmissao,
      validadeProposta: admissao.validadeProposta,
      periodoExperiencia: PERIODO_EXPERIENCIA_LABEL[admissao.periodoExperiencia] ?? "",
      responsavelNome: user.nome,
    });
  }

  async function baixarFicha() {
    if (!candidato) return;
    const end = candidato.endereco as Record<string, unknown>;
    const endereco = [end?.logradouro, end?.numero, end?.bairro, candidato.cidade, candidato.uf]
      .filter(Boolean)
      .join(", ");
    await gerarFichaAdmissaoPDF({
      codigo: admissao.codigo,
      candidatoNome: candidato.nome,
      cpf: candidato.cpf,
      rg: candidato.rg,
      dataNascimento: candidato.dataNascimento,
      nomeMae: "",
      estadoCivil: "",
      nacionalidade: "",
      naturalidade: "",
      escolaridade: candidato.escolaridade,
      endereco: endereco || `${candidato.cidade}${candidato.uf ? `/${candidato.uf}` : ""}`,
      telefone: candidato.telefone,
      email: candidato.email,
      cargo: cargo?.nome ?? "",
      setor: admissao.setor,
      obra: nomeDoProjeto(estado, admissao.projetoId),
      tipoContratacao: TIPO_CONTRATACAO_LABEL[admissao.tipoContratacao] ?? admissao.tipoContratacao,
      jornada: admissao.jornada,
      dataAdmissao: admissao.dataEfetivaAdmissao ?? admissao.dataPrevistaAdmissao,
      periodoExperiencia: PERIODO_EXPERIENCIA_LABEL[admissao.periodoExperiencia] ?? "",
      salario: admissao.salario,
      valeTransporte: admissao.valeTransporte,
      valeRefeicao: admissao.valeRefeicao,
      pisNis: "",
      ctps: "",
      tituloEleitor: "",
      reservista: "",
      banco: "",
      agencia: "",
      conta: "",
      pix: "",
      dependentes: [],
      mostrarSalario: papel.veRemuneracao,
    });
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(a) => {
          if (!a) onFechar();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="text-left">
              {admissao.codigo} · {candidato?.nome ?? "—"}
            </SheetTitle>
            <SheetDescription className="text-left">
              {cargo?.nome ?? "sem cargo"} · {nomeDoProjeto(estado, admissao.projetoId)} ·{" "}
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${ADMISSAO_STATUS_ESTILO[admissao.status]}`}
              >
                {ADMISSAO_STATUS_LABEL[admissao.status]}
              </span>
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={baixarCartaProposta}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" /> Carta-proposta
            </Button>
            <Button size="sm" variant="outline" onClick={baixarFicha}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" /> Ficha de admissão
            </Button>
            {podeConduzir && !concluida && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const r = await admissaoActions.regerarChecklist(admissao.id);
                  if (r.ok) toast.success("Checklist atualizado a partir do cargo.");
                  else toast.error(r.erro ?? "Não foi possível regerar.");
                }}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regerar checklist
              </Button>
            )}
          </div>

          <div className="mt-4 rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-[#213368]">Checklist obrigatório</span>
              <span className="text-muted-foreground">
                {progresso.concluidos} de {progresso.obrigatorios}
              </span>
            </div>
            <Progress value={progresso.pct} className="h-2" />

            {!concluida && (
              <div className="mt-3">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-block">
                        <Button
                          disabled={!podeConcluir}
                          onClick={() => setConcluindo(true)}
                          className="bg-[#F37032] text-white hover:bg-[#ff8850] disabled:opacity-50"
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          Concluir admissão e gerar colaborador
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {bloqueios.length > 0 && (
                      <TooltipContent side="bottom" className="max-w-sm">
                        <p className="mb-1 font-semibold">Falta para concluir:</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {bloqueios.slice(0, 8).map((b) => (
                            <li key={b}>{b}</li>
                          ))}
                          {bloqueios.length > 8 && <li>e mais {bloqueios.length - 8}.</li>}
                        </ul>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}

            {concluida && (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Admissão concluída. O colaborador foi criado a partir deste cadastro.
              </p>
            )}
          </div>

          <Tabs
            defaultValue="checklist"
            className="mt-4"
            onValueChange={(v) => {
              if (v === "historico") carregarHistorico();
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="checklist" className="flex-1">
                Checklist
              </TabsTrigger>
              <TabsTrigger value="dados" className="flex-1">
                Contratuais
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex-1">
                Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="checklist" className="mt-4">
              <AdmissaoChecklist
                itens={itens}
                candidatoId={admissao.candidatoId}
                podeConferir={podeConduzir}
                ehAlmoxarifado={papel.almoxarifado}
                somenteLeitura={concluida || admissao.status === "cancelada"}
              />
            </TabsContent>

            <TabsContent value="dados" className="mt-4 space-y-2 text-sm">
              <Info rotulo="Candidato" valor={candidato?.nome ?? "—"} />
              <Info rotulo="Cargo" valor={cargo?.nome ?? "—"} />
              <Info rotulo="Setor" valor={admissao.setor || "—"} />
              <Info rotulo="Obra" valor={nomeDoProjeto(estado, admissao.projetoId)} />
              <Info
                rotulo="Tipo de contratação"
                valor={TIPO_CONTRATACAO_LABEL[admissao.tipoContratacao] ?? admissao.tipoContratacao}
              />
              <Info rotulo="Jornada" valor={admissao.jornada || "—"} />
              <Info rotulo="Admissão prevista" valor={dataBr(admissao.dataPrevistaAdmissao)} />
              <Info rotulo="Admissão efetiva" valor={dataBr(admissao.dataEfetivaAdmissao)} />
              <Info
                rotulo="Experiência"
                valor={PERIODO_EXPERIENCIA_LABEL[admissao.periodoExperiencia] ?? "—"}
              />
              <Info rotulo="Fim do 1º período" valor={dataBr(admissao.dataFimExperiencia1)} />
              <Info rotulo="Fim do 2º período" valor={dataBr(admissao.dataFimExperiencia2)} />
              <Info rotulo="Vale-transporte" valor={admissao.valeTransporte ? "Sim" : "Não"} />
              <Info rotulo="Vale-refeição" valor={admissao.valeRefeicao ? "Sim" : "Não"} />
              {papel.veRemuneracao && (
                <>
                  <Info
                    rotulo="Salário proposto"
                    valor={admissao.salario === null ? "—" : brl(admissao.salario)}
                  />
                  <Info rotulo="Validade da proposta" valor={dataBr(admissao.validadeProposta)} />
                </>
              )}
              {cargo && cargo.nrsExigidas.length > 0 && (
                <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>NRs exigidas pelo cargo:</strong> {cargo.nrsExigidas.join(", ")}. Elas
                  entram no checklist automaticamente e bloqueiam a alocação em obra enquanto não
                  estiverem válidas.
                </div>
              )}
              {podeConduzir && !concluida && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {(
                    [
                      "aguardando_candidato",
                      "em_conferencia",
                      "aguardando_exame",
                      "pronta",
                      "cancelada",
                    ] as AdmissaoStatus[]
                  )
                    .filter((s) => s !== admissao.status)
                    .map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant="outline"
                        onClick={() => setMudandoStatus(s)}
                      >
                        {ADMISSAO_STATUS_LABEL[s]}
                      </Button>
                    ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              {carregandoHist ? (
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
                        {ADMISSAO_STATUS_LABEL[h.statusAnterior] ?? (h.statusAnterior || "—")} →{" "}
                        {ADMISSAO_STATUS_LABEL[h.statusNovo] ?? h.statusNovo}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{h.nota}</p>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <NotaDialog
        aberto={concluindo}
        titulo={`Concluir ${admissao.codigo}`}
        descricao="O colaborador é criado a partir do cadastro do candidato: nome, CPF, RG, endereço, contatos e os documentos aprovados do checklist. Gera matrícula e registra a admissão no histórico. Não tem desfazer."
        rotuloConfirmar="Concluir e gerar colaborador"
        placeholder="Ex.: documentação conferida, ASO apto, contrato assinado em 12/09."
        onCancelar={() => setConcluindo(false)}
        onConfirmar={async (nota) => {
          const r = await admissaoActions.concluir(admissao.id, nota);
          if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir a admissão.");
          toast.success("Colaborador criado. Confira a ficha em Colaboradores.");
          setConcluindo(false);
        }}
      />

      {mudandoStatus && (
        <NotaDialog
          aberto
          titulo={`Mudar para ${ADMISSAO_STATUS_LABEL[mudandoStatus]}`}
          descricao="A mudança fica no histórico da admissão, com a sua nota."
          rotuloConfirmar="Registrar"
          destrutivo={mudandoStatus === "cancelada"}
          onCancelar={() => setMudandoStatus(null)}
          onConfirmar={async (nota) => {
            const r = await admissaoActions.mover(admissao.id, mudandoStatus, nota);
            if (!r.ok) throw new Error(r.erro ?? "Não foi possível mudar o status.");
            toast.success("Status atualizado.");
            setMudandoStatus(null);
          }}
        />
      )}
    </>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-3 border-b py-1.5">
      <span className="w-44 shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 flex-1">{valor}</span>
    </div>
  );
}

// ============================================================
// Nova admissão
// ============================================================
function NovaAdmissaoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const cargos = useRhCatalogos((s) => s.cargos.filter((c) => c.ativo));
  const modelos = useRhCatalogos((s) => s.modelos.filter((m) => m.ativo));
  const admissoes = useAdmissoes((s) => s.admissoes);

  const [form, setForm] = useState<AdmissaoInput>({
    candidatoId: "",
    candidaturaId: null,
    cargoId: null,
    setor: "",
    projetoId: null,
    gestorId: null,
    tipoContratacao: "clt",
    jornada: "",
    dataPrevistaAdmissao: null,
    periodoExperiencia: "30_60",
    valeTransporte: false,
    valeRefeicao: false,
    observacoes: "",
    checklistModeloId: null,
    salario: null,
    validadeProposta: null,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // Candidatos que já têm admissão aberta não aparecem: uma pessoa não
  // é admitida duas vezes ao mesmo tempo.
  const jaEmAdmissao = new Set(
    admissoes
      .filter((a) => !["concluida", "cancelada"].includes(a.status))
      .map((a) => a.candidatoId),
  );
  const disponiveis = estado.candidatos.filter(
    (c) => c.ativo && c.status !== "contratado" && !jaEmAdmissao.has(c.id),
  );

  function set<K extends keyof AdmissaoInput>(k: K, v: AdmissaoInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  /** Ao escolher o candidato, puxa a candidatura viva dele, se houver. */
  function escolherCandidato(id: string) {
    const cand = estado.funil.find((f) => f.candidatoId === id && f.status === "em_andamento");
    setForm((f) => ({
      ...f,
      candidatoId: id,
      candidaturaId: cand?.candidaturaId ?? null,
      projetoId: cand?.projetoId ?? f.projetoId,
      cargoId: cand?.cargoId ?? f.cargoId,
    }));
  }

  function escolherCargo(id: string) {
    const cargo = cargos.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      cargoId: id || null,
      setor: f.setor || cargo?.setor || "",
      checklistModeloId: f.checklistModeloId ?? cargo?.checklistModeloId ?? null,
    }));
  }

  async function salvar() {
    if (!form.candidatoId) return;
    setSalvando(true);
    setErro("");
    const r = await admissaoActions.abrir(form);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível abrir a admissão.");
      setSalvando(false);
      return;
    }
    toast.success("Admissão aberta e checklist montado.");
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
          <DialogTitle>Nova admissão</DialogTitle>
          <DialogDescription>
            O checklist é montado a partir do modelo do cargo, somando as NRs exigidas e os EPIs
            padrão.
          </DialogDescription>
        </DialogHeader>

        {disponiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Não há candidato disponível: ou a base está vazia, ou todos já têm admissão aberta.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Candidato</Label>
              <select
                value={form.candidatoId}
                onChange={(e) => escolherCandidato(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Escolha o candidato</option>
                {disponiveis.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.cpf ? ` — ${c.cpf}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <select
                  value={form.cargoId ?? ""}
                  onChange={(e) => escolherCargo(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Sem cargo</option>
                  {cargos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Obra</Label>
                <select
                  value={form.projetoId ?? ""}
                  onChange={(e) => set("projetoId", e.target.value || null)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Sem obra</option>
                  {estado.projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <Input value={form.setor} onChange={(e) => set("setor", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de contratação</Label>
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
              </div>
              <div className="space-y-1.5">
                <Label>Jornada</Label>
                <Input value={form.jornada} onChange={(e) => set("jornada", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Admissão prevista</Label>
                <Input
                  type="date"
                  value={form.dataPrevistaAdmissao ?? ""}
                  onChange={(e) => set("dataPrevistaAdmissao", e.target.value || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Período de experiência</Label>
                <select
                  value={form.periodoExperiencia}
                  onChange={(e) => set("periodoExperiencia", e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  {Object.entries(PERIODO_EXPERIENCIA_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Modelo de checklist</Label>
                <select
                  value={form.checklistModeloId ?? ""}
                  onChange={(e) => set("checklistModeloId", e.target.value || null)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Pelo cargo</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.valeTransporte}
                  onCheckedChange={(v) => set("valeTransporte", v)}
                />
                Vale-transporte
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={form.valeRefeicao}
                  onCheckedChange={(v) => set("valeRefeicao", v)}
                />
                Vale-refeição
              </label>
            </div>

            {papel.veRemuneracao && (
              <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Salário proposto</Label>
                  <InputMoeda valor={form.salario} onChange={(v) => set("salario", v)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Validade da proposta</Label>
                  <Input
                    type="date"
                    value={form.validadeProposta ?? ""}
                    onChange={(e) => set("validadeProposta", e.target.value || null)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </div>

            {erro && (
              <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{erro}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!form.candidatoId || salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Abrindo..." : "Abrir admissão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
