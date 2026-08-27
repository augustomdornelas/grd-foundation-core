// ============================================================
// /app/rh/candidatos — base única de pessoas e banco de talentos
// ------------------------------------------------------------
// A mesma pessoa nunca é cadastrada duas vezes: o CPF é único no banco
// e o formulário avisa antes de tentar gravar. Quem não passou numa
// vaga não some — vai para o banco de talentos e volta na próxima.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Search,
  MoreHorizontal,
  UserPlus,
  Archive,
  Ban,
  RotateCcw,
  ShieldOff,
  Pencil,
} from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { CandidatoForm } from "@/components/rh/CandidatoForm";
import { CandidatoFicha } from "@/components/rh/CandidatoFicha";
import { NotaDialog } from "@/components/rh/NotaDialog";
import { PERFIS_RH } from "@/lib/current-user";
import {
  CANDIDATO_STATUS_LABEL,
  DISPONIBILIDADE_LABEL,
  ORIGEM_LABEL,
  dataBr,
  lerNrsDeclaradas,
  notaValida,
  temNrDeclarada,
} from "@/lib/rh-regras";
import { useRhCatalogos, nrsConhecidas } from "@/lib/rh-catalogos-store";
import {
  useRhStore,
  usePapelRh,
  rhActions,
  candidaturasDoCandidato,
  type Candidato,
} from "@/lib/rh-store";

export const Route = createFileRoute("/app/rh/candidatos")({ component: RhCandidatos });

