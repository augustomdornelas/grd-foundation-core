// ============================================================
// /app/rh/selecao — o funil, tela principal do módulo
// ------------------------------------------------------------
// Kanban com uma coluna por etapa. Arrastar o card abre o diálogo de
// nota; cancelar desfaz o movimento porque nada foi escrito ainda.
//
// Quem move o quê: RH e Diretoria movem para qualquer etapa; o gestor
// da obra move só para as etapas marcadas como "permite gestor" no
// catálogo — hoje entrevista técnica, teste prático e reprovado. Quem
// recusa de verdade é a função no banco; aqui o card só não sai do lugar.
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
import { Search, LayoutGrid, List, Filter } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { FunilKanban } from "@/components/rh/FunilKanban";
import { CandidatoFicha } from "@/components/rh/CandidatoFicha";
import { SemaforoEtapa } from "@/components/rh/SemaforoEtapa";
import { PERFIS_RH } from "@/lib/current-user";
import { CANDIDATURA_STATUS_LABEL, ORIGEM_LABEL, dataBr, temNrDeclarada } from "@/lib/rh-regras";
import { useRhCatalogos, etapasAtivas, nrsConhecidas } from "@/lib/rh-catalogos-store";
import { useRhStore, usePapelRh, rhActions, nomeDoProjeto, type FunilItem } from "@/lib/rh-store";

export const Route = createFileRoute("/app/rh/selecao")({ component: RhSelecao });

