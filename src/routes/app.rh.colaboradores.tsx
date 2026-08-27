// ============================================================
// /app/rh/colaboradores — a ficha de quem já está dentro
// ------------------------------------------------------------
// A coluna "Aptidão" é a regra 8 na cara da tela: verde só quando o
// ASO está válido, as NRs que o cargo exige estão válidas e os EPIs
// padrão foram entregues com termo assinado. Vermelho traz a lista do
// que falta, sem obrigar ninguém a caçar o motivo.
//
// Trocar de obra passa por rh_alocar_funcionario(), que recusa quando
// há pendência — e recusa também para quem chamar a API direto.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Search, FileDown, HardHat, RefreshCw, Trash2 } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { AptidaoBadge, ListaPendencias } from "@/components/rh/AptidaoBadge";
import { DocumentosTabela } from "@/components/rh/DocumentosTabela";
import { NotaDialog } from "@/components/rh/NotaDialog";
import { PERFIS_RH, useCurrentUser } from "@/lib/current-user";
import { brl } from "@/lib/formato";
import { TIPO_CONTRATACAO_LABEL, dataBr, formatarCpf } from "@/lib/rh-regras";
import { gerarFichaColaboradorPDF } from "@/lib/rh-pdf";
import { useRhCatalogos } from "@/lib/rh-catalogos-store";
import { useRhStore, usePapelRh, nomeDoProjeto } from "@/lib/rh-store";
import {
  useColaboradores,
  colaboradorActions,
  aptidaoDe,
  dependentesDe,
  vencimentosDe,
  historicoRemuneracao,
  remuneracaoAtual,
  listarHistoricoColaborador,
  listarEpisDoColaborador,
  MOTIVO_REMUNERACAO_LABEL,
  SITUACAO_ESTILO,
  SITUACAO_LABEL,
  TIPO_HISTORICO_LABEL,
  type Colaborador,
  type HistoricoColaborador,
} from "@/lib/rh-colaboradores-store";

export const Route = createFileRoute("/app/rh/colaboradores")({ component: RhColaboradores });

