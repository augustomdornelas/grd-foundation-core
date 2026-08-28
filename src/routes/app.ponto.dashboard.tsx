// ============================================================
// /app/ponto/dashboard — o painel de ponto
// ------------------------------------------------------------
// A REGRA QUE NÃO MUDA: esta tela NUNCA chama a API da Secullum no
// carregamento. Lê `ponto_batidas`, `ponto_totais`,
// `secullum_funcionarios`, `secullum_afastamentos`,
// `secullum_pendencias` e `secullum_horarios` — as tabelas locais que
// os jobs alimentam de madrugada. A API tem teto de requisições por
// hora; um dashboard que a consultasse a cada F5 gastaria a cota do
// dia em meia manhã e derrubaria o sync junto.
//
// O preço disso é o dado ser de ontem, e o preço tem que aparecer: o
// carimbo no topo diz de quando é, em cor de alerta depois de 36h.
// Dado velho sem aviso é pior que tela vazia.
//
// ORGANIZAÇÃO
// A faixa de HOJE abre a tela e fica FORA das abas: é a pergunta que
// se faz de manhã, e não merece um clique. As seis abas analíticas são
// retrospectivas.
//
// Uma busca só, no carregamento, e todas as abas calculam em cima do
// mesmo pacote em memória. Trocar de aba não vai ao banco — o que
// importa porque são treze meses de batidas, e refazer a consulta a
// cada clique tornaria a tela desagradável de usar.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RefreshCw, Clock, ShieldAlert } from "lucide-react";
import { PontoTela } from "@/components/ponto/PontoTela";
import { FaixaHoje } from "@/components/ponto/FaixaHoje";
import {
  AbaEquipe,
  AbaRotatividade,
  AbaHoras,
  AbaAbsenteismo,
  AbaQualidade,
  AbaDivergencias,
} from "@/components/ponto/abas-ponto";
import { usePaleta } from "@/components/ponto/graficos";
import { PERFIS_PONTO, useHasPermission } from "@/lib/current-user";
import {
  buscarDadosPonto,
  competenciaDe,
  hojeLocal,
  DADOS_VAZIOS,
  type DadosPonto,
} from "@/lib/ponto-dados";
import {
  calcularHoje,
  calcularEquipe,
  calcularRotatividade,
  calcularHoras,
  calcularAbsenteismo,
  calcularQualidade,
  calcularDivergencias,
  opcoesDeFiltro,
  rotuloDeCompetencia,
  TODAS,
  type FiltroPonto,
} from "@/lib/ponto-metricas";

export const Route = createFileRoute("/app/ponto/dashboard")({
  ssr: false,
  component: DashboardPonto,
});

function DashboardPonto() {
  return (
    <PontoTela
      titulo="Dashboard de Ponto"
      resumo="Quem trabalhou, quem faltou e quanto se gastou em hora extra. Tudo lido das tabelas locais que os jobs alimentam — esta tela nunca consulta a Secullum ao vivo."
      perfis={PERFIS_PONTO.dashboard}
    >
      <Painel />
    </PontoTela>
  );
}

