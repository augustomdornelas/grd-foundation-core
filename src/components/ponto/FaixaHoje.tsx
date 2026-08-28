// ============================================================
// A faixa de HOJE — o que abre o dashboard
// ------------------------------------------------------------
// É a primeira coisa que aparece porque é a pergunta que se faz de
// manhã: quem veio trabalhar. Todo o resto do dashboard é retrospectivo
// e pode esperar um clique.
//
// CADA TILE TEM A DEFINIÇÃO NO TOOLTIP, e isso não é enfeite. Métrica
// de ponto é cheia de definição discutível: "trabalhando agora" no
// painel da Secullum quer dizer "dentro da empresa neste instante", e
// não "veio hoje". Se a nossa tela usar outra definição sem dizer, os
// dois painéis vão discordar e ninguém vai confiar em nenhum dos dois.
//
// TRAVESSÃO NÃO É ZERO. Onde a escala do horário não é conhecida,
// "faltantes" e "em folga" mostram — em vez de 0. Zero afirma que
// ninguém faltou; travessão diz que não dá para saber.
// ============================================================
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Info, Phone } from "lucide-react";
import { Painel, BarrasHorizontais, type Paleta } from "@/components/ponto/graficos";
import type { FaixaHoje as DadosFaixaHoje } from "@/lib/ponto-metricas";
import { formatarCpf } from "@/lib/documento";