function RhColaboradores() {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const carregado = useColaboradores((s) => s.carregado);
  const alocacao = useColaboradores((s) => s.alocacao);

  const [busca, setBusca] = useState("");
  const [fSituacao, setFSituacao] = useState("ativos");
  const [fObra, setFObra] = useState("");
  const [soInaptos, setSoInaptos] = useState(false);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [recalculando, setRecalculando] = useState(false);

  // useMemo aqui não é otimização: o Set entra nas dependências do
  // useMemo da lista, e um Set novo a cada render refaria o filtro
  // inteiro sempre.
  const inaptos = useMemo(
    () => new Set(alocacao.filter((a) => !a.apto).map((a) => a.funcionarioId)),
    [alocacao],
  );

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    return colaboradores
      .filter((c) => {
        if (fSituacao === "ativos") return c.situacao !== "desligado";
        if (fSituacao === "todos") return true;
        return c.situacao === fSituacao;
      })
      .filter((c) => (fObra ? c.projetoId === fObra : true))
      .filter((c) => (soInaptos ? inaptos.has(c.id) : true))
      .filter((c) => {
        if (!q) return true;
        if (qDigitos.length >= 3 && c.cpf.replace(/\D/g, "").includes(qDigitos)) return true;
        return `${c.nome} ${c.matricula} ${c.cargo} ${c.setor}`.toLowerCase().includes(q);
      });
  }, [colaboradores, busca, fSituacao, fObra, soInaptos, inaptos]);

  return (
    <RhTela
      titulo="Colaboradores"
      resumo="Ficha completa, documentos com validade, EPIs, histórico e obra atual — com a aptidão para entrar em obra sempre à vista."
      perfis={PERFIS_RH.colaboradores}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, matrícula, CPF, cargo..."
              className="pl-9"
            />
          </div>
          <select
            value={fSituacao}
            onChange={(e) => setFSituacao(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="ativos">Não desligados</option>
            <option value="todos">Todos</option>
            {Object.entries(SITUACAO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            value={fObra}
            onChange={(e) => setFObra(e.target.value)}
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
            size="sm"
            variant={soInaptos ? "default" : "outline"}
            onClick={() => setSoInaptos((v) => !v)}
            className={soInaptos ? "bg-[#213368] text-white hover:bg-[#2c4489]" : ""}
          >
            Só inaptos {inaptos.size > 0 && `(${inaptos.size})`}
          </Button>
          {papel.editaRh && (
            <Button
              size="sm"
              variant="outline"
              disabled={recalculando}
              title="Recalcula a aptidão de todo mundo e recarimba a situação dos documentos"
              onClick={async () => {
                setRecalculando(true);
                const r = await colaboradorActions.recalcularAptidao();
                setRecalculando(false);
                if (r.ok) toast.success(`Aptidão recalculada para ${r.dado ?? 0} colaboradores.`);
                else toast.error(r.erro ?? "Não foi possível recalcular.");
              }}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${recalculando ? "animate-spin" : ""}`} />
              Recalcular aptidão
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
                {colaboradores.length === 0
                  ? "Nenhum colaborador cadastrado"
                  : "Nada com esses filtros"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {colaboradores.length === 0
                  ? "Colaboradores entram por aqui quando uma admissão é concluída — nome, CPF, endereço e documentos migram do cadastro do candidato."
                  : "Limpe a busca ou troque os filtros."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Obra atual</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Aptidão</TableHead>
                    <TableHead>Admissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => {
                    const ap = alocacao.find((a) => a.funcionarioId === c.id);
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setDetalhe(c.id)}
                      >
                        <TableCell className="font-mono text-xs">{c.matricula || "—"}</TableCell>
                        <TableCell>
                          <div className="font-semibold text-[#213368]">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">{c.cpf || "sem CPF"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{c.cargo || "—"}</TableCell>
                        <TableCell className="text-sm">{c.setor || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {nomeDoProjeto(estado, c.projetoId)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACAO_ESTILO[c.situacao]}`}
                          >
                            {SITUACAO_LABEL[c.situacao]}
                          </span>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <AptidaoBadge
                            apto={ap?.apto ?? false}
                            pendencias={ap?.pendencias ?? []}
                            compacto
                          />
                        </TableCell>
                        <TableCell className="text-sm">{dataBr(c.dataAdmissao)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <ColaboradorFicha id={detalhe} onFechar={() => setDetalhe(null)} />
    </RhTela>
  );
}

// ============================================================
// Ficha do colaborador
// ============================================================
function ColaboradorFicha({ id, onFechar }: { id: string | null; onFechar: () => void }) {
  const user = useCurrentUser();
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const cargos = useRhCatalogos((s) => s.cargos);
  const tiposDoc = useRhCatalogos((s) => s.tiposDocumento);
  const colaborador = useColaboradores((s) => s.colaboradores.find((c) => c.id === id));
  const aptidao = useColaboradores((s) => (id ? aptidaoDe(s, id) : null));
  const vencimentos = useColaboradores((s) => (id ? vencimentosDe(s, id) : []));
  const dependentes = useColaboradores((s) => (id ? dependentesDe(s, id) : []));
  const remuneracoes = useColaboradores((s) => (id ? historicoRemuneracao(s, id) : []));
  const salarioAtual = useColaboradores((s) => (id ? remuneracaoAtual(s, id) : undefined));

  const [historico, setHistorico] = useState<HistoricoColaborador[]>([]);
  const [epis, setEpis] = useState<Awaited<ReturnType<typeof listarEpisDoColaborador>>>([]);
  const [alocando, setAlocando] = useState<string | null>(null);
  const [docAberto, setDocAberto] = useState(false);
  const [depAberto, setDepAberto] = useState(false);
  const [salarioAberto, setSalarioAberto] = useState(false);

  if (!colaborador || !id) {
    return (
      <Sheet open={false} onOpenChange={() => onFechar()}>
        <SheetContent />
      </Sheet>
    );
  }
  const col = colaborador;
  const cargo = cargos.find((c) => c.id === col.cargoId);

  async function baixarFicha() {
    await gerarFichaColaboradorPDF({
      nome: col.nome,
      matricula: col.matricula,
      cpf: col.cpf,
      rg: col.rg,
      cargo: cargo?.nome || col.cargo,
      setor: col.setor,
      obra: nomeDoProjeto(estado, col.projetoId),
      situacao: SITUACAO_LABEL[col.situacao] ?? col.situacao,
      dataAdmissao: col.dataAdmissao,
      telefone: col.telefone,
      contatoEmergencia: [col.contatoEmergenciaNome, col.contatoEmergenciaTelefone]
        .filter(Boolean)
        .join(" — "),
      apto: aptidao?.apto ?? false,
      pendencias: aptidao?.pendencias ?? [],
      documentos: vencimentos.map((d) => ({
        tipo: d.tipoNome,
        numero: d.numero,
        emissao: dataBr(d.dataEmissao),
        vencimento: dataBr(d.dataVencimento),
        situacao:
          d.situacaoDocumento === "vencido"
            ? "Vencido"
            : d.situacaoDocumento === "sem_vencimento"
              ? "Sem vencimento"
              : `${d.diasParaVencer} dias`,
      })),
      epis: epis.map((e) => ({
        termo: e.numeroTermo,
        data: dataBr(e.dataEntrega),
        assinado: e.assinado,
        itens: e.itens.join(", "),
      })),
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
            <SheetTitle className="text-left">{col.nome}</SheetTitle>
            <SheetDescription className="text-left">
              {col.matricula ? `Matrícula ${col.matricula} · ` : ""}
              {cargo?.nome || col.cargo || "sem cargo"} · {nomeDoProjeto(estado, col.projetoId)}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AptidaoBadge apto={aptidao?.apto ?? false} pendencias={aptidao?.pendencias ?? []} />
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACAO_ESTILO[col.situacao]}`}
            >
              {SITUACAO_LABEL[col.situacao]}
            </span>
            <Button size="sm" variant="outline" onClick={baixarFicha}>
              <FileDown className="mr-1.5 h-3.5 w-3.5" /> Ficha em PDF
            </Button>
          </div>

          {aptidao && !aptidao.apto && (
            <div className="mt-3 rounded-lg bg-red-50 p-3">
              <p className="mb-1.5 text-xs font-semibold text-red-800">
                Não pode ser alocado em obra enquanto faltar:
              </p>
              <ListaPendencias pendencias={aptidao.pendencias} />
            </div>
          )}

          <Tabs
            defaultValue="pessoais"
            className="mt-4"
            onValueChange={(v) => {
              if (v === "historico" && historico.length === 0) {
                void listarHistoricoColaborador(col.id).then(setHistorico);
              }
              if (v === "epis" && epis.length === 0) {
                void listarEpisDoColaborador(col.id).then(setEpis);
              }
            }}
          >
            <TabsList className="w-full flex-wrap">
              <TabsTrigger value="pessoais" className="flex-1">
                Pessoais
              </TabsTrigger>
              <TabsTrigger value="contratuais" className="flex-1">
                Contratuais
              </TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1">
                Documentos
              </TabsTrigger>
              <TabsTrigger value="dependentes" className="flex-1">
                Dependentes
              </TabsTrigger>
              <TabsTrigger value="epis" className="flex-1">
                EPIs
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex-1">
                Histórico
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pessoais" className="mt-4 divide-y text-sm">
              <Linha rotulo="CPF" valor={col.cpf} />
              <Linha rotulo="RG" valor={col.rg} />
              <Linha rotulo="Nascimento" valor={dataBr(col.dataNascimento)} />
              <Linha rotulo="Nome da mãe" valor={col.nomeMae} />
              <Linha rotulo="Estado civil" valor={col.estadoCivil} />
              <Linha rotulo="Escolaridade" valor={col.escolaridade} />
              <Linha rotulo="Telefone" valor={col.telefone} />
              <Linha rotulo="E-mail" valor={col.email} />
              <Linha
                rotulo="Contato de emergência"
                valor={[
                  col.contatoEmergenciaNome,
                  col.contatoEmergenciaParentesco,
                  col.contatoEmergenciaTelefone,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <Linha rotulo="PIS / NIS" valor={col.pisNis} />
              <Linha
                rotulo="CTPS"
                valor={[col.ctpsNumero, col.ctpsSerie, col.ctpsUf].filter(Boolean).join(" / ")}
              />
            </TabsContent>

            <TabsContent value="contratuais" className="mt-4 space-y-3 text-sm">
              <div className="divide-y">
                <Linha rotulo="Cargo" valor={cargo?.nome || col.cargo} />
                <Linha rotulo="Setor" valor={col.setor} />
                <Linha
                  rotulo="Tipo de contratação"
                  valor={TIPO_CONTRATACAO_LABEL[col.tipoContratacao] ?? col.tipoContratacao}
                />
                <Linha rotulo="Jornada" valor={col.jornada} />
                <Linha rotulo="Admissão" valor={dataBr(col.dataAdmissao)} />
                <Linha rotulo="Obra atual" valor={nomeDoProjeto(estado, col.projetoId)} />
                {col.situacao === "desligado" && (
                  <>
                    <Linha rotulo="Desligamento" valor={dataBr(col.dataDesligamento)} />
                    <Linha rotulo="Motivo" valor={col.motivoDesligamento} />
                  </>
                )}
                {papel.veRemuneracao && (
                  <Linha
                    rotulo="Salário atual"
                    valor={salarioAtual ? brl(salarioAtual.salario) : "não informado"}
                  />
                )}
              </div>

              {papel.veRemuneracao && remuneracoes.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Histórico de remuneração
                  </p>
                  <div className="divide-y rounded-lg border">
                    {remuneracoes.map((r) => (
                      <div key={r.id} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <p className="font-medium">{brl(r.salario)}</p>
                          <p className="text-xs text-muted-foreground">
                            desde {dataBr(r.vigenciaInicio)} ·{" "}
                            {MOTIVO_REMUNERACAO_LABEL[r.motivo] ?? r.motivo}
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground">{r.autorNome}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {papel.editaRh && col.situacao !== "desligado" && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAlocando(col.projetoId ?? "")}
                  >
                    <HardHat className="mr-1.5 h-3.5 w-3.5" /> Trocar de obra
                  </Button>
                  {papel.veRemuneracao && (
                    <Button size="sm" variant="outline" onClick={() => setSalarioAberto(true)}>
                      Registrar mudança de salário
                    </Button>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="documentos" className="mt-4 space-y-3">
              {papel.editaRh && (
                <Button
                  size="sm"
                  onClick={() => setDocAberto(true)}
                  className="bg-[#213368] text-white hover:bg-[#2c4489]"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar documento
                </Button>
              )}
              <div className="rounded-lg border">
                <DocumentosTabela
                  documentos={vencimentos}
                  vazio="Nenhum documento cadastrado. Sem ASO válido e sem as NRs do cargo, este colaborador não pode ser alocado."
                />
              </div>
            </TabsContent>

            <TabsContent value="dependentes" className="mt-4 space-y-3">
              {papel.editaRh && (
                <Button
                  size="sm"
                  onClick={() => setDepAberto(true)}
                  className="bg-[#213368] text-white hover:bg-[#2c4489]"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar dependente
                </Button>
              )}
              {dependentes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum dependente cadastrado.
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {dependentes.map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-[#213368]">{d.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {d.parentesco || "—"} · {dataBr(d.dataNascimento)}
                          {d.paraIr ? " · IR" : ""}
                          {d.paraSalarioFamilia ? " · salário-família" : ""}
                        </p>
                      </div>
                      {papel.editaRh && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Remover da lista"
                          onClick={async () => {
                            const r = await colaboradorActions.inativarDependente(d.id);
                            if (r.ok) toast.success("Dependente removido da lista.");
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="epis" className="mt-4">
              {epis.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma entrega de EPI registrada. As entregas são feitas no módulo de EPIs, pelo
                  almoxarifado.
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {epis.map((e) => (
                    <div key={e.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-[#213368]">
                          Termo {e.numeroTermo || "—"} · {dataBr(e.dataEntrega)}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            e.assinado
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {e.assinado ? "assinado" : "sem assinatura"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {e.itens.join(", ") || "sem itens"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              {historico.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sem eventos registrados.
                </p>
              ) : (
                <ol className="space-y-3 border-l pl-4">
                  {historico.map((h) => (
                    <li key={h.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[#F37032]" />
                      <p className="text-xs text-muted-foreground">
                        {dataBr(h.dataEvento)} · {h.autorNome || "sistema"}
                      </p>
                      <p className="text-sm font-medium text-[#213368]">
                        {TIPO_HISTORICO_LABEL[h.tipo] ?? h.tipo}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm">{h.descricao}</p>
                      {(h.valorAnterior || h.valorNovo) && (
                        <p className="text-xs text-muted-foreground">
                          {h.valorAnterior || "—"} → {h.valorNovo || "—"}
                        </p>
                      )}
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
        </SheetContent>
      </Sheet>

      {alocando !== null && <AlocarDialog colaborador={col} onFechar={() => setAlocando(null)} />}

      <DocumentoDialog
        aberto={docAberto}
        funcionarioId={col.id}
        tipos={tiposDoc}
        onFechar={() => setDocAberto(false)}
      />

      <DependenteDialog
        aberto={depAberto}
        funcionarioId={col.id}
        onFechar={() => setDepAberto(false)}
      />

      <SalarioDialog
        aberto={salarioAberto}
        colaborador={col}
        autor={{ id: user.id, nome: user.nome }}
        onFechar={() => setSalarioAberto(false)}
      />
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-44 shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 flex-1 break-words">{valor || "—"}</span>
    </div>
  );
}

// ============================================================
// Trocar de obra — a regra 8 aplicada
// ============================================================
function AlocarDialog({
  colaborador,
  onFechar,
}: {
  colaborador: Colaborador;
  onFechar: () => void;
}) {
  const estado = useRhStore((s) => s);
  const aptidao = useColaboradores((s) => aptidaoDe(s, colaborador.id));
  const [projeto, setProjeto] = useState(colaborador.projetoId ?? "");
  const [confirmando, setConfirmando] = useState(false);

  return (
    <>
      <Dialog
        open
        onOpenChange={(a) => {
          if (!a) onFechar();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar {colaborador.nome} de obra</DialogTitle>
            <DialogDescription>
              O sistema recusa a alocação se faltar ASO válido, alguma NR exigida pelo cargo ou EPI
              com termo assinado.
            </DialogDescription>
          </DialogHeader>

          {!aptidao.apto && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="mb-1.5 text-xs font-semibold text-red-800">
                Pendências que vão bloquear:
              </p>
              <ListaPendencias pendencias={aptidao.pendencias} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Obra</Label>
            <select
              value={projeto}
              onChange={(e) => setProjeto(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Sem obra (escritório / disponível)</option>
              {estado.projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
              onClick={() => setConfirmando(true)}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NotaDialog
        aberto={confirmando}
        titulo="Registrar a mudança de obra"
        descricao="A troca fica no histórico do colaborador, com a sua nota."
        rotuloConfirmar="Alocar"
        placeholder="Ex.: transferido para a obra da Bracell a pedido do encarregado."
        onCancelar={() => setConfirmando(false)}
        onConfirmar={async (nota) => {
          const r = await colaboradorActions.alocar(colaborador.id, projeto || null, nota);
          if (!r.ok) throw new Error(r.erro ?? "Não foi possível alocar.");
          toast.success("Alocação registrada.");
          setConfirmando(false);
          onFechar();
        }}
      />
    </>
  );
}

// ============================================================
// Documento do colaborador
// ============================================================
function DocumentoDialog({
  aberto,
  funcionarioId,
  tipos,
  onFechar,
}: {
  aberto: boolean;
  funcionarioId: string;
  tipos: { id: string; nome: string; temVencimento: boolean; validadePadraoMeses: number }[];
  onFechar: () => void;
}) {
  const [tipoId, setTipoId] = useState("");
  const [numero, setNumero] = useState("");
  const [emissor, setEmissor] = useState("");
  const [emissao, setEmissao] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const tipo = tipos.find((t) => t.id === tipoId);

  /** Escolher a emissão já sugere o vencimento pela validade padrão do tipo. */
  function mudarEmissao(valor: string) {
    setEmissao(valor);
    if (valor && tipo?.temVencimento && tipo.validadePadraoMeses > 0 && !vencimento) {
      const d = new Date(`${valor}T00:00:00`);
      d.setMonth(d.getMonth() + tipo.validadePadraoMeses);
      setVencimento(d.toISOString().slice(0, 10));
    }
  }

  async function salvar() {
    if (!tipoId) return;
    setSalvando(true);
    setErro("");
    const r = await colaboradorActions.salvarDocumento({
      funcionarioId,
      tipoDocumentoId: tipoId,
      numero,
      emissor,
      dataEmissao: emissao || null,
      dataVencimento: vencimento || null,
      observacao,
    });
    if (!r.ok || !r.dado) {
      setErro(r.erro ?? "Não foi possível salvar o documento.");
      setSalvando(false);
      return;
    }
    if (arquivo) {
      const up = await colaboradorActions.enviarArquivoDocumento(r.dado, funcionarioId, arquivo);
      if (!up.ok) {
        setErro(`Documento salvo, mas o arquivo não subiu: ${up.erro}`);
        setSalvando(false);
        return;
      }
    }
    toast.success("Documento cadastrado. A aptidão foi recalculada.");
    setTipoId("");
    setNumero("");
    setEmissor("");
    setEmissao("");
    setVencimento("");
    setObservacao("");
    setArquivo(null);
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
          <DialogTitle>Adicionar documento</DialogTitle>
          <DialogDescription>
            Documento com vencimento derruba a aptidão sozinho quando a data passa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <select
              value={tipoId}
              onChange={(e) => setTipoId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            >
              <option value="">Escolha o tipo</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Emissor</Label>
              <Input
                value={emissor}
                onChange={(e) => setEmissor(e.target.value)}
                placeholder="Clínica, órgão, instrutor"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emissão</Label>
              <Input type="date" value={emissao} onChange={(e) => mudarEmissao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Arquivo (opcional)</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!tipoId || salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Salvar documento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dependente
// ============================================================
function DependenteDialog({
  aberto,
  funcionarioId,
  onFechar,
}: {
  aberto: boolean;
  funcionarioId: string;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [parentesco, setParentesco] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [cpf, setCpf] = useState("");
  const [paraIr, setParaIr] = useState(false);
  const [paraSf, setParaSf] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (nome.trim().length < 3) return;
    setSalvando(true);
    setErro("");
    const r = await colaboradorActions.salvarDependente({
      funcionarioId,
      nome,
      parentesco,
      dataNascimento: nascimento || null,
      cpf,
      paraIr,
      paraSalarioFamilia: paraSf,
    });
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível salvar.");
      setSalvando(false);
      return;
    }
    toast.success("Dependente cadastrado.");
    setNome("");
    setParentesco("");
    setNascimento("");
    setCpf("");
    setParaIr(false);
    setParaSf(false);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar dependente</DialogTitle>
          <DialogDescription>Usado no imposto de renda e no salário-família.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Parentesco</Label>
              <Input
                value={parentesco}
                onChange={(e) => setParentesco(e.target.value)}
                placeholder="Filho(a), cônjuge"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nascimento</Label>
              <Input
                type="date"
                value={nascimento}
                onChange={(e) => setNascimento(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>CPF</Label>
            <Input
              value={cpf}
              onChange={(e) => setCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={paraIr} onCheckedChange={setParaIr} /> Para IR
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={paraSf} onCheckedChange={setParaSf} /> Salário-família
            </label>
          </div>
          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={nome.trim().length < 3 || salvando}
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
// Mudança de salário
// ============================================================
function SalarioDialog({
  aberto,
  colaborador,
  autor,
  onFechar,
}: {
  aberto: boolean;
  colaborador: Colaborador;
  autor: { id: string; nome: string };
  onFechar: () => void;
}) {
  const [salario, setSalario] = useState<number | null>(null);
  const [vigencia, setVigencia] = useState(new Date().toISOString().slice(0, 10));
  const [motivo, setMotivo] = useState("ajuste");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (salario === null) return;
    setSalvando(true);
    setErro("");
    const r = await colaboradorActions.registrarRemuneracao({
      funcionarioId: colaborador.id,
      salario,
      vigenciaInicio: vigencia,
      motivo,
      cargoId: colaborador.cargoId,
      autorId: autor.id || null,
      autorNome: autor.nome,
    });
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível registrar.");
      setSalvando(false);
      return;
    }
    toast.success("Remuneração registrada.");
    setSalario(null);
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mudança de salário — {colaborador.nome}</DialogTitle>
          <DialogDescription>
            A vigência anterior é fechada no dia anterior a esta. O histórico do colaborador
            registra que houve mudança, sem o valor — Engenharia lê aquela tabela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Novo salário</Label>
            <InputMoeda valor={salario} onChange={setSalario} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vigência a partir de</Label>
              <Input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                {Object.entries(MOTIVO_REMUNERACAO_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={salario === null || salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Salvando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
