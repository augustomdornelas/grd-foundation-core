// ============================================================
// /app/rh — painel do RH
// ------------------------------------------------------------
// Os números são consultados na hora, sem cache: quem abre esta tela
// quer saber como está agora.
//
// Aptidão e vencimento vêm das views vw_rh_alocacao e
// vw_rh_documentos_vencimento, que recalculam a cada leitura. Enquanto
// as telas de admissão e colaboradores não existirem (Etapa 3), é
// normal que quase todo mundo apareça como inapto: ninguém tem ASO nem
// NR cadastrados ainda. O painel diz isso em vez de esconder.
// ============================================================
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  Users,
  ClipboardCheck,
  FileWarning,
  HardHat,
  Timer,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { RhTela } from "@/components/rh/RhTela";
import { SemaforoEtapa } from "@/components/rh/SemaforoEtapa";
import { CandidatoFicha } from "@/components/rh/CandidatoFicha";
import { PERFIS_RH } from "@/lib/current-user";
import { supabase } from "@/integrations/supabase/client";
import { dataBr, diasCorridosDesde } from "@/lib/rh-regras";
import { useRhStore, nomeDoProjeto, type FunilItem } from "@/lib/rh-store";

export const Route = createFileRoute("/app/rh/")({ component: PainelRh });

type DocVencendo = {
  documento_id: string;
  funcionario_nome: string;
  tipo_nome: string;
  data_vencimento: string | null;
  dias_para_vencer: number | null;
  situacao_documento: string;
  bloqueia_alocacao: boolean;
};

type Inapto = {
  funcionario_id: string;
  nome: string;
  cargo: string;
  projeto_id: string | null;
  pendencias: string[] | null;
};

function Numero({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  icone: typeof Briefcase;
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  destaque?: "alerta" | "critico";
}) {
  const cor =
    destaque === "critico"
      ? "text-red-600"
      : destaque === "alerta"
        ? "text-amber-600"
        : "text-[#213368]";
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#213368]/10">
          <Icone className="h-4 w-4 text-[#213368]" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{rotulo}</p>
          <p className={`text-2xl font-bold leading-tight ${cor}`}>{valor}</p>
          {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
        </div>
      </div>
    </Card>
  );
}

