// ============================================================
// Gráficos do dashboard de Ponto
// ------------------------------------------------------------
// As regras que valem para TODOS os gráficos desta tela moram aqui, e
// não espalhadas em cada `<BarChart>`. É o que impede a terceira aba
// de inventar uma variação da segunda.
//
// A COR SEGUE A ENTIDADE, NUNCA A POSIÇÃO
// Este é o ponto que mais dá errado. Se a cor vier do índice do array,
// filtrar uma obra repinta todas as outras: a barra que era azul vira
// laranja, e quem estava comparando duas telas conclui que os números
// trocaram de lugar. `criarPaleta()` recebe o universo INTEIRO de
// chaves, antes de qualquer filtro, e devolve um mapa estável. Filtrar
// esconde barras; não remexe cores.
//
// O QUE É PROIBIDO, E POR QUÊ
//   - dois eixos Y: as duas escalas são arbitrárias e o cruzamento das
//     séries vira uma correlação que não existe. Turnover fica em
//     gráfico separado das barras de admissão e demissão.
//   - pizza com mais de 3 fatias: ninguém compara ângulos parecidos.
//   - arco-íris como escala, 3D, número em todo ponto.
// ============================================================
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as TooltipRecharts,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Table2, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ------------------------------------------------------------
// A paleta
// ------------------------------------------------------------
export const PALETA_CLARA = [
  "#2F5BB7",
  "#E8621A",
  "#1F8A70",
  "#8E5BC9",
  "#B8892B",
  "#B03A5B",
] as const;

export const PALETA_ESCURA = [
  "#5384D8",
  "#D96E22",
  "#2AA48B",
  "#A278CE",
  "#B8891F",
  "#D76980",
] as const;

/** Cinza para a categoria "Outros": ela é resto, não é uma entidade. */
const COR_OUTROS_CLARA = "#8A8F98";
const COR_OUTROS_ESCURA = "#9AA0A8";

/**
 * Segue a classe `.dark` do documento, que é como o Tailwind deste
 * projeto define o tema. Fica em hook e não em constante porque o tema
 * pode mudar com a tela aberta, e um gráfico com a cor do tema
 * anterior fica ilegível.
 */
export function useTemaEscuro(): boolean {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const ler = () => setEscuro(document.documentElement.classList.contains("dark"));
    ler();
    const observador = new MutationObserver(ler);
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observador.disconnect();
  }, []);

  return escuro;
}

export type Paleta = {
  /** Cor estável de uma entidade. Fora do universo conhecido, cinza. */
  cor: (chave: string) => string;
  /** Cor por posição, para séries fixas (categorias de hora, por exemplo). */
  serie: (indice: number) => string;
  eixo: string;
  grade: string;
  fundo: string;
};

/**
 * Constrói a paleta a partir do universo de chaves.
 *
 * `chaves` deve ser a lista COMPLETA e ordenada de forma determinística
 * — todas as obras, todas as funções — e não só as que aparecem depois
 * do filtro. É essa lista que trava a cor de cada entidade.
 */
export function usePaleta(chaves: string[]): Paleta {
  const escuro = useTemaEscuro();

  return useMemo(() => {
    const cores = escuro ? PALETA_ESCURA : PALETA_CLARA;
    const corOutros = escuro ? COR_OUTROS_ESCURA : COR_OUTROS_CLARA;

    const ordenadas = [...new Set(chaves)].sort((a, b) => a.localeCompare(b, "pt-BR"));
    const indice = new Map(ordenadas.map((c, i) => [c, i]));

    return {
      cor: (chave: string) => {
        if (chave === "Outros" || chave === "Não informada" || chave === "Não informado") {
          return corOutros;
        }
        const i = indice.get(chave);
        return i === undefined ? corOutros : cores[i % cores.length];
      },
      serie: (i: number) => cores[i % cores.length],
      eixo: escuro ? "#9AA0A8" : "#6B7280",
      grade: escuro ? "#FFFFFF14" : "#0000000F",
      fundo: escuro ? "#0B0E14" : "#FFFFFF",
    };
  }, [chaves, escuro]);
}

// ------------------------------------------------------------
// A casca de todo gráfico
// ------------------------------------------------------------
export type ColunaTabela = { chave: string; rotulo: string; alinharDireita?: boolean };

/**
 * Card com título, definição e alternância gráfico/tabela.
 *
 * A tabela não é enfeite de acessibilidade: é o que permite conferir um
 * número que parece errado sem exportar nada. Todo gráfico da tela tem
 * a dela.
 *
 * `definicao` vira tooltip no título. Métrica de RH quase sempre tem
 * uma definição discutível — "trabalhando agora", turnover,
 * absenteísmo — e escrever qual foi usada é o que evita dois painéis
 * discordando sem ninguém saber por quê.
 */
