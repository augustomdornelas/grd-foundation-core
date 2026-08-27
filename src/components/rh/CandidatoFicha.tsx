// ============================================================
// Ficha do candidato — painel lateral
// ------------------------------------------------------------
// Um lugar só com o que existe sobre a pessoa: dados, NRs declaradas,
// currículo, TODAS as candidaturas dela (e não só a da vaga aberta na
// tela), os pareceres e o histórico imutável de movimentações.
//
// Pretensão salarial aparece aqui, e só aqui — para quem pode ver.
// Para os demais a linha nem é renderizada, porque o valor nem chega:
// ele mora em rh_candidato_pretensao, com RLS própria.
// ============================================================
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Phone, Mail, MessageCircle, Plus, ArrowRight, FileDown } from "lucide-react";
import { gerarParecerEntrevistaPDF, gerarTermoLgpdPDF } from "@/lib/rh-pdf";
import { brl } from "@/lib/formato";
import {
  CANDIDATO_STATUS_LABEL,
  CANDIDATURA_STATUS_LABEL,
  DISPONIBILIDADE_LABEL,
  ORIGEM_LABEL,
  RECOMENDACAO_ESTILO,
  RECOMENDACAO_LABEL,
  AVALIACAO_TIPO_LABEL,
  dataBr,
  dataHoraBr,
  iniciaisDoNome,
  lerNrsDeclaradas,
} from "@/lib/rh-regras";
import {
  useRhStore,
  usePapelRh,
  urlAssinada,
  rhActions,
  avaliacoesDaCandidatura,
  candidaturasDoCandidato,
  candidatoPorId,
  listarHistoricoCandidatura,
  type FunilItem,
  type HistoricoCandidatura,
  type Avaliacao,
} from "@/lib/rh-store";
import { useRhCatalogos, etapasAtivas } from "@/lib/rh-catalogos-store";
import { SemaforoEtapa } from "@/components/rh/SemaforoEtapa";
import { AvaliacaoDialog } from "@/components/rh/AvaliacaoDialog";
import { MoverEtapaDialog } from "@/components/rh/MoverEtapaDialog";

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-40 shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 flex-1 break-words">{valor}</span>
    </div>
  );
}