function PainelRh() {
  const estado = useRhStore((s) => s);
  const carregado = useRhStore((s) => s.carregado);

  const [admissoesAbertas, setAdmissoesAbertas] = useState<number | null>(null);
  const [docs, setDocs] = useState<DocVencendo[]>([]);
  const [inaptos, setInaptos] = useState<Inapto[]>([]);
  const [headcount, setHeadcount] = useState<number | null>(null);
  const [ficha, setFicha] = useState<FunilItem | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [adm, dv, al, hc] = await Promise.all([
        supabase
          .from("rh_admissoes")
          .select("id", { count: "exact", head: true })
          .not("status", "in", "(concluida,cancelada)"),
        supabase
          .from("vw_rh_documentos_vencimento")
          .select("*")
          .lte("dias_para_vencer", 30)
          .order("dias_para_vencer", { ascending: true }),
        supabase.from("vw_rh_alocacao").select("*").eq("apto", false),
        supabase
          .from("funcionarios")
          .select("id", { count: "exact", head: true })
          .eq("ativo", true)
          .neq("situacao", "desligado"),
      ]);
      if (!vivo) return;
      setAdmissoesAbertas(adm.count ?? 0);
      setDocs((dv.data ?? []) as DocVencendo[]);
      setInaptos((al.data ?? []) as Inapto[]);
      setHeadcount(hc.count ?? 0);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const vagasAbertas = estado.vagas.filter(
    (v) => v.ativo && !["encerrada", "cancelada", "rascunho"].includes(v.status),
  );
  const emProcesso = estado.funil.filter((f) => f.status === "em_andamento");
  const parados = emProcesso
    .filter((f) => f.semaforo !== "neutro")
    .sort((a, b) => b.diasNaEtapa - a.diasNaEtapa);
  const vencidos = docs.filter((d) => d.situacao_documento === "vencido");

  /** Média de dias entre abrir e encerrar, só das vagas que já fecharam. */
  const tempoMedio = useMemo(() => {
    const fechadas = estado.vagas.filter((v) => v.dataEncerramento && v.dataAbertura);
    if (fechadas.length === 0) return null;
    const soma = fechadas.reduce((acc, v) => {
      const abertura = new Date(`${v.dataAbertura}T00:00:00`).getTime();
      const fim = new Date(`${v.dataEncerramento}T00:00:00`).getTime();
      return acc + Math.max(0, Math.round((fim - abertura) / 86_400_000));
    }, 0);
    return Math.round(soma / fechadas.length);
  }, [estado.vagas]);

  return (
    <RhTela
      titulo="Painel de RH"
      resumo="Vagas abertas, quem está em processo, o que está parado e o que vence nos próximos 30 dias."
      perfis={PERFIS_RH.painel}
    >
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Numero
            icone={Briefcase}
            rotulo="Vagas abertas"
            valor={carregado ? vagasAbertas.length : "—"}
            detalhe={`${vagasAbertas.filter((v) => v.publicadaSite).length} no site`}
          />
          <Numero
            icone={Users}
            rotulo="Candidatos em processo"
            valor={carregado ? emProcesso.length : "—"}
            detalhe={parados.length > 0 ? `${parados.length} parados` : "nenhum parado"}
            destaque={parados.length > 0 ? "alerta" : undefined}
          />
          <Numero
            icone={ClipboardCheck}
            rotulo="Admissões em andamento"
            valor={admissoesAbertas ?? "—"}
          />
          <Numero
            icone={FileWarning}
            rotulo="Documentos vencendo em 30 dias"
            valor={docs.length}
            detalhe={vencidos.length > 0 ? `${vencidos.length} já vencidos` : undefined}
            destaque={vencidos.length > 0 ? "critico" : docs.length > 0 ? "alerta" : undefined}
          />
          <Numero icone={HardHat} rotulo="Colaboradores ativos" valor={headcount ?? "—"} />
          <Numero
            icone={Timer}
            rotulo="Tempo médio para fechar vaga"
            valor={tempoMedio === null ? "—" : `${tempoMedio}d`}
            detalhe={
              tempoMedio === null ? "nenhuma vaga fechada ainda" : "da abertura ao encerramento"
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* ---------- Candidaturas paradas ---------- */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#213368]">Candidaturas paradas</h3>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link to="/app/rh/selecao">
                  Abrir funil <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
            {!carregado ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : parados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ninguém parado além do prazo.{" "}
                {emProcesso.length === 0 ? "O funil está vazio." : "Funil em dia."}
              </p>
            ) : (
              <ul className="divide-y">
                {parados.slice(0, 8).map((f) => (
                  <li key={f.candidaturaId}>
                    <button
                      onClick={() => setFicha(f)}
                      className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#213368]">
                          {f.candidatoNome}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {f.etapaNome} · {f.vagaCodigo} · {nomeDoProjeto(estado, f.projetoId)}
                        </p>
                      </div>
                      <SemaforoEtapa
                        dias={f.diasNaEtapa}
                        semaforo={f.semaforo}
                        slaDias={f.slaDias}
                      />
                    </button>
                  </li>
                ))}
                {parados.length > 8 && (
                  <li className="pt-2 text-xs text-muted-foreground">
                    e mais {parados.length - 8}.
                  </li>
                )}
              </ul>
            )}
          </Card>

          {/* ---------- Documentos vencendo ---------- */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#213368]">Documentos vencendo</h3>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link to="/app/rh/documentos">
                  Ver todos <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
            {docs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nada vencendo nos próximos 30 dias.
              </p>
            ) : (
              <ul className="divide-y">
                {docs.slice(0, 8).map((d) => (
                  <li key={d.documento_id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#213368]">
                        {d.funcionario_nome}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.tipo_nome} · vence {dataBr(d.data_vencimento)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        d.situacao_documento === "vencido"
                          ? "bg-red-100 text-red-700"
                          : d.situacao_documento === "critico"
                            ? "bg-red-50 text-red-600"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {d.situacao_documento === "vencido" ? "vencido" : `${d.dias_para_vencer}d`}
                    </span>
                  </li>
                ))}
                {docs.length > 8 && (
                  <li className="pt-2 text-xs text-muted-foreground">e mais {docs.length - 8}.</li>
                )}
              </ul>
            )}
          </Card>
        </div>

        {/* ---------- Inaptos para alocação ---------- */}
        <Card className="p-4">
          <div className="mb-1 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[#F37032]" />
            <h3 className="text-sm font-bold text-[#213368]">
              Colaboradores que não podem ser alocados
            </h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Regra 8: sem ASO válido, sem as NRs que o cargo exige e sem EPI entregue com termo
            assinado, o sistema não deixa alocar em obra. Enquanto os documentos não forem
            cadastrados na Etapa 3, é esperado que apareça muita gente aqui — a lista mostra
            exatamente o que falta em cada um.
          </p>
          {inaptos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Todo mundo apto — ou ainda não há colaborador cadastrado.
            </p>
          ) : (
            <ul className="divide-y">
              {inaptos.slice(0, 10).map((f) => (
                <li key={f.funcionario_id} className="py-2">
                  <p className="text-sm font-medium text-[#213368]">
                    {f.nome}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {f.cargo || "sem cargo"}
                    </span>
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(f.pendencias ?? []).map((p) => (
                      <span
                        key={p}
                        className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              {inaptos.length > 10 && (
                <li className="pt-2 text-xs text-muted-foreground">
                  e mais {inaptos.length - 10}.
                </li>
              )}
            </ul>
          )}
        </Card>

        {carregado && estado.vagas.length === 0 && (
          <Card className="px-6 py-10 text-center">
            <h3 className="text-base font-bold text-[#213368]">O módulo está no ar e vazio</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              Comece abrindo uma vaga. Ela nasce como rascunho, vai para a Diretoria aprovar e
              depois pode ser publicada no site.
            </p>
            <Button asChild className="mt-4 bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Link to="/app/rh/vagas">Abrir a primeira vaga</Link>
            </Button>
          </Card>
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