export function Painel({
  titulo,
  definicao,
  resumo,
  linhas,
  colunas,
  vazio,
  altura = 260,
  children,
}: {
  titulo: string;
  definicao?: string;
  resumo?: ReactNode;
  /** As mesmas linhas do gráfico, para a aba de tabela. */
  linhas: Record<string, unknown>[];
  colunas: ColunaTabela[];
  /** Texto quando não há dado. Diferente de zero: "não chegou" não é "é zero". */
  vazio?: string;
  altura?: number;
  children: ReactNode;
}) {
  const [modo, setModo] = useState<"grafico" | "tabela">("grafico");
  const temDados = linhas.length > 0;

  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[#213368]">
            <span className="truncate">{titulo}</span>
            {definicao && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-[#213368]"
                    aria-label={`O que é ${titulo}`}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                  {definicao}
                </TooltipContent>
              </Tooltip>
            )}
          </h3>
          {resumo && <p className="mt-0.5 text-xs text-muted-foreground">{resumo}</p>}
        </div>

        {temDados && (
          <div className="flex shrink-0 rounded-md border">
            <button
              type="button"
              onClick={() => setModo("grafico")}
              aria-pressed={modo === "grafico"}
              aria-label="Ver como gráfico"
              className={`rounded-l-md p-1.5 ${
                modo === "grafico" ? "bg-muted text-[#213368]" : "text-muted-foreground"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setModo("tabela")}
              aria-pressed={modo === "tabela"}
              aria-label="Ver como tabela"
              className={`rounded-r-md p-1.5 ${
                modo === "tabela" ? "bg-muted text-[#213368]" : "text-muted-foreground"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {!temDados ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {vazio ?? "Sem dado para o período e os filtros selecionados."}
        </p>
      ) : modo === "grafico" ? (
        <div style={{ height: altura }}>
          <ResponsiveContainer width="100%" height="100%">
            {children as never}
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {colunas.map((c) => (
                  <TableHead key={c.chave} className={c.alinharDireita ? "text-right" : ""}>
                    {c.rotulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => (
                <TableRow key={i}>
                  {colunas.map((c) => (
                    <TableCell
                      key={c.chave}
                      className={`text-sm ${c.alinharDireita ? "text-right tabular-nums" : ""}`}
                    >
                      {String(l[c.chave] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Peças comuns aos gráficos
// ------------------------------------------------------------
const EIXO = { fontSize: 11 };

function grade(p: Paleta) {
  // Só as horizontais: a linha vertical não ajuda a ler uma barra e
  // compete com ela por atenção.
  return <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={p.grade} />;
}

function dica(p: Paleta, formatar?: (v: number) => string) {
  return (
    <TooltipRecharts
      cursor={{ fill: p.grade }}
      contentStyle={{
        fontSize: 12,
        borderRadius: 8,
        border: `1px solid ${p.grade}`,
        background: p.fundo,
      }}
      formatter={(v: number, nome: string) => [formatar ? formatar(v) : v, nome]}
    />
  );
}

// ------------------------------------------------------------
// Barras horizontais — ranking
// ------------------------------------------------------------
/**
 * Para comparar entidades: obras, funções, pessoas. Horizontal porque o
 * rótulo é um nome, e nome deitado no eixo X vira texto na diagonal.
 */
export function BarrasHorizontais({
  dados,
  paleta,
  formatar,
  larguraRotulo = 120,
}: {
  dados: { chave: string; valor: number }[];
  paleta: Paleta;
  formatar?: (v: number) => string;
  larguraRotulo?: number;
}) {
  return (
    <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }}>
      {grade(paleta)}
      <XAxis
        type="number"
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        type="category"
        dataKey="chave"
        width={larguraRotulo}
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      {dica(paleta, formatar)}
      <Bar dataKey="valor" name="Total" radius={[0, 4, 4, 0]} maxBarSize={18}>
        {dados.map((d) => (
          <Cell key={d.chave} fill={paleta.cor(d.chave)} />
        ))}
      </Bar>
    </BarChart>
  );
}

// ------------------------------------------------------------
// Barras verticais — série no tempo, uma só medida
// ------------------------------------------------------------
export function BarrasNoTempo({
  dados,
  paleta,
  cor,
  nome,
  formatar,
}: {
  dados: { chave: string; valor: number | null }[];
  paleta: Paleta;
  cor?: string;
  nome: string;
  formatar?: (v: number) => string;
}) {
  return (
    <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
      {grade(paleta)}
      <XAxis
        dataKey="chave"
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis tick={{ ...EIXO, fill: paleta.eixo }} axisLine={false} tickLine={false} width={44} />
      {dica(paleta, formatar)}
      <Bar
        dataKey="valor"
        name={nome}
        fill={cor ?? paleta.serie(0)}
        radius={[4, 4, 0, 0]}
        maxBarSize={26}
      />
    </BarChart>
  );
}

// ------------------------------------------------------------
// Barras agrupadas — duas medidas lado a lado
// ------------------------------------------------------------
/**
 * Admissões × demissões. Agrupadas e não empilhadas: empilhar somaria
 * entradas com saídas, e a altura total não significaria nada.
 */
export function BarrasAgrupadas({
  dados,
  series,
  paleta,
}: {
  dados: Record<string, unknown>[];
  series: { chave: string; nome: string }[];
  paleta: Paleta;
}) {
  return (
    <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
      {grade(paleta)}
      <XAxis
        dataKey="chave"
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis tick={{ ...EIXO, fill: paleta.eixo }} axisLine={false} tickLine={false} width={40} />
      {dica(paleta)}
      <Legend wrapperStyle={{ fontSize: 11, color: paleta.eixo }} iconType="circle" iconSize={8} />
      {series.map((s, i) => (
        <Bar
          key={s.chave}
          dataKey={s.chave}
          name={s.nome}
          fill={paleta.serie(i)}
          radius={[4, 4, 0, 0]}
          maxBarSize={14}
        />
      ))}
    </BarChart>
  );
}

// ------------------------------------------------------------
// Barras empilhadas — composição
// ------------------------------------------------------------
/**
 * A separação de 2px entre segmentos sai do `stroke` na cor do fundo do
 * card: recharts não tem opção de espaço dentro da pilha, e sem a
 * separação dois segmentos de cor próxima viram um bloco só.
 */
export function BarrasEmpilhadas({
  dados,
  series,
  paleta,
  horizontal = false,
  formatar,
  larguraRotulo = 120,
}: {
  dados: Record<string, unknown>[];
  series: string[];
  paleta: Paleta;
  horizontal?: boolean;
  formatar?: (v: number) => string;
  larguraRotulo?: number;
}) {
  const barras = series.map((s, i) => (
    <Bar
      key={s}
      dataKey={s}
      name={s}
      stackId="pilha"
      fill={paleta.serie(i)}
      stroke={paleta.fundo}
      strokeWidth={2}
      maxBarSize={horizontal ? 20 : 30}
    />
  ));

  if (horizontal) {
    return (
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
        {grade(paleta)}
        <XAxis
          type="number"
          tick={{ ...EIXO, fill: paleta.eixo }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (formatar ? formatar(v) : String(v))}
        />
        <YAxis
          type="category"
          dataKey="chave"
          width={larguraRotulo}
          tick={{ ...EIXO, fill: paleta.eixo }}
          axisLine={false}
          tickLine={false}
        />
        {dica(paleta, formatar)}
        {series.length > 1 && (
          <Legend
            wrapperStyle={{ fontSize: 11, color: paleta.eixo }}
            iconType="circle"
            iconSize={8}
          />
        )}
        {barras}
      </BarChart>
    );
  }

  return (
    <BarChart data={dados} margin={{ top: 4, right: 8, bottom: 4, left: 4 }}>
      {grade(paleta)}
      <XAxis
        dataKey="chave"
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
        width={44}
        tickFormatter={(v: number) => (formatar ? formatar(v) : String(v))}
      />
      {dica(paleta, formatar)}
      {series.length > 1 && (
        <Legend
          wrapperStyle={{ fontSize: 11, color: paleta.eixo }}
          iconType="circle"
          iconSize={8}
        />
      )}
      {barras}
    </BarChart>
  );
}

// ------------------------------------------------------------
// Linha — taxa no tempo, sempre em gráfico próprio
// ------------------------------------------------------------
/**
 * Existe separado das barras de propósito. Turnover e absenteísmo são
 * percentuais; pendurá-los num segundo eixo Y ao lado de contagens faz
 * as duas linhas se cruzarem em pontos que dependem só da escala
 * escolhida — e o cruzamento é lido como causa.
 */
export function LinhaNoTempo({
  dados,
  paleta,
  nome,
  cor,
  sufixo = "",
}: {
  dados: { chave: string; valor: number | null }[];
  paleta: Paleta;
  nome: string;
  cor?: string;
  sufixo?: string;
}) {
  return (
    <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
      {grade(paleta)}
      <XAxis
        dataKey="chave"
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis
        tick={{ ...EIXO, fill: paleta.eixo }}
        axisLine={false}
        tickLine={false}
        width={44}
        tickFormatter={(v: number) => `${v}${sufixo}`}
      />
      {dica(paleta, (v) => `${v}${sufixo}`)}
      <Line
        type="monotone"
        dataKey="valor"
        name={nome}
        stroke={cor ?? paleta.serie(1)}
        strokeWidth={2.5}
        // Ponto pequeno e sem rótulo: número em todo ponto vira ruído e
        // some justamente quando a série fica interessante, que é
        // quando os pontos se aproximam.
        dot={{ r: 2.5 }}
        activeDot={{ r: 4 }}
        connectNulls={false}
      />
    </LineChart>
  );
}
