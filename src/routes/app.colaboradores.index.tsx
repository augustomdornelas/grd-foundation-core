// ============================================================
// /app/colaboradores — o cadastro de colaboradores
// ------------------------------------------------------------
// Uma lista e um formulário. Colaborador entra por aqui de três
// jeitos: admissão concluída, importação da Secullum (aba ao lado) ou o
// botão "Novo colaborador". Não sai por exclusão: sai mudando a
// situação para Desligado.
//
// Documentos, aptidão, EPIs, dependentes, salário, histórico e obra
// saíram desta tela. Os dados continuam no banco.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Plus, Search, Pencil } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { ColaboradorFormDialog } from "@/components/colaboradores/ColaboradorFormDialog";
import { PERFIS_RH } from "@/lib/current-user";
import { dataBr } from "@/lib/rh-regras";
import { formatarCpf, soDigitos } from "@/lib/documento";
import { usePapelRh } from "@/lib/rh-store";
import {
  useColaboradores,
  SITUACAO_ESTILO,
  SITUACAO_LABEL,
  type Colaborador,
} from "@/lib/rh-colaboradores-store";

export const Route = createFileRoute("/app/colaboradores/")({ component: ListaColaboradores });

type FiltroSituacao = "ativos" | "desligados" | "todos";

function ListaColaboradores() {
  const papel = usePapelRh();
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const carregado = useColaboradores((s) => s.carregado);

  const [busca, setBusca] = useState("");
  const [fSituacao, setFSituacao] = useState<FiltroSituacao>("ativos");
  // null = fechado · "novo" = cadastro · Colaborador = edição
  const [form, setForm] = useState<Colaborador | "novo" | null>(null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigitos = soDigitos(q);
    return colaboradores
      .filter((c) => {
        // "Ativos" é quem não foi desligado — inclui experiência e
        // afastado, que continuam na casa.
        if (fSituacao === "ativos") return c.situacao !== "desligado";
        if (fSituacao === "desligados") return c.situacao === "desligado";
        return true;
      })
      .filter((c) => {
        if (!q) return true;
        if (qDigitos.length >= 3 && soDigitos(c.cpf).includes(qDigitos)) return true;
        return `${c.nome} ${c.matricula}`.toLowerCase().includes(q);
      });
  }, [colaboradores, busca, fSituacao]);

  return (
    <RhTela
      titulo="Colaboradores"
      resumo="O cadastro de quem trabalha na GRD. Quem sai não é excluído: muda a situação para Desligado."
      perfis={PERFIS_RH.colaboradores}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, CPF ou matrícula..."
              className="pl-9"
            />
          </div>
          <select
            value={fSituacao}
            onChange={(e) => setFSituacao(e.target.value as FiltroSituacao)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="ativos">Ativos</option>
            <option value="desligados">Desligados</option>
            <option value="todos">Todos</option>
          </select>
          {papel.editaRh && (
            <Button
              size="sm"
              onClick={() => setForm("novo")}
              className="bg-[#F37032] text-white hover:bg-[#ff8850]"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo colaborador
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
                  ? "Colaboradores entram quando uma admissão é concluída, pela importação da Secullum ou pelo botão Novo colaborador."
                  : "Limpe a busca ou troque o filtro de situação."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Admissão</TableHead>
                    {papel.editaRh && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.matricula || "—"}</TableCell>
                      <TableCell className="font-semibold text-[#213368]">{c.nome}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {c.cpf ? formatarCpf(c.cpf) : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{c.cargo || "—"}</TableCell>
                      <TableCell className="text-sm">{c.setor || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {c.telefone || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SITUACAO_ESTILO[c.situacao] ?? ""}`}
                        >
                          {SITUACAO_LABEL[c.situacao] ?? c.situacao}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{dataBr(c.dataAdmissao)}</TableCell>
                      {papel.editaRh && (
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setForm(c)}>
                            <Pencil className="mr-1 h-3.5 w-3.5 text-[#213368]" /> Editar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      {form && (
        <ColaboradorFormDialog
          // A key refaz o formulário ao trocar de pessoa sem fechar.
          key={form === "novo" ? "novo" : form.id}
          colaborador={form === "novo" ? null : form}
          onClose={() => setForm(null)}
        />
      )}
    </RhTela>
  );
}