function RhSelecao() {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const carregado = useRhStore((s) => s.carregado);
  const etapas = useRhCatalogos(etapasAtivas);
  const motivos = useRhCatalogos((s) => s.motivos);
  const nrs = useRhCatalogos(nrsConhecidas);

  const [modo, setModo] = useState<"kanban" | "lista">("kanban");
  const [busca, setBusca] = useState("");
  const [fVaga, setFVaga] = useState("");
  const [fObra, setFObra] = useState("");
  const [fOrigem, setFOrigem] = useState("");
  const [fNr, setFNr] = useState("");
  const [soParados, setSoParados] = useState(false);
  const [ficha, setFicha] = useState<FunilItem | null>(null);

  const itens = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return estado.funil
      .filter((i) => (fVaga ? i.vagaId === fVaga : true))
      .filter((i) => (fObra ? i.projetoId === fObra : true))
      .filter((i) => (fOrigem ? i.origem === fOrigem : true))
      .filter((i) => (fNr ? temNrDeclarada(i.nrsDeclaradas, fNr) : true))
      .filter((i) => (soParados ? i.semaforo !== "neutro" : true))
      .filter(
        (i) =>
          !q ||
          `${i.candidatoNome} ${i.cargoPretendido} ${i.cidade} ${i.vagaCodigo}`
            .toLowerCase()
            .includes(q),
      );
  }, [estado.funil, busca, fVaga, fObra, fOrigem, fNr, soParados]);

  const parados = itens.filter((i) => i.semaforo !== "neutro").length;

  // As vagas que aparecem no filtro são só as que têm candidato, mais
  // as abertas — listar vaga encerrada de 2024 aqui não ajuda ninguém.
  const vagasDoFiltro = useMemo(() => {
    const comCandidato = new Set(estado.funil.map((i) => i.vagaId));
    return estado.vagas.filter(
      (v) => comCandidato.has(v.id) || !["encerrada", "cancelada"].includes(v.status),
    );
  }, [estado.vagas, estado.funil]);

  function podeMoverPara(etapaId: string) {
    const e = etapas.find((x) => x.id === etapaId);
    if (!e) return false;
    return papel.editaRh || (papel.gestor && e.permiteGestor);
  }

  return (
    <RhTela
      titulo="Funil de seleção"
      resumo="Uma coluna por etapa. Arraste o card para mover — o sistema pede a nota antes de registrar, e ela fica no histórico."
      perfis={PERFIS_RH.selecao}
    >
      <div className="space-y-4">
        {/* ---------- Filtros ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar candidato..."
              className="pl-9"
            />
          </div>

          <select
            value={fVaga}
            onChange={(e) => setFVaga(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todas as vagas</option>
            {vagasDoFiltro.map((v) => (
              <option key={v.id} value={v.id}>
                {v.codigo} · {v.titulo}
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

          <select
            value={fOrigem}
            onChange={(e) => setFOrigem(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Toda origem</option>
            {Object.entries(ORIGEM_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <select
            value={fNr}
            onChange={(e) => setFNr(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Qualquer NR</option>
            {nrs.map((n) => (
              <option key={n} value={n}>
                Tem {n}
              </option>
            ))}
          </select>

          <Button
            variant={soParados ? "default" : "outline"}
            size="sm"
            onClick={() => setSoParados((v) => !v)}
            className={soParados ? "bg-[#213368] text-white hover:bg-[#2c4489]" : ""}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            Só parados {parados > 0 && `(${parados})`}
          </Button>

          <div className="flex rounded-md border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModo("kanban")}
              className={`rounded-r-none ${modo === "kanban" ? "bg-muted" : ""}`}
              aria-label="Ver como Kanban"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setModo("lista")}
              className={`rounded-l-none ${modo === "lista" ? "bg-muted" : ""}`}
              aria-label="Ver como lista"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ---------- Conteúdo ---------- */}
        {!carregado ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-64 w-[272px] shrink-0 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : etapas.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <h3 className="text-base font-bold text-[#213368]">O funil ainda não tem etapas</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              As etapas padrão são semeadas pela migration do módulo. Se esta tela está vazia, a
              migration não foi aplicada neste banco.
            </p>
          </Card>
        ) : estado.funil.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <h3 className="text-base font-bold text-[#213368]">Nenhum candidato no funil ainda</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Cadastre candidatos em <strong>Candidatos</strong> e inscreva-os numa vaga, ou
              publique a vaga no site para que as inscrições cheguem sozinhas.
            </p>
          </Card>
        ) : itens.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <h3 className="text-base font-bold text-[#213368]">Nada com esses filtros</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Limpe a busca ou troque a vaga selecionada.
            </p>
          </Card>
        ) : modo === "kanban" ? (
          <FunilKanban
            itens={itens}
            etapas={etapas}
            motivos={motivos}
            podeMoverPara={(e) => podeMoverPara(e.id)}
            onAbrirCandidato={setFicha}
            onMover={async (item, etapa, mov) =>
              rhActions.moverCandidatura(
                item.candidaturaId,
                etapa.id,
                mov.nota,
                mov.motivoId,
                mov.motivoTexto,
              )
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Vaga</TableHead>
                    <TableHead>Obra</TableHead>
                    <TableHead>Etapa</TableHead>
                    <TableHead className="text-center">Parado há</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Inscrito em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens
                    .slice()
                    .sort((a, b) => b.diasNaEtapa - a.diasNaEtapa)
                    .map((i) => (
                      <TableRow
                        key={i.candidaturaId}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setFicha(i)}
                      >
                        <TableCell>
                          <div className="font-semibold text-[#213368]">{i.candidatoNome}</div>
                          <div className="text-xs text-muted-foreground">
                            {i.cargoPretendido || "—"}
                            {i.cidade ? ` · ${i.cidade}` : ""}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {i.vagaCodigo} · {i.vagaTitulo}
                        </TableCell>
                        <TableCell className="text-sm">
                          {nomeDoProjeto(estado, i.projetoId)}
                        </TableCell>
                        <TableCell>
                          <span
                            className="inline-block rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                            style={{ backgroundColor: i.etapaCor }}
                          >
                            {i.etapaNome}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {i.etapaTipo === "inicial" || i.etapaTipo === "intermediaria" ? (
                            <SemaforoEtapa
                              dias={i.diasNaEtapa}
                              semaforo={i.semaforo}
                              slaDias={i.slaDias}
                              compacto
                            />
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-center text-sm">{i.score ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {CANDIDATURA_STATUS_LABEL[i.status] ?? i.status}
                        </TableCell>
                        <TableCell className="text-sm">{dataBr(i.dataInscricao)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {!papel.editaRh && papel.gestor && itens.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Como gestor de obra você move candidatos apenas para as etapas de entrevista técnica,
            teste prático e reprovado, e só nas vagas das suas obras.
          </p>
        )}
      </div>

      <CandidatoFicha
        aberto={ficha !== null}
        candidatoId={ficha?.candidatoId ?? null}
        candidaturaId={ficha?.candidaturaId ?? null}
        onFechar={() => setFicha(null)}
      />
    </RhTela>
  );
}
