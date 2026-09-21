// ============================================================
// /app/epis/relatorio — Relatório de entregas por período
// ------------------------------------------------------------
// Gera um PDF para imprimir e assinar à caneta: UMA FOLHA POR
// COLABORADOR, com o que ele recebeu no período. Só leitura do que o
// epis-store já carrega (entregas + itens + funcionários) — nada é
// gravado. A foto de cada entrega continua sendo a assinatura do termo;
// este relatório é a conferência consolidada em papel.
//
// SELEÇÃO: guarda-se quem foi DESMARCADO, e não quem foi marcado. Assim
// "começa com todos marcados" continua valendo quando o período muda e
// entra gente nova na lista.
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { FileDown, Search, Loader2, CalendarDays } from "lucide-react";
import { useCurrentUser } from "@/lib/current-user";
import { useEpiStore, type Entrega, type EntregaItem } from "@/lib/epis-store";
import { dataBrParaIso, dataLocalBr, mascaraDataBr } from "@/components/epis/epis-formato";
import { gerarRelatorioEpiPDF, type ColaboradorRelatorioEpi } from "@/lib/relatorio-epi-pdf";

export const Route = createFileRoute("/app/epis/relatorio")({ component: AbaRelatorio });

const TODOS_SETORES = "__todos__";