// ------------------------------------------------------------
// Tile
// ------------------------------------------------------------
function Tile({
  rotulo,
  valor,
  definicao,
  destaque = false,
  tom = "neutro",
}: {
  rotulo: string;
  /** null vira travessão: "não sei", que é diferente de zero. */
  valor: number | null;
  definicao: string;
  destaque?: boolean;
  tom?: "neutro" | "alerta" | "bom";
}) {
  const cor =
    tom === "alerta" ? "text-[#B03A5B]" : tom === "bom" ? "text-[#1F8A70]" : "text-[#213368]";

  return (
    <Card
      className={`p-4 ${destaque ? "border-[#213368]/25 bg-[#213368]/[0.03] sm:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={`text-xs font-medium uppercase tracking-wide text-muted-foreground ${
            destaque ? "sm:text-sm" : ""
          }`}
        >
          {rotulo}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="shrink-0 text-muted-foreground hover:text-[#213368]"
              aria-label={`O que é ${rotulo}`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed">{definicao}</TooltipContent>
        </Tooltip>
      </div>
      <p
        className={`mt-1 font-bold tabular-nums ${cor} ${
          destaque ? "text-5xl sm:text-6xl" : "text-2xl"
        }`}
      >
        {valor === null ? "—" : valor}
      </p>
    </Card>
  );
}

// ------------------------------------------------------------
// A faixa
// ------------------------------------------------------------
export function FaixaHoje({ hoje, paleta }: { hoje: DadosFaixaHoje; paleta: Paleta }) {
  const dataBonita = new Date(`${hoje.dia}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  const avisoEscala = hoje.escalaDesconhecida
    ? " A Secullum não devolveu a escala dos horários, então este número não é calculável — por isso o travessão."
    : "";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[#213368]">Hoje — {dataBonita}</h3>
        <p className="text-xs text-muted-foreground">
          A faixa de hoje usa as batidas já sincronizadas. Se o job da madrugada é o último que
          rodou, o dia corrente ainda não está aqui — o carimbo no topo diz de quando é o dado.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Tile
          rotulo="Colaboradores do dia"
          valor={hoje.colaboradoresDoDia}
          destaque
          definicao="Quantas pessoas distintas registraram pelo menos uma batida hoje. Conta a pessoa, não a batida: quem marcou entrada, almoço e saída conta uma vez."
        />
        <Tile
          rotulo="Trabalhando agora"
          valor={hoje.trabalhandoAgora}
          tom="bom"
          definicao="Quem tem número ÍMPAR de batidas hoje — ou seja, entrou e ainda não registrou a saída correspondente. É a mesma definição do painel da Secullum: 'dentro da empresa neste instante', e não 'veio hoje'. As duas telas só concordam porque usam esta mesma regra."
        />
        <Tile
          rotulo="Faltantes"
          valor={hoje.faltantes}
          tom={hoje.faltantes && hoje.faltantes > 0 ? "alerta" : "neutro"}
          definicao={`Escalados para hoje pela escala do horário que não registraram nenhuma batida. Quem está de férias, afastado ou com ausência justificada NÃO entra aqui — está contado nos tiles próprios.${avisoEscala}`}
        />
        <Tile
          rotulo="Em folga"
          valor={hoje.emFolga}
          definicao={`Ativos cuja escala não prevê trabalho hoje, pelo campo Dias do horário na Secullum. É o que separa 'não era para vir' de 'era para vir e não veio'.${avisoEscala}`}
        />
        <Tile
          rotulo="De férias"
          valor={hoje.deFerias}
          definicao="Afastamentos vigentes hoje cuja justificativa menciona férias. Vigente = começou até hoje e não terminou antes de hoje."
        />
        <Tile
          rotulo="Afastados"
          valor={hoje.afastados}
          definicao="Afastamentos vigentes por INSS, auxílio-doença, licença (maternidade, paternidade) ou acidente. Separado de férias porque a natureza e a duração são outras."
        />
        <Tile
          rotulo="Ausência justificada"
          valor={hoje.ausenciaJustificada}
          definicao="O resto dos afastamentos vigentes: atestado, falta abonada, folga concedida. A justificativa é texto livre digitado no Ponto Web — o que não cai em férias nem em afastamento cai aqui."
        />
        <Tile
          rotulo="Solicitações pendentes"
          valor={hoje.solicitacoesPendentes}
          tom={hoje.solicitacoesPendentes > 0 ? "alerta" : "neutro"}
          definicao="Inclusões de ponto que alguém pediu e ninguém aprovou ainda, na fila do DP. Pendência parada vira folha errada no fim do mês."
        />
      </div>

      <Painel
        titulo="Colaboradores do dia por obra"
        definicao="As mesmas pessoas do tile principal, distribuídas pelo departamento da Secullum — que na conta da GRD é a obra. Quem não tem departamento aparece como 'Sem obra'."
        linhas={hoje.porObra}
        colunas={[
          { chave: "chave", rotulo: "Obra" },
          { chave: "valor", rotulo: "Pessoas", alinharDireita: true },
        ]}
        vazio="Nenhuma batida registrada hoje até o último sync."
        altura={Math.max(160, hoje.porObra.length * 34 + 40)}
      >
        <BarrasHorizontais dados={hoje.porObra} paleta={paleta} larguraRotulo={140} />
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaFaltantes hoje={hoje} />
        <ListaBatidas hoje={hoje} />
      </div>
    </div>
  );
}

function ListaFaltantes({ hoje }: { hoje: DadosFaixaHoje }) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#213368]">Quem faltou hoje</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Escalados sem nenhuma batida. O telefone vem do cadastro do Portal — em branco quando a
        pessoa ainda não tem cadastro lá.
      </p>

      {hoje.escalaDesconhecida ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          A escala dos horários não veio da Secullum. Sem ela não dá para dizer quem era esperado
          hoje — e chutar produziria uma lista de faltas falsas.
        </p>
      ) : hoje.quemFaltou.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#1F8A70]">
          Ninguém faltou entre os escalados de hoje.
        </p>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hoje.quemFaltou.map((p) => (
                <TableRow key={p.cpf}>
                  <TableCell className="text-sm font-medium text-[#213368]">
                    {p.nome}
                    <span className="block font-mono text-[11px] font-normal text-muted-foreground">
                      {formatarCpf(p.cpf)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{p.obra || "—"}</TableCell>
                  <TableCell className="text-sm">{p.funcao || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {p.telefone ? (
                      <a
                        href={`tel:${p.telefone.replace(/\D/g, "")}`}
                        className="inline-flex items-center gap-1 text-[#2F5BB7] hover:underline"
                      >
                        <Phone className="h-3 w-3" />
                        {p.telefone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function ListaBatidas({ hoje }: { hoje: DadosFaixaHoje }) {
  return (
    <Card className="p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#213368]">Batidas de hoje</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Da mais recente para a mais antiga. A origem diz por onde a marcação entrou — inclusão
        manual é a que merece conferência.
      </p>

      {hoje.batidas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma batida de hoje sincronizada até agora.
        </p>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-20">Hora</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hoje.batidas.map((b, i) => (
                <TableRow key={`${b.nome}-${b.horario}-${i}`}>
                  <TableCell className="text-sm font-medium text-[#213368]">
                    {b.nome}
                    {b.obra && (
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        {b.obra}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{b.horario}</TableCell>
                  <TableCell className="text-sm">{b.origem}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