function Painel() {
  const hoje = useMemo(() => hojeLocal(), []);
  const [dados, setDados] = useState<DadosPonto>(DADOS_VAZIOS);
  const [carregando, setCarregando] = useState(true);
  const podeVerCusto = useHasPermission("rh_remuneracao");

  const [filtro, setFiltro] = useState<FiltroPonto>({
    competencia: competenciaDe(hoje),
    obra: TODAS,
    funcao: TODAS,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    setDados(await buscarDadosPonto(hoje));
    setCarregando(false);
  }, [hoje]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const opcoes = useMemo(() => opcoesDeFiltro(dados), [dados]);

  // A paleta nasce do universo INTEIRO de obras e funções, antes de
  // qualquer filtro. É isso que faz a cor seguir a entidade: escolher
  // uma obra esconde barras, não repinta as que ficaram.
  const paleta = usePaleta(useMemo(() => [...opcoes.obras, ...opcoes.funcoes], [opcoes]));

  // ---------- as contas ----------
  const metricas = useMemo(
    () => ({
      hoje: calcularHoje(dados, filtro, hoje),
      equipe: calcularEquipe(dados, filtro, hoje),
      rotatividade: calcularRotatividade(dados, filtro, hoje),
      horas: calcularHoras(dados, filtro),
      absenteismo: calcularAbsenteismo(dados, filtro, hoje),
      qualidade: calcularQualidade(dados, filtro),
      divergencias: calcularDivergencias(dados, filtro, hoje),
    }),
    [dados, filtro, hoje],
  );

  // Competências: as que têm total calculado, mais a do mês corrente —
  // que costuma ainda não ter, e sem ela o filtro abriria vazio.
  const competencias = useMemo(() => {
    const atual = competenciaDe(hoje);
    return [...new Set([atual, ...opcoes.competencias])].sort((a, b) => b.localeCompare(a));
  }, [opcoes.competencias, hoje]);

  if (carregando) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (dados.erro) {
    return (
      <Card className="border-red-200 bg-red-50 p-5">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">Não foi possível ler os dados de ponto</p>
            <p className="mt-1 text-sm text-red-800">{dados.erro}</p>
            <p className="mt-2 text-xs text-red-800">
              Se a mensagem fala em permissão, é a RLS: as tabelas de ponto exigem
              <code className="mx-1 rounded bg-red-100 px-1">rh_pode_ler()</code>. Se fala em
              relação inexistente, a migration do dashboard ainda não foi aplicada.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void carregar()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Tentar de novo
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        <CarimboDeFrescor dados={dados} aoAtualizar={() => void carregar()} />

        {/* ---------- Filtros, numa linha só ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filtro.competencia}
            onValueChange={(v) => setFiltro((f) => ({ ...f, competencia: v }))}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Competência" />
            </SelectTrigger>
            <SelectContent>
              {competencias.map((c) => (
                <SelectItem key={c} value={c}>
                  {rotuloDeCompetencia(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtro.obra || "__todas__"}
            onValueChange={(v) => setFiltro((f) => ({ ...f, obra: v === "__todas__" ? TODAS : v }))}
          >
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="Obra" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas as obras</SelectItem>
              {opcoes.obras.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filtro.funcao || "__todas__"}
            onValueChange={(v) =>
              setFiltro((f) => ({ ...f, funcao: v === "__todas__" ? TODAS : v }))
            }
          >
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue placeholder="Função" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todas__">Todas as funções</SelectItem>
              {opcoes.funcoes.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(filtro.obra !== TODAS || filtro.funcao !== TODAS) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => setFiltro((f) => ({ ...f, obra: TODAS, funcao: TODAS }))}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {/* ---------- HOJE, fora das abas ---------- */}
        <FaixaHoje hoje={metricas.hoje} paleta={paleta} />

        {/* ---------- As seis abas ---------- */}
        <Tabs defaultValue="equipe">
          <TabsList className="w-full flex-wrap">
            <TabsTrigger value="equipe" className="flex-1">
              Equipe
            </TabsTrigger>
            <TabsTrigger value="rotatividade" className="flex-1">
              Rotatividade
            </TabsTrigger>
            <TabsTrigger value="horas" className="flex-1">
              Horas e extras
            </TabsTrigger>
            <TabsTrigger value="absenteismo" className="flex-1">
              Absenteísmo
            </TabsTrigger>
            <TabsTrigger value="qualidade" className="flex-1">
              Qualidade
            </TabsTrigger>
            <TabsTrigger value="divergencias" className="flex-1">
              Divergências
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equipe" className="mt-4">
            <AbaEquipe equipe={metricas.equipe} paleta={paleta} />
          </TabsContent>
          <TabsContent value="rotatividade" className="mt-4">
            <AbaRotatividade rot={metricas.rotatividade} paleta={paleta} />
          </TabsContent>
          <TabsContent value="horas" className="mt-4">
            <AbaHoras horas={metricas.horas} paleta={paleta} podeVerCusto={podeVerCusto} />
          </TabsContent>
          <TabsContent value="absenteismo" className="mt-4">
            <AbaAbsenteismo abs={metricas.absenteismo} paleta={paleta} />
          </TabsContent>
          <TabsContent value="qualidade" className="mt-4">
            <AbaQualidade qual={metricas.qualidade} paleta={paleta} />
          </TabsContent>
          <TabsContent value="divergencias" className="mt-4">
            <AbaDivergencias div={metricas.divergencias} />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

// ------------------------------------------------------------
// O carimbo de idade do dado
// ------------------------------------------------------------
/**
 * "Dados de 28/08 às 05h12" — discreto, no topo, em cor de alerta
 * depois de 36h.
 *
 * A idade vem calculada do banco (`vw_secullum_frescor`) e não do
 * relógio do navegador: numa obra, a máquina de quem olha tem a hora
 * errada com frequência, e o carimbo é justamente o que não pode
 * mentir.
 *
 * 36h é "um job diário que perdeu duas janelas" — não é um número
 * bonito, é o ponto a partir do qual o dado deixou de ser de ontem.
 */
function CarimboDeFrescor({ dados, aoAtualizar }: { dados: DadosPonto; aoAtualizar: () => void }) {
  // O mais VELHO entre os jobs manda: o dashboard é tão fresco quanto a
  // sua pior fonte, e mostrar o mais recente esconderia o que travou.
  const comData = dados.frescor.filter((f) => f.ultimaConclusao);
  const maisVelho = comData.reduce<(typeof comData)[number] | null>(
    (pior, f) => (!pior || (f.horasDesde ?? 0) > (pior.horasDesde ?? 0) ? f : pior),
    null,
  );
  const nuncaRodaram = dados.frescor.filter((f) => !f.ultimaConclusao).map((f) => f.tipo);
  const atrasado = maisVelho?.atrasado ?? true;

  const quando = maisVelho?.ultimaConclusao
    ? new Date(maisVelho.ultimaConclusao).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-xs ${
        atrasado
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-transparent bg-muted/50 text-muted-foreground"
      }`}
    >
      <span className="flex items-center gap-1.5">
        {atrasado ? (
          <Clock className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 opacity-60" />
        )}
        {quando ? (
          <>
            Dados de <strong className="font-semibold">{quando}</strong>
            {maisVelho?.horasDesde !== null && maisVelho?.horasDesde !== undefined && (
              <> · há {Math.round(maisVelho.horasDesde)}h</>
            )}
          </>
        ) : (
          "Nenhum job de sincronização concluiu com sucesso até agora."
        )}
      </span>

      {atrasado && quando && (
        <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-900">
          mais de 36h
        </Badge>
      )}

      {nuncaRodaram.length > 0 && (
        <span className="opacity-90">
          Nunca rodaram: <strong>{nuncaRodaram.join(", ")}</strong>
        </span>
      )}

      <button
        type="button"
        onClick={aoAtualizar}
        className="ml-auto flex items-center gap-1 hover:underline"
      >
        <RefreshCw className="h-3 w-3" />
        Reler do banco
      </button>
    </div>
  );
}
