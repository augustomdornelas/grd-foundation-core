// ============================================================
// As abas analíticas do dashboard de Ponto
// ------------------------------------------------------------
// Seis assuntos, um por aba, todos lendo as mesmas tabelas locais que
// a faixa de hoje. Nenhuma delas chama a Secullum.
//
// O QUE SE REPETE DE PROPÓSITO
// Cada gráfico é um `<Painel>`, que traz a definição da métrica no
// tooltip e a alternância para tabela. A repetição é o ponto: a
// definição de turnover discutida fica escrita ao lado do turnover, e
// não num documento que ninguém abre.
// ============================================================
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, TriangleAlert } from "lucide-react";
import {
  Painel,
  BarrasHorizontais,
  BarrasNoTempo,
  BarrasAgrupadas,
  BarrasEmpilhadas,
  LinhaNoTempo,
  type Paleta,
} from "@/components/ponto/graficos";
import {
  minutosParaHoras,
  type Equipe,
  type Rotatividade,
  type HorasExtras,
  type Absenteismo,
  type Qualidade,
  type Divergencias,
} from "@/lib/ponto-metricas";
import { formatarCpf } from "@/lib/documento";

const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

// ============================================================
// EQUIPE
// ============================================================
export function AbaEquipe({ equipe, paleta }: { equipe: Equipe; paleta: Paleta }) {
  const { limite, emUso, pct } = equipe.licenca;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Efetivo ativo
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#213368]">{equipe.efetivo}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Sem data de demissão no espelho da Secullum, dentro dos filtros.
          </p>
        </Card>

        <Card className="p-4 sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Ocupação da licença do Ponto Web
          </p>
          {limite === null ? (
            <>
              <p className="mt-1 text-3xl font-bold tabular-nums text-[#213368]">{emUso}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A Secullum não informou o limite do plano no último sync de catálogos. Sem ele não
                dá para dizer quanto sobra — o número acima é só quem está em uso.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-bold tabular-nums text-[#213368]">
                {emUso}{" "}
                <span className="text-lg font-medium text-muted-foreground">de {limite}</span>
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${
                    (pct ?? 0) >= 90
                      ? "bg-[#B03A5B]"
                      : (pct ?? 0) >= 75
                        ? "bg-[#E8621A]"
                        : "bg-[#1F8A70]"
                  }`}
                  style={{ width: `${Math.min(100, pct ?? 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {limite - emUso} vaga(s) livre(s). Importar gente da Secullum para o Portal não
                consome licença; cadastrar alguém novo LÁ consome.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Efetivo por obra"
          definicao="Ativos por departamento da Secullum, que na conta da GRD é a obra."
          linhas={equipe.porObra}
          colunas={[
            { chave: "chave", rotulo: "Obra" },
            { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
          ]}
          altura={Math.max(180, equipe.porObra.length * 34 + 40)}
        >
          <BarrasHorizontais dados={equipe.porObra} paleta={paleta} larguraRotulo={140} />
        </Painel>

        <Painel
          titulo="Efetivo por função"
          definicao="Ativos por função da Secullum. Da sétima função em diante o resto vira 'Outros' — a paleta tem seis cores, e a sétima teria que repetir uma."
          linhas={equipe.porFuncao}
          colunas={[
            { chave: "chave", rotulo: "Função" },
            { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
          ]}
          altura={Math.max(180, equipe.porFuncao.length * 34 + 40)}
        >
          <BarrasHorizontais dados={equipe.porFuncao} paleta={paleta} larguraRotulo={140} />
        </Painel>

        <Painel
          titulo="Tempo de casa"
          definicao="Meses completos entre a admissão e hoje, em faixas. As faixas aparecem na ordem da escala, e não por tamanho: é uma progressão, não um ranking."
          resumo={
            equipe.semAdmissao > 0
              ? `${equipe.semAdmissao} pessoa(s) sem data de admissão ficaram de fora.`
              : undefined
          }
          linhas={equipe.tempoDeCasa}
          colunas={[
            { chave: "chave", rotulo: "Faixa" },
            { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
          ]}
          altura={Math.max(180, equipe.tempoDeCasa.length * 34 + 40)}
        >
          <BarrasHorizontais dados={equipe.tempoDeCasa} paleta={paleta} larguraRotulo={110} />
        </Painel>

        <Painel
          titulo="Faixa etária"
          definicao="Idade em anos completos hoje, pela data de nascimento vinda da Secullum."
          resumo={
            equipe.semNascimento > 0
              ? `${equipe.semNascimento} pessoa(s) sem data de nascimento ficaram de fora — a Secullum não devolveu.`
              : undefined
          }
          linhas={equipe.faixaEtaria}
          colunas={[
            { chave: "chave", rotulo: "Faixa" },
            { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
          ]}
          vazio="Nenhuma data de nascimento no espelho. O job de funcionários precisa rodar depois da migration que criou a coluna."
          altura={Math.max(180, equipe.faixaEtaria.length * 34 + 40)}
        >
          <BarrasHorizontais dados={equipe.faixaEtaria} paleta={paleta} larguraRotulo={110} />
        </Painel>
      </div>
    </div>
  );
}

// ============================================================
// ROTATIVIDADE
// ============================================================
export function AbaRotatividade({ rot, paleta }: { rot: Rotatividade; paleta: Paleta }) {
  const turnover = rot.meses.map((m) => ({ chave: m.rotulo, valor: m.turnover }));

  return (
    <div className="space-y-4">
      <Painel
        titulo="Admissões e demissões — 12 meses"
        definicao="Contagem por mês de admissão e de demissão. Barras agrupadas, e não empilhadas: empilhar somaria entradas com saídas, e a altura total não significaria nada."
        linhas={rot.meses.map((m) => ({
          chave: m.rotulo,
          admissoes: m.admissoes,
          demissoes: m.demissoes,
        }))}
        colunas={[
          { chave: "chave", rotulo: "Mês" },
          { chave: "admissoes", rotulo: "Admissões", alinharDireita: true },
          { chave: "demissoes", rotulo: "Demissões", alinharDireita: true },
        ]}
        altura={260}
      >
        <BarrasAgrupadas
          dados={rot.meses.map((m) => ({
            chave: m.rotulo,
            admissoes: m.admissoes,
            demissoes: m.demissoes,
          }))}
          series={[
            { chave: "admissoes", nome: "Admissões" },
            { chave: "demissoes", nome: "Demissões" },
          ]}
          paleta={paleta}
        />
      </Painel>

      <Painel
        titulo="Turnover mensal"
        definicao="(admissões + demissões) ÷ 2 ÷ efetivo médio do mês, em %. Fica em gráfico PRÓPRIO, e não num segundo eixo Y junto das barras acima: as duas escalas seriam arbitrárias, e o ponto onde as séries se cruzam viraria uma relação que não existe. Mês sem ninguém no efetivo não tem barra — dividir por zero não é 0%."
        linhas={rot.meses.map((m) => ({
          chave: m.rotulo,
          turnover: m.turnover === null ? "—" : `${m.turnover}%`,
          efetivo: Math.round(m.efetivoMedio * 10) / 10,
        }))}
        colunas={[
          { chave: "chave", rotulo: "Mês" },
          { chave: "turnover", rotulo: "Turnover", alinharDireita: true },
          { chave: "efetivo", rotulo: "Efetivo médio", alinharDireita: true },
        ]}
        altura={220}
      >
        <LinhaNoTempo dados={turnover} paleta={paleta} nome="Turnover" sufixo="%" />
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Rotatividade por obra — 12 meses"
          definicao="Admissões e demissões acumuladas por obra na janela. Barras agrupadas, mesma razão do gráfico mensal."
          linhas={rot.porObra.map((o) => ({
            chave: o.chave,
            admissoes: o.admissoes,
            demissoes: o.demissoes,
            turnover: o.turnover === null ? "—" : `${o.turnover}%`,
          }))}
          colunas={[
            { chave: "chave", rotulo: "Obra" },
            { chave: "admissoes", rotulo: "Adm.", alinharDireita: true },
            { chave: "demissoes", rotulo: "Dem.", alinharDireita: true },
            { chave: "turnover", rotulo: "Turnover", alinharDireita: true },
          ]}
          altura={Math.max(200, rot.porObra.length * 42 + 60)}
        >
          <BarrasAgrupadas
            dados={rot.porObra.map((o) => ({
              chave: o.chave,
              admissoes: o.admissoes,
              demissoes: o.demissoes,
            }))}
            series={[
              { chave: "admissoes", nome: "Admissões" },
              { chave: "demissoes", nome: "Demissões" },
            ]}
            paleta={paleta}
          />
        </Painel>

        <Painel
          titulo="Sobrevivência dos admitidos"
          definicao="De quem já teve tempo de chegar ao marco, o percentual que continuava na empresa. Quem foi admitido há 40 dias NÃO entra no marco de 90: ainda está a caminho, e contá-lo como sobrevivente inflaria o número."
          resumo={`Base: ${rot.baseSobrevivencia} pessoa(s) com data de admissão.`}
          linhas={rot.sobrevivencia.map((s) => ({ chave: s.chave, valor: `${s.valor}%` }))}
          colunas={[
            { chave: "chave", rotulo: "Marco" },
            { chave: "valor", rotulo: "Sobreviveram", alinharDireita: true },
          ]}
          altura={200}
        >
          <BarrasHorizontais
            dados={rot.sobrevivencia}
            paleta={paleta}
            larguraRotulo={80}
            formatar={(v) => `${v}%`}
          />
        </Painel>
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="text-sm font-semibold text-[#213368]">Demissões recentes</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          As quinze últimas, da mais recente. &quot;Casa&quot; é o tempo entre admissão e demissão.
        </p>
        {rot.demissoesRecentes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma demissão registrada no espelho da Secullum.
          </p>
        ) : (
          <div className="mt-3 max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead className="w-24">Saída</TableHead>
                  <TableHead className="w-28">Casa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rot.demissoesRecentes.map((d, i) => (
                  <TableRow key={`${d.nome}-${d.data}-${i}`}>
                    <TableCell className="text-sm font-medium text-[#213368]">{d.nome}</TableCell>
                    <TableCell className="text-sm">{d.obra}</TableCell>
                    <TableCell className="text-sm">{d.funcao}</TableCell>
                    <TableCell className="text-sm tabular-nums">{dataBr(d.data)}</TableCell>
                    <TableCell className="text-sm">{d.casa}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// HORAS E EXTRAS
// ============================================================
export function AbaHoras({
  horas,
  paleta,
  podeVerCusto,
}: {
  horas: HorasExtras;
  paleta: Paleta;
  podeVerCusto: boolean;
}) {
  if (horas.semDados) {
    return (
      <CartaoSemDado
        titulo="Nenhum total calculado ainda"
        texto="A tabela ponto_totais está vazia. Ela é preenchida pelo job de totais, que lê o relatório /Calcular/SomenteTotais da Secullum — e esse endpoint ainda não foi confirmado contra a conta da GRD. Enquanto o job não rodar com sucesso, esta aba não tem o que somar."
      />
    );
  }

  const rotulosPresentes = horas.categoriasPresentes.map((c) =>
    c === "normais"
      ? "Normais"
      : c === "extras"
        ? "Extras"
        : c === "noturnas"
          ? "Noturnas"
          : c === "atrasos"
            ? "Atrasos"
            : c === "faltas"
              ? "Faltas"
              : "Outras",
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Horas normais na competência
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#213368]">
            {minutosParaHoras(horas.totalNormais)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Horas extras na competência
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#E8621A]">
            {minutosParaHoras(horas.totalExtras)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {horas.totalNormais > 0
              ? `${Math.round((horas.totalExtras / horas.totalNormais) * 1000) / 10}% das normais.`
              : "Sem horas normais para comparar."}
          </p>
        </Card>
      </div>

      <Painel
        titulo="Composição das horas por obra"
        definicao="Minutos por categoria, empilhados por obra. A categoria sai do NOME da coluna do relatório da Secullum; coluna que não reconhecemos cai em 'Outras' — o que é um convite a ajustar o mapa, em vez de sumir sem ninguém notar."
        linhas={horas.composicaoPorObra.map((l) => {
          const linha: Record<string, unknown> = { chave: l.chave };
          for (const r of rotulosPresentes) linha[r] = minutosParaHoras(Number(l[r] ?? 0));
          return linha;
        })}
        colunas={[
          { chave: "chave", rotulo: "Obra" },
          ...rotulosPresentes.map((r) => ({ chave: r, rotulo: r, alinharDireita: true })),
        ]}
        altura={Math.max(220, horas.composicaoPorObra.length * 40 + 60)}
      >
        <BarrasEmpilhadas
          dados={horas.composicaoPorObra}
          series={rotulosPresentes}
          paleta={paleta}
          horizontal
          larguraRotulo={140}
          formatar={minutosParaHoras}
        />
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Horas extras por mês"
          definicao="Soma dos minutos das colunas de extra, por competência, dentro dos filtros de obra e função. O filtro de competência NÃO se aplica aqui: o gráfico existe para mostrar a série."
          linhas={horas.extrasPorMes.map((m) => ({
            chave: m.chave,
            valor: minutosParaHoras(m.valor),
          }))}
          colunas={[
            { chave: "chave", rotulo: "Mês" },
            { chave: "valor", rotulo: "Extras", alinharDireita: true },
          ]}
          altura={240}
        >
          <BarrasNoTempo
            dados={horas.extrasPorMes}
            paleta={paleta}
            cor={paleta.serie(1)}
            nome="Horas extras"
            formatar={minutosParaHoras}
          />
        </Painel>

        <Painel
          titulo="Top 10 em horas extras"
          definicao="As dez maiores somas de extra na competência selecionada."
          linhas={horas.topExtras.map((p) => ({
            chave: p.nome,
            obra: p.obra,
            valor: minutosParaHoras(p.minutos),
          }))}
          colunas={[
            { chave: "chave", rotulo: "Nome" },
            { chave: "obra", rotulo: "Obra" },
            { chave: "valor", rotulo: "Extras", alinharDireita: true },
          ]}
          altura={Math.max(220, horas.topExtras.length * 30 + 40)}
        >
          <BarrasHorizontais
            dados={horas.topExtras.map((p) => ({ chave: p.nome, valor: p.minutos }))}
            paleta={paleta}
            larguraRotulo={150}
            formatar={minutosParaHoras}
          />
        </Painel>
      </div>

      {podeVerCusto && horas.custoPorObra.length > 0 && (
        <Painel
          titulo="Custo estimado da hora extra por obra"
          definicao="Salário mensal vigente ÷ 220 horas = valor da hora; extras pagas por esse valor, SEM adicional de 60%/70%, sem encargo e sem DSR. NÃO é folha: serve para comparar obras entre si. Quem não tem salário cadastrado fica de fora da soma, e não entra como zero — senão a obra com cadastro incompleto pareceria a mais barata."
          resumo={
            horas.semSalario > 0
              ? `${horas.semSalario} pessoa(s) com extra ficaram de fora por não ter salário vigente cadastrado.`
              : undefined
          }
          linhas={horas.custoPorObra.map((c) => ({ chave: c.chave, valor: reais(c.valor) }))}
          colunas={[
            { chave: "chave", rotulo: "Obra" },
            { chave: "valor", rotulo: "Custo estimado", alinharDireita: true },
          ]}
          altura={Math.max(200, horas.custoPorObra.length * 34 + 40)}
        >
          <BarrasHorizontais
            dados={horas.custoPorObra}
            paleta={paleta}
            larguraRotulo={140}
            formatar={reais}
          />
        </Painel>
      )}

      {podeVerCusto && horas.custoPorObra.length === 0 && (
        <CartaoSemDado
          titulo="Custo da extra indisponível"
          texto="Nenhum salário vigente cadastrado para quem fez hora extra nesta competência. O custo aparece assim que houver remuneração no cadastro do Portal — mostrar R$ 0,00 seria afirmar que a extra não custou nada."
        />
      )}
    </div>
  );
}

// ============================================================
// ABSENTEÍSMO
// ============================================================
export function AbaAbsenteismo({ abs, paleta }: { abs: Absenteismo; paleta: Paleta }) {
  if (abs.semDados) {
    return (
      <CartaoSemDado
        titulo="Sem batidas nem totais sincronizados"
        texto="Esta aba cruza o relatório de totais com as batidas do período. Enquanto os jobs de batidas e de totais não rodarem com sucesso, não há o que medir."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Painel
        titulo="Taxa de absenteísmo por mês"
        definicao="Minutos de falta ÷ (minutos de falta + minutos normais), em %. Os dois lados da conta vêm do MESMO relatório da Secullum — de propósito: misturar com jornada teórica, que não temos, produziria uma taxa que ninguém consegue reproduzir."
        linhas={abs.porMes.map((m) => ({
          chave: m.chave,
          valor: m.valor === null ? "—" : `${m.valor}%`,
        }))}
        colunas={[
          { chave: "chave", rotulo: "Mês" },
          { chave: "valor", rotulo: "Absenteísmo", alinharDireita: true },
        ]}
        altura={240}
      >
        <LinhaNoTempo dados={abs.porMes} paleta={paleta} nome="Absenteísmo" sufixo="%" />
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Faltas e atrasos por obra"
          definicao="Minutos de falta e de atraso na competência selecionada, agrupados por obra."
          linhas={abs.porObra.map((o) => ({
            chave: o.chave,
            faltas: minutosParaHoras(o.faltas),
            atrasos: minutosParaHoras(o.atrasos),
          }))}
          colunas={[
            { chave: "chave", rotulo: "Obra" },
            { chave: "faltas", rotulo: "Faltas", alinharDireita: true },
            { chave: "atrasos", rotulo: "Atrasos", alinharDireita: true },
          ]}
          altura={Math.max(200, abs.porObra.length * 42 + 60)}
        >
          <BarrasAgrupadas
            dados={abs.porObra.map((o) => ({
              chave: o.chave,
              faltas: o.faltas,
              atrasos: o.atrasos,
            }))}
            series={[
              { chave: "faltas", nome: "Faltas" },
              { chave: "atrasos", nome: "Atrasos" },
            ]}
            paleta={paleta}
          />
        </Painel>

        <Painel
          titulo="Faltas por dia da semana"
          definicao="Aqui a fonte é a batida, não o relatório: pessoa escalada para o dia que não registrou nenhuma marcação, somada por dia da semana em todo o histórico carregado. É o gráfico que revela o padrão da segunda-feira."
          linhas={abs.porDiaDaSemana}
          colunas={[
            { chave: "chave", rotulo: "Dia" },
            { chave: "valor", rotulo: "Faltas", alinharDireita: true },
          ]}
          vazio="Sem faltas identificadas — ou sem escala conhecida para dizer quem era esperado."
          altura={240}
        >
          <BarrasHorizontais dados={abs.porDiaDaSemana} paleta={paleta} larguraRotulo={90} />
        </Painel>
      </div>

      <Painel
        titulo="Afastamentos ativos por tipo"
        definicao="Afastamentos vigentes hoje, agrupados pela justificativa exatamente como foi digitada no Ponto Web. Sem normalização: se aparecerem 'ATESTADO' e 'Atestado médico' separados, é assim que está lá — e ver isso aqui é o primeiro passo para arrumar."
        linhas={abs.afastamentosAtivos}
        colunas={[
          { chave: "chave", rotulo: "Justificativa" },
          { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
        ]}
        vazio="Ninguém afastado hoje — ou o job de afastamentos ainda não rodou."
        altura={Math.max(180, abs.afastamentosAtivos.length * 34 + 40)}
      >
        <BarrasHorizontais dados={abs.afastamentosAtivos} paleta={paleta} larguraRotulo={160} />
      </Painel>
    </div>
  );
}

// ============================================================
// QUALIDADE
// ============================================================
export function AbaQualidade({ qual, paleta }: { qual: Qualidade; paleta: Paleta }) {
  if (qual.semDados) {
    return (
      <CartaoSemDado
        titulo="Nenhuma batida sincronizada"
        texto="A tabela ponto_batidas está vazia para o período e os filtros. O job de batidas lê /Batidas da Secullum, endpoint cujo formato ainda não foi confirmado contra a conta da GRD."
      />
    );
  }

  const pctManual =
    qual.totalBatidas > 0 ? Math.round((qual.totalManuais / qual.totalBatidas) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Batidas no período
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-[#213368]">{qual.totalBatidas}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Inclusões manuais
          </p>
          <p
            className={`mt-1 text-3xl font-bold tabular-nums ${
              pctManual >= 10 ? "text-[#B03A5B]" : "text-[#213368]"
            }`}
          >
            {qual.totalManuais}{" "}
            <span className="text-lg font-medium text-muted-foreground">({pctManual}%)</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Marcação que não veio de relógio nem de app: alguém digitou. É a métrica de confiança do
            ponto.
          </p>
        </Card>
      </div>

      <Painel
        titulo="Origem das batidas por mês"
        definicao="Barra empilhada, e não pizza: são cinco ou mais origens, e ninguém compara ângulos parecidos. Empilhada mostra a composição E a evolução no mesmo desenho."
        linhas={qual.porOrigemMes}
        colunas={[
          { chave: "chave", rotulo: "Mês" },
          ...qual.origensPresentes.map((o) => ({ chave: o, rotulo: o, alinharDireita: true })),
        ]}
        altura={280}
      >
        <BarrasEmpilhadas
          dados={qual.porOrigemMes}
          series={qual.origensPresentes}
          paleta={paleta}
        />
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Inclusões manuais por mês"
          definicao="Quantidade absoluta de batidas com origem 'inclusão manual'. A tabela ao lado traz o percentual sobre o total do mês, que é o número que importa quando o volume muda."
          linhas={qual.manuaisPorMes.map((m) => ({
            chave: m.chave,
            valor: m.valor,
            pct: m.pct === null ? "—" : `${m.pct}%`,
          }))}
          colunas={[
            { chave: "chave", rotulo: "Mês" },
            { chave: "valor", rotulo: "Manuais", alinharDireita: true },
            { chave: "pct", rotulo: "% do mês", alinharDireita: true },
          ]}
          altura={240}
        >
          <BarrasNoTempo
            dados={qual.manuaisPorMes}
            paleta={paleta}
            cor={paleta.serie(1)}
            nome="Inclusões manuais"
          />
        </Painel>

        <Painel
          titulo="Batidas por equipamento"
          definicao="O relógio ou dispositivo que registrou. Equipamento em branco aparece como 'Não informado' — e volume alto aí costuma ser sinal de origem que a integração não está preenchendo."
          linhas={qual.porEquipamento}
          colunas={[
            { chave: "chave", rotulo: "Equipamento" },
            { chave: "valor", rotulo: "Batidas", alinharDireita: true },
          ]}
          altura={Math.max(200, qual.porEquipamento.length * 34 + 40)}
        >
          <BarrasHorizontais dados={qual.porEquipamento} paleta={paleta} larguraRotulo={150} />
        </Painel>
      </div>
    </div>
  );
}

// ============================================================
// DIVERGÊNCIAS
// ============================================================
export function AbaDivergencias({ div }: { div: Divergencias }) {
  const c = div.conciliacao;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <MiniTile rotulo="Nos dois cadastros" valor={c.emAmbos} />
        <MiniTile
          rotulo="Só na Secullum"
          valor={c.soNaSecullum.length}
          alerta={c.soNaSecullum.length > 0}
        />
        <MiniTile
          rotulo="Só no Portal"
          valor={c.soNoPortal.length}
          alerta={c.soNoPortal.length > 0}
        />
        <MiniTile rotulo="Sem CPF válido" valor={c.semCpfValido} alerta={c.semCpfValido > 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaConciliacao
          titulo="Batem ponto e não existem no Portal"
          descricao="Estão ativos na Secullum e não têm colaborador no cadastro do Portal. É o que a carga inicial da tela de Integração resolve."
          vazio="Todo mundo que bate ponto tem cadastro no Portal."
          linhas={c.soNaSecullum.map((p) => ({
            principal: p.nome,
            cpf: p.cpf,
            secundario: [p.obra, p.funcao].filter(Boolean).join(" · ") || "—",
          }))}
          rotuloSecundario="Obra e função"
        />
        <ListaConciliacao
          titulo="Estão no Portal e não batem ponto"
          descricao="Ativos no cadastro do Portal sem correspondente ativo na Secullum. Pode ser admissão que ainda não foi cadastrada no Ponto Web — ou alguém que já saiu e não foi desligado aqui."
          vazio="Todo colaborador ativo do Portal tem cadastro na Secullum."
          linhas={c.soNoPortal.map((p) => ({
            principal: p.nome,
            cpf: p.cpf,
            secundario: p.matricula || "sem matrícula",
          }))}
          rotuloSecundario="Matrícula"
        />
      </div>

      <Card className="p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#213368]">
          <TriangleAlert className="h-4 w-4 text-[#B03A5B]" />
          Batendo ponto com documento vencido
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Documento do Portal com validade expirada. A coluna &quot;bateu ponto&quot; é o que
          transforma a lista em ação: vencido de quem está trabalhando é risco hoje, vencido de quem
          está afastado é pendência de cadastro.
        </p>

        {div.semDocumentosCadastrados ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum documento com data de vencimento cadastrado no Portal. Isso não quer dizer que
            está tudo em dia — quer dizer que ainda não há o que conferir.
          </p>
        ) : div.documentoVencido.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#1F8A70]">
            Nenhum documento vencido entre os colaboradores com cadastro.
          </p>
        ) : (
          <div className="mt-3 max-h-80 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead className="w-28">Venceu</TableHead>
                  <TableHead className="w-32">Bateu ponto?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {div.documentoVencido.map((d, i) => (
                  <TableRow key={`${d.nome}-${d.documento}-${i}`}>
                    <TableCell className="text-sm font-medium text-[#213368]">{d.nome}</TableCell>
                    <TableCell className="text-sm">{d.obra}</TableCell>
                    <TableCell className="text-sm">
                      {d.documento}
                      {d.bloqueia && (
                        <Badge
                          variant="outline"
                          className="ml-1.5 border-[#B03A5B]/40 text-[10px] text-[#B03A5B]"
                        >
                          bloqueia alocação
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {dataBr(d.vencimento)}
                      <span className="block text-[11px] text-muted-foreground">
                        há {d.diasVencido} dia(s)
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.bateuNosUltimos30 ? (
                        <span className="font-medium text-[#B03A5B]">Sim, nos últimos 30 dias</span>
                      ) : (
                        <span className="text-muted-foreground">Não</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <CartaoSemDado
        titulo="Efetivo do diário de obra × batidas reais"
        texto="Este cruzamento não existe ainda porque o diário de obra não existe no sistema: não há tabela, tela nem importação dele. Enquanto o efetivo planejado por dia não for registrado em algum lugar, não há com o que comparar as batidas — e um gráfico aqui seria inventado."
      />
    </div>
  );
}

function MiniTile({
  rotulo,
  valor,
  alerta = false,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${
          alerta ? "text-[#E8621A]" : "text-[#213368]"
        }`}
      >
        {valor}
      </p>
    </Card>
  );
}

function ListaConciliacao({
  titulo,
  descricao,
  vazio,
  linhas,
  rotuloSecundario,
}: {
  titulo: string;
  descricao: string;
  vazio: string;
  linhas: { principal: string; cpf: string; secundario: string }[];
  rotuloSecundario: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#213368]">{titulo}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>
      {linhas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#1F8A70]">{vazio}</p>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>{rotuloSecundario}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.cpf}>
                  <TableCell className="text-sm font-medium text-[#213368]">
                    {l.principal}
                    <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                      {formatarCpf(l.cpf)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{l.secundario}</TableCell>
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
// Estado vazio honesto
// ------------------------------------------------------------
/**
 * Um card que explica POR QUE não há dado.
 *
 * "Sem dados" sozinho é indistinguível de "o valor é zero", e as duas
 * coisas levam a decisões opostas. Cada uso deste cartão diz qual job
 * ou qual cadastro está faltando.
 */
function CartaoSemDado({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50 p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="font-semibold text-amber-900">{titulo}</p>
          <p className="mt-1 max-w-3xl text-sm text-amber-800">{texto}</p>
        </div>
      </div>
    </Card>
  );
}