function inicioDoMes(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Erro do campo de data, ou "" se está bom. */
function erroDaData(texto: string): string {
  if (!texto) return "Informe a data.";
  if (texto.length < 10) return "Use o formato DD/MM/AAAA.";
  if (!dataBrParaIso(texto)) return "Data inválida.";
  return "";
}

type Candidato = {
  id: string;
  nome: string;
  matricula: string;
  cpf: string;
  cargo: string;
  setor: string;
  itens: { item: EntregaItem; entrega: Entrega }[];
  totalItens: number;
};

function AbaRelatorio() {
  const user = useCurrentUser();
  const funcionarios = useEpiStore((s) => s.funcionarios);
  const entregas = useEpiStore((s) => s.entregas);
  const itens = useEpiStore((s) => s.itens);

  const hoje = new Date();
  const [de, setDe] = useState(dataLocalBr(inicioDoMes(hoje)));
  const [ate, setAte] = useState(dataLocalBr(hoje));
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState(TODOS_SETORES);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState(false);

  // ---------- Período ----------
  const erroDe = erroDaData(de);
  const erroAteCampo = erroDaData(ate);
  const deIso = erroDe ? null : dataBrParaIso(de);
  const ateIso = erroAteCampo ? null : dataBrParaIso(ate);
  const erroOrdem = deIso && ateIso && deIso > ateIso ? "“De” não pode ser depois de “Até”." : "";
  const erroAte = erroAteCampo || erroOrdem;
  const periodoValido = !!deIso && !!ateIso && !erroOrdem;

  const atalhoEsteMes = () => {
    const d = new Date();
    setDe(dataLocalBr(inicioDoMes(d)));
    setAte(dataLocalBr(d));
  };
  const atalhoMesPassado = () => {
    const d = new Date();
    setDe(dataLocalBr(new Date(d.getFullYear(), d.getMonth() - 1, 1)));
    // Dia 0 do mês atual = último dia do mês passado.
    setAte(dataLocalBr(new Date(d.getFullYear(), d.getMonth(), 0)));
  };

  // ---------- Quem teve entrega no período ----------
  const candidatos = useMemo<Candidato[]>(() => {
    if (!periodoValido || !deIso || !ateIso) return [];
    const itensPorEntrega = new Map<string, EntregaItem[]>();
    for (const i of itens) {
      const lista = itensPorEntrega.get(i.entregaId);
      if (lista) lista.push(i);
      else itensPorEntrega.set(i.entregaId, [i]);
    }
    const porFunc = new Map<string, Candidato>();
    for (const e of entregas) {
      const data = (e.dataEntrega || "").slice(0, 10);
      if (!data || data < deIso || data > ateIso) continue;
      const f = funcionarios.find((x) => x.id === e.funcionarioId);
      if (!f) continue;
      let c = porFunc.get(f.id);
      if (!c) {
        c = {
          id: f.id,
          nome: f.nome,
          matricula: f.matricula,
          cpf: f.cpf,
          cargo: f.cargo,
          setor: f.setor,
          itens: [],
          totalItens: 0,
        };
        porFunc.set(f.id, c);
      }
      for (const item of itensPorEntrega.get(e.id) ?? []) {
        c.itens.push({ item, entrega: e });
        c.totalItens += item.quantidade || 0;
      }
    }
    return [...porFunc.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [periodoValido, deIso, ateIso, entregas, itens, funcionarios]);

  const setores = useMemo(
    () =>
      [...new Set(candidatos.map((c) => c.setor.trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [candidatos],
  );

  // O setor LIMITA quem entra no relatório; a busca só estreita a lista
  // na tela (quem está marcado e fora da busca continua marcado).
  const elegiveis = useMemo(
    () =>
      setor === TODOS_SETORES ? candidatos : candidatos.filter((c) => c.setor.trim() === setor),
    [candidatos, setor],
  );
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return elegiveis;
    return elegiveis.filter((c) => `${c.nome} ${c.matricula}`.toLowerCase().includes(q));
  }, [elegiveis, busca]);

  const selecionados = elegiveis.filter((c) => !desmarcados.has(c.id));
  const totalItensSelecionados = selecionados.reduce((a, c) => a + c.totalItens, 0);

  const alternar = (id: string) =>
    setDesmarcados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  const marcarTodos = () =>
    setDesmarcados((prev) => {
      const prox = new Set(prev);
      visiveis.forEach((c) => prox.delete(c.id));
      return prox;
    });
  const desmarcarTodos = () =>
    setDesmarcados((prev) => {
      const prox = new Set(prev);
      visiveis.forEach((c) => prox.add(c.id));
      return prox;
    });

  // ---------- PDF ----------
  const gerar = async () => {
    if (!periodoValido || !deIso || !ateIso || selecionados.length === 0) return;
    setGerando(true);
    try {
      const colaboradores: ColaboradorRelatorioEpi[] = selecionados.map((c) => ({
        nome: c.nome,
        matricula: c.matricula,
        cpf: c.cpf,
        cargo: c.cargo,
        setor: c.setor,
        // Snapshot do item (nome, CA, unidade), não o catálogo de hoje.
        itens: c.itens
          .map(({ item, entrega }) => ({
            data: (item.dataEntrega || entrega.dataEntrega).slice(0, 10),
            termo: entrega.numeroTermo,
            epi: item.epiNome,
            ca: item.ca,
            quantidade: item.quantidade,
            unidade: item.unidade,
            motivo: item.motivo,
            validade: item.dataValidade,
          }))
          .sort((a, b) => a.data.localeCompare(b.data) || a.termo.localeCompare(b.termo)),
      }));
      await gerarRelatorioEpiPDF({ deIso, ateIso, colaboradores, geradoPor: user.nome });
      toast.success(
        `Relatório gerado: ${colaboradores.length} colaborador${colaboradores.length > 1 ? "es" : ""}.`,
      );
    } catch (err) {
      toast.error(
        `Não foi possível gerar o PDF: ${err instanceof Error ? err.message : "erro desconhecido"}`,
      );
    } finally {
      setGerando(false);
    }
  };

  const campoData = (
    id: string,
    rotulo: string,
    valor: string,
    set: (v: string) => void,
    erro: string,
  ) => (
    <div className="min-w-0">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="DD/MM/AAAA"
        maxLength={10}
        value={valor}
        onChange={(e) => set(mascaraDataBr(e.target.value))}
        aria-invalid={!!erro}
        className={erro ? "border-red-500 focus-visible:ring-red-500" : ""}
      />
      {erro && <p className="mt-1 text-xs font-medium text-red-600">{erro}</p>}
    </div>
  );

  return (
    <Card className="space-y-5 p-6">
      <div>
        <h3 className="text-lg font-bold text-[#213368]">Relatório de entregas por período</h3>
        <p className="text-xs text-muted-foreground">
          PDF para imprimir e assinar: uma folha por colaborador, com o que ele recebeu no período.
        </p>
      </div>

      {/* ---------- Período ---------- */}
      <div className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]">
        {campoData("rel-de", "De", de, setDe, erroDe)}
        {campoData("rel-ate", "Até", ate, setAte, erroAte)}
        <div className="flex flex-wrap gap-2 sm:pt-6">
          <Button type="button" variant="outline" size="sm" onClick={atalhoEsteMes}>
            <CalendarDays className="mr-1 h-4 w-4" /> Este mês
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={atalhoMesPassado}>
            Mês passado
          </Button>
        </div>
      </div>

      {/* ---------- Colaboradores ---------- */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou matrícula…"
              className="pl-9"
            />
          </div>
          <select
            value={setor}
            onChange={(e) => setSetor(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            aria-label="Filtrar por setor"
          >
            <option value={TODOS_SETORES}>Todos os setores</option>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={marcarTodos}
            disabled={!visiveis.length}
          >
            Marcar todos
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={desmarcarTodos}
            disabled={!visiveis.length}
          >
            Desmarcar todos
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-[#e6e6ea]">
          {!periodoValido ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Corrija o período para ver quem recebeu EPI.
            </p>
          ) : candidatos.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrega de EPI entre {de} e {ate}.
            </p>
          ) : visiveis.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Ninguém com esse nome, matrícula ou setor.
            </p>
          ) : (
            <ul className="divide-y">
              {visiveis.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[#F4F4F4]">
                    <Checkbox
                      checked={!desmarcados.has(c.id)}
                      onCheckedChange={() => alternar(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#213368]">
                        {c.nome}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.matricula && `Matrícula ${c.matricula}`, c.cargo, c.setor]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-[#F37032]">
                      {c.totalItens} {c.totalItens === 1 ? "item" : "itens"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ---------- Gerar ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm font-semibold text-[#213368]">
          {selecionados.length} colaborador{selecionados.length === 1 ? "" : "es"} selecionado
          {selecionados.length === 1 ? "" : "s"} · {totalItensSelecionados}{" "}
          {totalItensSelecionados === 1 ? "item" : "itens"}
        </p>
        <Button
          type="button"
          onClick={gerar}
          disabled={!periodoValido || selecionados.length === 0 || gerando}
          className="bg-[#F37032] text-white hover:bg-[#ff8850]"
        >
          {gerando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-1 h-4 w-4" />
          )}
          Gerar PDF para assinatura
        </Button>
      </div>
    </Card>
  );
}