export function CandidatoFicha({
  candidatoId,
  candidaturaId,
  aberto,
  onFechar,
}: {
  candidatoId: string | null;
  /** Candidatura em foco quando a ficha foi aberta pelo Kanban. */
  candidaturaId?: string | null;
  aberto: boolean;
  onFechar: () => void;
}) {
  const papel = usePapelRh();
  const candidato = useRhStore((s) => candidatoPorId(s, candidatoId));
  const candidaturas = useRhStore((s) =>
    candidatoId ? candidaturasDoCandidato(s, candidatoId) : [],
  );
  const etapas = useRhCatalogos(etapasAtivas);
  const motivos = useRhCatalogos((s) => s.motivos);

  const [emFoco, setEmFoco] = useState<string | null>(candidaturaId ?? null);
  const [historico, setHistorico] = useState<HistoricoCandidatura[]>([]);
  const [carregandoHist, setCarregandoHist] = useState(false);
  const [parecerAberto, setParecerAberto] = useState(false);
  const [parecerEditando, setParecerEditando] = useState<Avaliacao | undefined>(undefined);
  const [moverPara, setMoverPara] = useState<string>("");

  const candidatura = candidaturas.find((c) => c.candidaturaId === emFoco) ?? candidaturas[0];
  const avaliacoes = useRhStore((s) =>
    candidatura ? avaliacoesDaCandidatura(s, candidatura.candidaturaId) : [],
  );

  useEffect(() => {
    setEmFoco(candidaturaId ?? null);
  }, [candidaturaId, candidatoId]);

  // O efeito depende do ID, não do objeto: `candidatura` é recriado a
  // cada refetch do store, e depender dele recarregaria o histórico
  // toda vez que qualquer coisa do módulo mudasse.
  const idEmFoco = candidatura?.candidaturaId ?? null;
  useEffect(() => {
    if (!aberto || !idEmFoco) {
      setHistorico([]);
      return;
    }
    let vivo = true;
    setCarregandoHist(true);
    void listarHistoricoCandidatura(idEmFoco).then((h) => {
      if (vivo) {
        setHistorico(h);
        setCarregandoHist(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, [aberto, idEmFoco]);

  async function abrirCurriculo() {
    const url = await urlAssinada("curriculos", candidato?.curriculoPath ?? null);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }

  const etapaDestino = etapas.find((e) => e.id === moverPara);
  const podeMover = (etapaId: string) => {
    const e = etapas.find((x) => x.id === etapaId);
    if (!e) return false;
    return papel.editaRh || (papel.gestor && e.permiteGestor);
  };

  const nrs = lerNrsDeclaradas(candidato?.nrsDeclaradas);

  return (
    // Os diálogos ficam FORA do Sheet de propósito: aninhar um Dialog
    // dentro do painel lateral coloca os dois no mesmo empilhamento de
    // camadas do Radix, e o diálogo de nota é justamente o que não pode
    // ficar sem foco nem sem clique.
    <>
      <Sheet
        open={aberto}
        onOpenChange={(a) => {
          if (!a) onFechar();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {!candidato ? (
            <div className="space-y-3 pt-8">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-32 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              <SheetHeader className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#213368] text-sm font-bold text-white">
                    {iniciaisDoNome(candidato.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate text-left">{candidato.nome}</SheetTitle>
                    <SheetDescription className="text-left">
                      {candidato.cargoPretendido || "Cargo não informado"}
                      {candidato.cidade
                        ? ` · ${candidato.cidade}${candidato.uf ? `/${candidato.uf}` : ""}`
                        : ""}
                    </SheetDescription>
                  </div>
                  <Badge variant="outline">
                    {CANDIDATO_STATUS_LABEL[candidato.status] ?? candidato.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  {candidato.curriculoPath && (
                    <Button size="sm" variant="outline" onClick={abrirCurriculo}>
                      <FileText className="mr-1.5 h-3.5 w-3.5" /> Currículo
                    </Button>
                  )}
                  {candidato.whatsapp && (
                    <Button size="sm" variant="outline" asChild>
                      <a
                        href={`https://wa.me/55${candidato.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </Button>
                  )}
                  {candidato.telefone && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`tel:${candidato.telefone.replace(/\D/g, "")}`}>
                        <Phone className="mr-1.5 h-3.5 w-3.5" /> Ligar
                      </a>
                    </Button>
                  )}
                  {candidato.email && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={`mailto:${candidato.email}`}>
                        <Mail className="mr-1.5 h-3.5 w-3.5" /> E-mail
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    title="Termo de consentimento para o candidato assinar"
                    onClick={() =>
                      void gerarTermoLgpdPDF({
                        candidatoNome: candidato.nome,
                        cpf: candidato.cpf,
                        retencaoMeses: 24,
                      })
                    }
                  >
                    <FileDown className="mr-1.5 h-3.5 w-3.5" /> Termo LGPD
                  </Button>
                </div>
              </SheetHeader>

              <Tabs defaultValue="dados" className="mt-5">
                <TabsList className="w-full">
                  <TabsTrigger value="dados" className="flex-1">
                    Dados
                  </TabsTrigger>
                  <TabsTrigger value="processo" className="flex-1">
                    Candidaturas {candidaturas.length > 0 && `(${candidaturas.length})`}
                  </TabsTrigger>
                  <TabsTrigger value="pareceres" className="flex-1">
                    Pareceres {avaliacoes.length > 0 && `(${avaliacoes.length})`}
                  </TabsTrigger>
                  <TabsTrigger value="historico" className="flex-1">
                    Histórico
                  </TabsTrigger>
                </TabsList>

                {/* ---------------- Dados ---------------- */}
                <TabsContent value="dados" className="mt-4 divide-y">
                  <Linha rotulo="CPF" valor={candidato.cpf || "—"} />
                  <Linha rotulo="RG" valor={candidato.rg || "—"} />
                  <Linha rotulo="Nascimento" valor={dataBr(candidato.dataNascimento)} />
                  <Linha rotulo="E-mail" valor={candidato.email || "—"} />
                  <Linha rotulo="Telefone" valor={candidato.telefone || "—"} />
                  <Linha rotulo="WhatsApp" valor={candidato.whatsapp || "—"} />
                  <Linha rotulo="Escolaridade" valor={candidato.escolaridade || "—"} />
                  <Linha
                    rotulo="Disponibilidade"
                    valor={`${DISPONIBILIDADE_LABEL[candidato.disponibilidade] ?? candidato.disponibilidade}${
                      candidato.disponibilidadeViagem ? " · viaja" : ""
                    }`}
                  />
                  <Linha
                    rotulo="CNH"
                    valor={
                      candidato.possuiCnh
                        ? `Sim${candidato.categoriaCnh ? ` — ${candidato.categoriaCnh}` : ""}`
                        : "Não"
                    }
                  />
                  <Linha
                    rotulo="Origem"
                    valor={`${ORIGEM_LABEL[candidato.origem] ?? candidato.origem}${
                      candidato.indicadoPor ? ` — indicado por ${candidato.indicadoPor}` : ""
                    }`}
                  />
                  {papel.veRemuneracao && (
                    <Linha
                      rotulo="Pretensão salarial"
                      valor={
                        candidato.pretensao === null ? "Não informada" : brl(candidato.pretensao)
                      }
                    />
                  )}
                  <Linha
                    rotulo="NRs declaradas"
                    valor={
                      nrs.length === 0 ? (
                        "Nenhuma"
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {nrs.map((n) => (
                            <span
                              key={n.nr}
                              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                                n.valida
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                              title={
                                n.validade
                                  ? `Validade ${dataBr(n.validade)}`
                                  : "Sem validade informada"
                              }
                            >
                              {n.nr}
                            </span>
                          ))}
                        </span>
                      )
                    }
                  />
                  <Linha rotulo="Experiência" valor={candidato.experienciaResumo || "—"} />
                  <Linha rotulo="Observações" valor={candidato.observacoes || "—"} />
                  <Linha
                    rotulo="LGPD"
                    valor={
                      candidato.lgpdConsentimento
                        ? `Consentimento em ${dataBr(candidato.lgpdData)} · retenção até ${dataBr(candidato.lgpdRetencaoAte)}`
                        : "Sem consentimento registrado"
                    }
                  />
                </TabsContent>

                {/* ---------------- Candidaturas ---------------- */}
                <TabsContent value="processo" className="mt-4 space-y-3">
                  {candidaturas.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Este candidato ainda não foi inscrito em nenhuma vaga.
                    </p>
                  ) : (
                    candidaturas.map((c) => (
                      <button
                        key={c.candidaturaId}
                        onClick={() => setEmFoco(c.candidaturaId)}
                        className={`w-full rounded-lg border p-3 text-left transition hover:border-[#F37032] ${
                          c.candidaturaId === candidatura?.candidaturaId
                            ? "border-[#F37032] bg-[#F37032]/5"
                            : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#213368]">
                              {c.vagaCodigo} · {c.vagaTitulo}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Inscrito em {dataBr(c.dataInscricao)} ·{" "}
                              {CANDIDATURA_STATUS_LABEL[c.status] ?? c.status}
                            </p>
                          </div>
                          <Badge
                            style={{ backgroundColor: c.etapaCor }}
                            className="shrink-0 text-white"
                          >
                            {c.etapaNome}
                          </Badge>
                        </div>
                        {(c.etapaTipo === "inicial" || c.etapaTipo === "intermediaria") && (
                          <div className="mt-2">
                            <SemaforoEtapa
                              dias={c.diasNaEtapa}
                              semaforo={c.semaforo}
                              slaDias={c.slaDias}
                            />
                          </div>
                        )}
                      </button>
                    ))
                  )}

                  {candidatura && (papel.editaRh || papel.gestor) && (
                    <div className="flex flex-wrap gap-2 border-t pt-3">
                      {/* Escolher a etapa já abre o diálogo da nota: um
                        botão "confirmar" aqui seria um clique a mais
                        para chegar na mesma tela obrigatória. */}
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <ArrowRight className="h-3.5 w-3.5" />
                        <select
                          value={moverPara}
                          onChange={(e) => setMoverPara(e.target.value)}
                          className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                          aria-label="Mover para a etapa"
                        >
                          <option value="">Mover para outra etapa...</option>
                          {etapas
                            .filter((e) => e.id !== candidatura.etapaId && podeMover(e.id))
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.nome}
                              </option>
                            ))}
                        </select>
                      </label>
                      <Button
                        size="sm"
                        className="bg-[#213368] text-white hover:bg-[#2c4489]"
                        onClick={() => {
                          setParecerEditando(undefined);
                          setParecerAberto(true);
                        }}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" /> Registrar parecer
                      </Button>
                    </div>
                  )}
                </TabsContent>

                {/* ---------------- Pareceres ---------------- */}
                <TabsContent value="pareceres" className="mt-4 space-y-3">
                  {!candidatura ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Escolha uma candidatura na aba anterior.
                    </p>
                  ) : avaliacoes.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum parecer registrado nesta candidatura.
                    </p>
                  ) : (
                    avaliacoes.map((a) => (
                      <article key={a.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#213368]">
                              {AVALIACAO_TIPO_LABEL[a.tipo] ?? a.tipo}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {a.avaliadorNome || "—"} · {dataHoraBr(a.dataHora ?? a.criadaEm)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {a.notaFinal !== null && (
                              <span className="rounded bg-[#213368]/10 px-2 py-0.5 text-sm font-bold text-[#213368]">
                                {a.notaFinal.toFixed(1).replace(".", ",")}
                              </span>
                            )}
                            {a.recomendacao && (
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${RECOMENDACAO_ESTILO[a.recomendacao]}`}
                              >
                                {RECOMENDACAO_LABEL[a.recomendacao]}
                              </span>
                            )}
                          </div>
                        </div>
                        {a.parecer && (
                          <p className="mt-2 whitespace-pre-wrap text-sm">{a.parecer}</p>
                        )}
                        {a.criterios.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.criterios.map((c) => (
                              <span
                                key={c.criterio}
                                className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                              >
                                {c.criterio} {c.nota}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex gap-1">
                          {(papel.editaRh || a.avaliadorId) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => {
                                setParecerEditando(a);
                                setParecerAberto(true);
                              }}
                            >
                              Editar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() =>
                              void gerarParecerEntrevistaPDF({
                                candidatoNome: candidato.nome,
                                vaga: candidatura
                                  ? candidatura.vagaCodigo + " · " + candidatura.vagaTitulo
                                  : "—",
                                cargo: candidato.cargoPretendido,
                                tipo: AVALIACAO_TIPO_LABEL[a.tipo] ?? a.tipo,
                                avaliadorNome: a.avaliadorNome,
                                dataHora: a.dataHora ?? a.criadaEm,
                                local: a.local,
                                criterios: a.criterios,
                                notaFinal: a.notaFinal,
                                parecer: a.parecer,
                                recomendacao: a.recomendacao
                                  ? (RECOMENDACAO_LABEL[a.recomendacao] ?? a.recomendacao)
                                  : "—",
                              })
                            }
                          >
                            <FileDown className="mr-1 h-3 w-3" /> PDF
                          </Button>
                        </div>
                      </article>
                    ))
                  )}
                </TabsContent>

                {/* ---------------- Histórico ---------------- */}
                <TabsContent value="historico" className="mt-4">
                  {carregandoHist ? (
                    <div className="space-y-2">
                      <div className="h-14 animate-pulse rounded bg-muted" />
                      <div className="h-14 animate-pulse rounded bg-muted" />
                    </div>
                  ) : historico.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Sem movimentações registradas nesta candidatura.
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
                            {etapas.find((e) => e.id === h.etapaAnteriorId)?.nome ?? "Início"}
                            {" → "}
                            {etapas.find((e) => e.id === h.etapaNovaId)?.nome ?? h.statusNovo}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-sm">{h.nota}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">
                    Histórico é imutável: o banco recusa alteração e exclusão, inclusive do
                    administrador.
                  </p>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {candidatura && (
        <>
          <AvaliacaoDialog
            aberto={parecerAberto}
            candidaturaId={candidatura.candidaturaId}
            candidatoNome={candidato?.nome ?? ""}
            existente={parecerEditando}
            onFechar={() => setParecerAberto(false)}
            onSalvar={async (input) => {
              const r = await rhActions.salvarAvaliacao(input);
              if (r.ok) toast.success("Parecer registrado.");
              return r;
            }}
          />
          <MoverEtapaDialog
            aberto={moverPara !== ""}
            candidatoNome={candidato?.nome ?? ""}
            etapaOrigem={etapas.find((e) => e.id === candidatura.etapaId)}
            etapaDestino={etapaDestino}
            motivos={motivos}
            onCancelar={() => setMoverPara("")}
            onConfirmar={async (mov) => {
              const r = await rhActions.moverCandidatura(
                candidatura.candidaturaId,
                moverPara,
                mov.nota,
                mov.motivoId,
                mov.motivoTexto,
              );
              if (!r.ok) throw new Error(r.erro ?? "Não foi possível mover o candidato.");
              toast.success(`Movido para ${etapaDestino?.nome}.`);
              setMoverPara("");
            }}
          />
        </>
      )}
    </>
  );
}