function RhCandidatos() {
  const papel = usePapelRh();
  const estado = useRhStore((s) => s);
  const carregado = useRhStore((s) => s.carregado);
  const nrs = useRhCatalogos(nrsConhecidas);

  const [busca, setBusca] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fNr, setFNr] = useState("");
  const [fDisp, setFDisp] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Candidato | undefined>(undefined);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [inscrevendo, setInscrevendo] = useState<Candidato | null>(null);
  const [expurgando, setExpurgando] = useState<Candidato | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    return estado.candidatos
      .filter((c) => c.ativo || c.status === "descartado")
      .filter((c) => (fStatus ? c.status === fStatus : true))
      .filter((c) => (fNr ? temNrDeclarada(c.nrsDeclaradas, fNr) : true))
      .filter((c) => (fDisp ? c.disponibilidade === fDisp : true))
      .filter((c) => {
        if (!q) return true;
        if (qDigitos.length >= 3 && c.cpf.replace(/\D/g, "").includes(qDigitos)) return true;
        return `${c.nome} ${c.cargoPretendido} ${c.cidade} ${c.email}`.toLowerCase().includes(q);
      });
  }, [estado.candidatos, busca, fStatus, fNr, fDisp]);

  return (
    <RhTela
      titulo="Candidatos e banco de talentos"
      resumo="Todo mundo que já se candidatou à GRD. Busque por nome, CPF, cargo, cidade ou NR — e inscreva em qualquer vaga aberta sem recadastrar."
      perfis={PERFIS_RH.selecao}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, CPF, cargo, cidade..."
              className="pl-9"
            />
          </div>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todas as situações</option>
            {Object.entries(CANDIDATO_STATUS_LABEL).map(([k, v]) => (
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
          <select
            value={fDisp}
            onChange={(e) => setFDisp(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Qualquer disponibilidade</option>
            {Object.entries(DISPONIBILIDADE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          {papel.editaRh && (
            <Button
              onClick={() => {
                setEditando(undefined);
                setFormAberto(true);
              }}
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo candidato
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
                {estado.candidatos.length === 0
                  ? "A base de candidatos está vazia"
                  : "Nada com esses filtros"}
              </h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {estado.candidatos.length === 0
                  ? "Cadastre quem já mandou currículo por WhatsApp ou e-mail. Depois que o site estiver no ar, as inscrições caem aqui sozinhas."
                  : "Limpe a busca ou troque os filtros."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Candidato</TableHead>
                    <TableHead>Cargo pretendido</TableHead>
                    <TableHead>Cidade</TableHead>
                    <TableHead>NRs declaradas</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-center">Candidaturas</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Cadastro</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => {
                    const nrsC = lerNrsDeclaradas(c.nrsDeclaradas);
                    const quantas = candidaturasDoCandidato(estado, c.id).length;
                    return (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => setFichaId(c.id)}
                      >
                        <TableCell>
                          <div className="font-semibold text-[#213368]">{c.nome}</div>
                          <div className="text-xs text-muted-foreground">{c.cpf || "sem CPF"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{c.cargoPretendido || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "—"}
                        </TableCell>
                        <TableCell>
                          {nrsC.length === 0 ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {nrsC.slice(0, 3).map((n) => (
                                <span
                                  key={n.nr}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    n.valida
                                      ? "bg-emerald-50 text-emerald-700"
                                      : "bg-red-50 text-red-700"
                                  }`}
                                >
                                  {n.nr}
                                </span>
                              ))}
                              {nrsC.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{nrsC.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ORIGEM_LABEL[c.origem] ?? c.origem}
                        </TableCell>
                        <TableCell className="text-center text-sm">{quantas || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CANDIDATO_STATUS_LABEL[c.status] ?? c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{dataBr(c.criadoEm)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {papel.editaRh && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  aria-label={`Ações de ${c.nome}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuItem onClick={() => setInscrevendo(c)}>
                                  <UserPlus className="mr-2 h-4 w-4" /> Inscrever em uma vaga
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditando(c);
                                    setFormAberto(true);
                                  }}
                                >
                                  <Pencil className="mr-2 h-4 w-4" /> Editar cadastro
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {c.status !== "banco_talentos" && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      const r = await rhActions.mudarStatusCandidato(
                                        c.id,
                                        "banco_talentos",
                                      );
                                      if (r.ok)
                                        toast.success(`${c.nome} foi para o banco de talentos.`);
                                      else
                                        toast.error(r.erro ?? "Não foi possível mudar a situação.");
                                    }}
                                  >
                                    <Archive className="mr-2 h-4 w-4" /> Banco de talentos
                                  </DropdownMenuItem>
                                )}
                                {c.status !== "nao_disponivel" && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      const r = await rhActions.mudarStatusCandidato(
                                        c.id,
                                        "nao_disponivel",
                                      );
                                      if (r.ok)
                                        toast.success(`${c.nome} marcado como indisponível.`);
                                      else
                                        toast.error(r.erro ?? "Não foi possível mudar a situação.");
                                    }}
                                  >
                                    <Ban className="mr-2 h-4 w-4" /> Marcar indisponível
                                  </DropdownMenuItem>
                                )}
                                {c.status !== "ativo" && (
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      const r = await rhActions.mudarStatusCandidato(c.id, "ativo");
                                      if (r.ok) toast.success(`${c.nome} voltou para ativo.`);
                                      else
                                        toast.error(r.erro ?? "Não foi possível mudar a situação.");
                                    }}
                                  >
                                    <RotateCcw className="mr-2 h-4 w-4" /> Reativar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onClick={() => setExpurgando(c)}
                                >
                                  <ShieldOff className="mr-2 h-4 w-4" /> Exclusão LGPD
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
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

      <CandidatoForm
        aberto={formAberto}
        candidato={editando}
        onFechar={() => setFormAberto(false)}
        onAbrirExistente={(id) => setFichaId(id)}
        onSalvar={async (input) => {
          const r = editando
            ? await rhActions.atualizarCandidato(editando.id, input)
            : await rhActions.criarCandidato(input);
          if (r.ok) toast.success(editando ? "Cadastro atualizado." : "Candidato cadastrado.");
          return r;
        }}
      />

      <CandidatoFicha
        aberto={fichaId !== null}
        candidatoId={fichaId}
        onFechar={() => setFichaId(null)}
      />

      <InscreverDialog candidato={inscrevendo} onFechar={() => setInscrevendo(null)} />

      {expurgando && (
        <NotaDialog
          aberto
          titulo={`Exclusão LGPD — ${expurgando.nome}`}
          descricao="Nome, CPF, contatos e currículo são apagados e o cadastro fica anônimo. As candidaturas e a estatística continuam — o que se apaga é o dado pessoal, não a história. Não tem volta."
          rotuloConfirmar="Anonimizar"
          placeholder="Ex.: pedido de exclusão recebido por e-mail em 12/09."
          destrutivo
          onCancelar={() => setExpurgando(null)}
          onConfirmar={async (nota) => {
            const r = await rhActions.anonimizarCandidato(expurgando.id, nota);
            if (!r.ok) throw new Error(r.erro ?? "Não foi possível anonimizar.");
            toast.success("Dados pessoais anonimizados.");
            setExpurgando(null);
          }}
        />
      )}
    </RhTela>
  );
}

/** Inscrever numa vaga: escolher a vaga e escrever a nota da inscrição. */
function InscreverDialog({
  candidato,
  onFechar,
}: {
  candidato: Candidato | null;
  onFechar: () => void;
}) {
  const estado = useRhStore((s) => s);
  const [vagaId, setVagaId] = useState("");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const jaInscrito = new Set(
    candidato ? candidaturasDoCandidato(estado, candidato.id).map((c) => c.vagaId) : [],
  );
  const disponiveis = estado.vagas.filter(
    (v) => v.ativo && !["encerrada", "cancelada"].includes(v.status) && !jaInscrito.has(v.id),
  );

  async function inscrever() {
    if (!candidato || !vagaId) return;
    setSalvando(true);
    setErro("");
    const r = await rhActions.inscreverCandidato(
      candidato.id,
      vagaId,
      nota.trim() || "Inscrição registrada pelo RH.",
    );
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível inscrever.");
      setSalvando(false);
      return;
    }
    toast.success(`${candidato.nome} entrou no funil.`);
    setVagaId("");
    setNota("");
    setSalvando(false);
    onFechar();
  }

  return (
    <Dialog
      open={candidato !== null}
      onOpenChange={(a) => {
        if (!a && !salvando) {
          setVagaId("");
          setNota("");
          setErro("");
          onFechar();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Inscrever {candidato?.nome} em uma vaga</DialogTitle>
          <DialogDescription>
            O candidato entra na primeira etapa do funil, com a inscrição já registrada no
            histórico.
          </DialogDescription>
        </DialogHeader>

        {disponiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Não há vaga aberta em que este candidato ainda não esteja inscrito.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vaga</Label>
              <select
                value={vagaId}
                onChange={(e) => setVagaId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              >
                <option value="">Escolha a vaga</option>
                {disponiveis.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.codigo} · {v.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Nota da inscrição (opcional)</Label>
              <Textarea
                rows={2}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ex.: indicado pelo encarregado da obra da Bracell."
              />
              {nota.length > 0 && !notaValida(nota) && (
                <p className="text-xs text-muted-foreground">
                  Notas com menos de 5 caracteres são substituídas pelo texto padrão.
                </p>
              )}
            </div>
            {erro && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{erro}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            onClick={inscrever}
            disabled={!vagaId || salvando}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {salvando ? "Inscrevendo..." : "Inscrever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
