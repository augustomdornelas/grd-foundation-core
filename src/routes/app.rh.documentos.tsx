// ============================================================
// /app/rh/documentos — vencimentos de toda a equipe
// ------------------------------------------------------------
// É a tela que se abre quando o cliente industrial pede a documentação
// da equipe antes de liberar o crachá. Por isso ela filtra por obra e
// exporta CSV: o que sai daqui é o que vai anexado ao e-mail.
//
// A situação de cada documento vem de vw_rh_documentos_vencimento,
// recalculada na leitura — nunca da coluna `status`, que é cache.
// ============================================================
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Search, ShieldAlert } from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { DocumentosTabela } from "@/components/rh/DocumentosTabela";
import { PERFIS_RH } from "@/lib/current-user";
import { dataBr } from "@/lib/rh-regras";
import { useRhCatalogos } from "@/lib/rh-catalogos-store";
import { useRhStore, nomeDoProjeto } from "@/lib/rh-store";
import {
  useColaboradores,
  SITUACAO_DOC_LABEL,
  type DocumentoVencimento,
} from "@/lib/rh-colaboradores-store";

export const Route = createFileRoute("/app/rh/documentos")({ component: RhDocumentos });

const FILTROS_SITUACAO: { valor: string; rotulo: string }[] = [
  { valor: "atencao", rotulo: "Vencidos e a vencer (30 dias)" },
  { valor: "todos", rotulo: "Todos os documentos" },
  { valor: "vencido", rotulo: "Só vencidos" },
  { valor: "critico", rotulo: "Vencem em 7 dias" },
  { valor: "a_vencer", rotulo: "Vencem em 30 dias" },
  { valor: "valido", rotulo: "Válidos" },
  { valor: "sem_vencimento", rotulo: "Sem vencimento" },
];

function paraCsv(linhas: DocumentoVencimento[], obra: (id: string | null) => string): string {
  const cabecalho = [
    "Matrícula",
    "Colaborador",
    "Cargo",
    "Setor",
    "Obra",
    "Documento",
    "Categoria",
    "Número",
    "Emissão",
    "Vencimento",
    "Dias para vencer",
    "Situação",
    "Bloqueia alocação",
  ];
  // Ponto e vírgula e BOM porque o destino é o Excel em pt-BR: com
  // vírgula ele joga a linha inteira numa coluna só.
  const escapar = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const corpo = linhas.map((d) =>
    [
      d.matricula,
      d.funcionarioNome,
      d.cargo,
      d.setor,
      obra(d.projetoId),
      d.tipoNome,
      d.tipoCategoria,
      d.numero,
      dataBr(d.dataEmissao),
      dataBr(d.dataVencimento),
      d.diasParaVencer === null ? "" : String(d.diasParaVencer),
      SITUACAO_DOC_LABEL[d.situacaoDocumento] ?? d.situacaoDocumento,
      d.bloqueiaAlocacao ? "Sim" : "Não",
    ]
      .map(escapar)
      .join(";"),
  );
  return "﻿" + [cabecalho.map(escapar).join(";"), ...corpo].join("\r\n");
}

function RhDocumentos() {
  const estado = useRhStore((s) => s);
  const vencimentos = useColaboradores((s) => s.vencimentos);
  const carregado = useColaboradores((s) => s.carregado);
  const tipos = useRhCatalogos((s) => s.tiposDocumento);

  const [busca, setBusca] = useState("");
  const [fSituacao, setFSituacao] = useState("atencao");
  const [fObra, setFObra] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [soBloqueiam, setSoBloqueiam] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return vencimentos
      .filter((d) => {
        if (fSituacao === "todos") return true;
        if (fSituacao === "atencao") {
          return ["vencido", "critico", "a_vencer"].includes(d.situacaoDocumento);
        }
        return d.situacaoDocumento === fSituacao;
      })
      .filter((d) => (fObra ? d.projetoId === fObra : true))
      .filter((d) => (fTipo ? d.tipoDocumentoId === fTipo : true))
      .filter((d) => (soBloqueiam ? d.bloqueiaAlocacao : true))
      .filter(
        (d) =>
          !q ||
          `${d.funcionarioNome} ${d.matricula} ${d.cargo} ${d.tipoNome}`.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        // Vencido primeiro, depois o que vence antes. Sem vencimento por último.
        const peso = (d: DocumentoVencimento) =>
          d.situacaoDocumento === "vencido" ? -1_000_000 : (d.diasParaVencer ?? 1_000_000);
        return peso(a) - peso(b);
      });
  }, [vencimentos, busca, fSituacao, fObra, fTipo, soBloqueiam]);

  const vencidos = lista.filter((d) => d.situacaoDocumento === "vencido");
  const bloqueando = vencidos.filter((d) => d.bloqueiaAlocacao);

  function exportar() {
    const csv = paraCsv(lista, (id) => nomeDoProjeto(estado, id));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documentos-rh-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${lista.length} documentos exportados.`);
  }

  return (
    <RhTela
      titulo="Documentos e vencimentos"
      resumo="Todos os documentos de todos os colaboradores, com o semáforo de vencimento. É esta tela que se abre quando o cliente pede a documentação da equipe."
      perfis={PERFIS_RH.colaboradores}
    >
      <div className="space-y-4">
        {bloqueando.length > 0 && (
          <Card className="flex items-start gap-3 border-red-200 bg-red-50 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-bold text-red-800">
                {bloqueando.length}{" "}
                {bloqueando.length === 1
                  ? "documento vencido bloqueia"
                  : "documentos vencidos bloqueiam"}{" "}
                alocação em obra
              </p>
              <p className="text-xs text-red-700">
                ASO e as NRs exigidas pelo cargo derrubam a aptidão assim que vencem. Quem está
                nesta lista não entra em obra até renovar.
              </p>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Colaborador, matrícula, documento..."
              className="pl-9"
            />
          </div>
          <select
            value={fSituacao}
            onChange={(e) => setFSituacao(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {FILTROS_SITUACAO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.rotulo}
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
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Todo tipo de documento</option>
            {tipos
              .filter((t) => t.ativo)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            variant={soBloqueiam ? "default" : "outline"}
            onClick={() => setSoBloqueiam((v) => !v)}
            className={soBloqueiam ? "bg-[#213368] text-white hover:bg-[#2c4489]" : ""}
          >
            Só os que bloqueiam obra
          </Button>
          <Button size="sm" variant="outline" onClick={exportar} disabled={lista.length === 0}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar CSV
          </Button>
        </div>

        <Card className="overflow-hidden">
          {!carregado ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : (
            <DocumentosTabela
              documentos={lista}
              mostrarColaborador
              nomeDaObra={(id) => nomeDoProjeto(estado, id)}
              vazio={
                vencimentos.length === 0
                  ? "Nenhum documento cadastrado ainda. Eles entram pela ficha do colaborador ou migram do checklist quando uma admissão é concluída."
                  : "Nada com esses filtros — o que costuma ser boa notícia."
              }
            />
          )}
        </Card>

        {lista.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {lista.length} {lista.length === 1 ? "documento" : "documentos"} · {vencidos.length}{" "}
            {vencidos.length === 1 ? "vencido" : "vencidos"} · situação recalculada agora, na
            leitura da view.
          </p>
        )}
      </div>
    </RhTela>
  );
}
