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
import { RefreshCw, Clock, ShieldAlert, DatabaseZap, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
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
import { PERFIS_PONTO, useCurrentUser, useHasPermission } from "@/lib/current-user";
import { sincronizarPonto, type TipoJob } from "@/lib/ponto-sync-client";
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
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const podeVerCusto = useHasPermission("rh_remuneracao");

  // Quem dispara job é quem edita RH. A checagem aqui é só para não
  // mostrar um botão que o servidor vai recusar — quem decide de
  // verdade é o servidor, que confere o perfil de novo.
  const perfil = useCurrentUser().perfil.toLowerCase();
  const podeSincronizar = ["administrador", "admin", "diretoria", "rh"].includes(perfil);

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

  const sincronizar = useCallback(async () => {
    setSincronizando("iniciando");
    const { resultados, erroDeSessao } = await sincronizarPonto(undefined, (tipo: TipoJob) =>
      setSincronizando(tipo),
    );
    setSincronizando(null);

    if (erroDeSessao) {
      toast.error(erroDeSessao);
      return;
    }

    const bons = resultados.filter((r) => r.ok);
    const ruins = resultados.filter((r) => !r.ok);
    const registros = bons.reduce((soma, r) => soma + r.registros, 0);

    if (bons.length > 0) {
      toast.success(
        `${bons.length} de ${resultados.length} job(s) concluído(s) · ${registros} registro(s).`,
      );
    }
    // Cada falha com o nome do job: "a sincronização falhou" sozinho não
    // diz se o problema é o cadastro ou só o endpoint de batidas, que
    // nunca foi confirmado contra a conta da GRD.
    for (const r of ruins) {
      toast.error(`${r.tipo}: ${r.erro ?? "falhou sem mensagem"}`);
    }

    await carregar();
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

  // ORDEM DOS ESTADOS, e ela importa:
  //   1. tabela faltando  -> instalação pendente, não é falha
  //   2. erro de verdade  -> cartão vermelho
  //   3. tudo vazio       -> os jobs ainda não rodaram
  // Trocar 1 por 2 foi o bug relatado: "Could not find the table" virava
  // tela vermelha, quando na verdade faltava rodar o SQL.
  if (dados.fontesAusentesEssenciais.length > 0) {
    return (
      <div className="space-y-4">
        <CarimboDeFrescor dados={dados} aoAtualizar={() => void carregar()} />
        <EstadoDeInstalacao
          ausentes={dados.fontesAusentesEssenciais}
          aoRecarregar={() => void carregar()}
        />
      </div>
    );
  }

  const semNenhumDado =
    dados.funcionarios.length === 0 && dados.batidas.length === 0 && dados.totais.length === 0;

  if (!dados.erro && semNenhumDado) {
    return (
      <div className="space-y-4">
        <CarimboDeFrescor dados={dados} aoAtualizar={() => void carregar()} />
        <EstadoSemSincronizacao
          podeSincronizar={podeSincronizar}
          sincronizando={sincronizando}
          aoSincronizar={() => void sincronizar()}
        />
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
              As tabelas existem — tabela faltando tem tela própria. Se a mensagem fala em
              permissão, é a RLS: a leitura exige
              <code className="mx-1 rounded bg-red-100 px-1">rh_pode_ler()</code>, ou o vínculo de
              obra em <code className="mx-1 rounded bg-red-100 px-1">rh_usuario_projetos</code> se o
              seu perfil for de engenharia.
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

        {dados.fontesAusentes.length > 0 && (
          <AvisoFontesOpcionais ausentes={dados.fontesAusentes} />
        )}

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

          {podeSincronizar && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-9"
              disabled={sincronizando !== null}
              onClick={() => void sincronizar()}
            >
              {sincronizando ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {sincronizando === "iniciando"
                    ? "Iniciando..."
                    : `Sincronizando ${sincronizando}...`}
                </>
              ) : (
                <>
                  <DatabaseZap className="mr-1.5 h-3.5 w-3.5" />
                  Sincronizar agora
                </>
              )}
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
// Estado 1: o banco ainda não tem as tabelas
// ------------------------------------------------------------
/**
 * Não é erro, é instalação pendente — e a tela trata como tal.
 *
 * O sintoma que gerou isto foi "Could not find the table
 * 'public.secullum_funcionarios' in the schema cache" aparecendo como
 * cartão vermelho de falha. Vermelho manda procurar o que quebrou;
 * aqui não quebrou nada, falta rodar um SQL. A tela diz exatamente
 * qual arquivo e o que ele cria.
 *
 * Não há botão de sincronizar aqui de propósito: sem tabela, o job
 * não teria onde gravar, e oferecer o botão só produziria um segundo
 * erro em cima do primeiro.
 */
function EstadoDeInstalacao({
  ausentes,
  aoRecarregar,
}: {
  ausentes: string[];
  aoRecarregar: () => void;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50 p-5 sm:p-6">
      <div className="flex gap-3">
        <DatabaseZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-900">O banco ainda não tem as tabelas de ponto</p>
          <p className="mt-1 max-w-3xl text-sm text-amber-800">
            O dashboard lê só tabelas locais, e {ausentes.length === 1 ? "uma delas" : "algumas"}{" "}
            ainda não {ausentes.length === 1 ? "existe" : "existem"} neste banco. Não há o que
            consertar no código — falta rodar o SQL de instalação uma vez.
          </p>

          <ol className="mt-3 max-w-3xl list-decimal space-y-1.5 pl-5 text-sm text-amber-800">
            <li>
              Abra o <strong>SQL Editor</strong> do Supabase.
            </li>
            <li>
              Cole o conteúdo de{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">
                supabase/manual/ponto-dashboard-completo.sql
              </code>{" "}
              e rode. Ele é idempotente: pode rodar de novo sem estragar nada.
            </li>
            <li>Volte aqui e recarregue.</li>
          </ol>

          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-amber-900">
            Faltando ({ausentes.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ausentes.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="border-amber-400 font-mono text-[11px] text-amber-900"
              >
                {t}
              </Badge>
            ))}
          </div>

          <Button variant="outline" size="sm" className="mt-4" onClick={aoRecarregar}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Já rodei o SQL — verificar de novo
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// Aviso: falta uma tabela do lado Portal
// ------------------------------------------------------------
/**
 * Discreto e específico. O dashboard funciona sem estas; o que a tela
 * não pode fazer é mostrar coluna vazia sem dizer por quê — quem olha
 * um telefone em branco conclui que o cadastro está incompleto, e não
 * que a tabela não existe.
 */
function AvisoFontesOpcionais({ ausentes }: { ausentes: string[] }) {
  const perdas: Record<string, string> = {
    funcionarios: "telefone na lista de faltantes e a conciliação por CPF",
    rh_funcionario_documentos: "o alerta de ASO e NR vencidos",
    rh_funcionario_remuneracao: "o custo estimado da hora extra",
  };

  return (
    <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-[#213368]">Parte do lado Portal não está no banco.</span>{" "}
      Sem {ausentes.map((t) => perdas[t] ?? t).join("; sem ")}. O resto do dashboard não depende
      disso.
    </div>
  );
}

// ------------------------------------------------------------
// Estado 2: as tabelas existem e estão vazias
// ------------------------------------------------------------
/**
 * Tabela vazia não é zero: é "os jobs ainda não rodaram".
 *
 * A diferença aparece na tela porque as duas levam a ações opostas —
 * zero manda investigar por que ninguém bateu ponto, vazio manda
 * apertar o botão.
 */
function EstadoSemSincronizacao({
  podeSincronizar,
  sincronizando,
  aoSincronizar,
}: {
  podeSincronizar: boolean;
  sincronizando: string | null;
  aoSincronizar: () => void;
}) {
  return (
    <Card className="p-6 sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#213368]/10">
          <DatabaseZap className="h-5 w-5 text-[#213368]" />
        </div>
        <h3 className="text-base font-bold text-[#213368]">
          As tabelas existem, mas ainda estão vazias
        </h3>
        <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
          Nenhum job de sincronização gravou nada até agora. Isto não quer dizer que ninguém bateu
          ponto — quer dizer que os dados da Secullum ainda não foram trazidos para cá.
        </p>

        {podeSincronizar ? (
          <>
            <Button className="mt-5" disabled={sincronizando !== null} onClick={aoSincronizar}>
              {sincronizando ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {sincronizando === "iniciando"
                    ? "Iniciando..."
                    : `Sincronizando ${sincronizando}...`}
                </>
              ) : (
                <>
                  <DatabaseZap className="mr-2 h-4 w-4" />
                  Sincronizar agora
                </>
              )}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Roda cadastro, catálogos, afastamentos, pendências, batidas e totais — nesta ordem, um
              de cada vez. A API da Secullum tem teto de requisições por hora, e disparar tudo junto
              é a forma mais rápida de bater nele.
            </p>
          </>
        ) : (
          <p className="mt-5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Peça à Diretoria ou ao RH para rodar a primeira sincronização.
          </p>
        )}
      </div>
    </Card>
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
