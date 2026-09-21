// ============================================================
// Conciliação por CPF — Secullum × Portal
// ------------------------------------------------------------
// Saiu de /app/ponto/integracao junto com a carga inicial: as duas
// respondem à mesma pergunta ("quem está de um lado e não do outro?"),
// e a resposta é mexer no cadastro de colaboradores, que mora no menu
// Colaboradores.
//
// A conciliação é feita AQUI, no navegador, e não no servidor: a lista
// da Secullum vem de lá, a do Portal vem da sessão autenticada do RH —
// que é a única que a RLS de `funcionarios` deixa ler. Cruzar os dois
// no servidor exigiria uma chave de serviço que este sistema não tem,
// e não deveria ter.
//
// Comparação sempre por dígitos: a Secullum manda "181.272.888-37" e o
// Portal pode ter "18127288837". Ver src/lib/documento.ts.
// ============================================================
import { useMemo } from "react";
import { ShieldAlert, Users, ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarCpf, indexarPorDocumento, soDigitos } from "@/lib/documento";
import { useColaboradores } from "@/lib/rh-colaboradores-store";
import type { CadastroSecullum } from "@/lib/secullum-server";

type DadosConciliacao = {
  totalSecullum: number;
  demitidos: number;
  ativosSecullum: number;
  semCpf: number;
  emAmbos: number;
  soNaSecullum: { cpf: string; nome: string; numeroFolha: string }[];
  soNoPortal: { id: string; nome: string; cpf: string; matricula: string }[];
};

export function ConciliacaoSecullum({ cadastro }: { cadastro: CadastroSecullum | null }) {
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const carregado = useColaboradores((s) => s.carregado);

  const dados = useMemo<DadosConciliacao | null>(() => {
    if (!cadastro || !carregado) return null;

    const ativosSecullum = cadastro.ativos.filter((p) => p.cpf.length === 11);
    const semCpf = cadastro.ativos.length - ativosSecullum.length;

    const indicePortal = indexarPorDocumento(colaboradores, (c) => c.cpf);
    const indiceSecullum = indexarPorDocumento(ativosSecullum, (p) => p.cpf);

    const emAmbos = ativosSecullum.filter((p) => indicePortal.has(p.cpf));
    const soNaSecullum = ativosSecullum.filter((p) => !indicePortal.has(p.cpf));
    const soNoPortal = colaboradores.filter(
      (c) =>
        c.situacao !== "desligado" &&
        soDigitos(c.cpf).length === 11 &&
        !indiceSecullum.has(soDigitos(c.cpf)),
    );

    return {
      totalSecullum: cadastro.total,
      demitidos: cadastro.demitidos,
      ativosSecullum: ativosSecullum.length,
      semCpf,
      emAmbos: emAmbos.length,
      soNaSecullum,
      soNoPortal,
    };
  }, [cadastro, colaboradores, carregado]);

  if (cadastro?.erro) {
    return (
      <Card className="border-red-200 bg-red-50 p-5">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold text-red-900">
              {cadastro.ehLgpd
                ? "Dados de funcionário bloqueados (LGPD)"
                : "Não foi possível ler os funcionários"}
            </p>
            <p className="mt-1 text-sm text-red-800">{cadastro.erro}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!dados) {
    return (
      <Card className="p-5">
        <div className="space-y-2">
          <div className="h-5 w-64 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo="Ativos na Secullum"
          valor={dados.ativosSecullum}
          detalhe={`${dados.totalSecullum} no total · ${dados.demitidos} demitidos`}
        />
        <Numero rotulo="Nos dois lados" valor={dados.emAmbos} destaque="bom" />
        <Numero
          rotulo="Só na Secullum"
          valor={dados.soNaSecullum.length}
          detalhe="sem colaborador no Portal"
          destaque={dados.soNaSecullum.length > 0 ? "alerta" : undefined}
        />
        <Numero
          rotulo="Só no Portal"
          valor={dados.soNoPortal.length}
          detalhe="não batem ponto"
          destaque={dados.soNoPortal.length > 0 ? "alerta" : undefined}
        />
      </div>

      {dados.semCpf > 0 && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {dados.semCpf} pessoa(s) ativa(s) na Secullum sem CPF válido. Sem CPF não há como
          conciliar — é preciso completar o cadastro lá.
        </Card>
      )}

      <Card className="p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#213368]">
          <ArrowLeftRight className="h-4 w-4" /> Como ler isto
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A comparação é por dígitos do CPF, não por texto: a Secullum manda{" "}
          <code>181.272.888-37</code> e o Portal pode ter <code>18127288837</code>. Quem está{" "}
          <strong>só na Secullum</strong> bate ponto e não existe no Portal — é o retrato de quem
          foi cadastrado direto no Ponto Web, e a carga inicial acima resolve. Quem está{" "}
          <strong>só no Portal</strong> está na folha do RH e não bate ponto: pode ser admissão que
          ainda não foi para o Ponto Web, ou alguém que já saiu e não foi desligado aqui.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaDivergencia
          titulo="Só na Secullum"
          vazio="Ninguém — todo mundo que bate ponto tem cadastro no Portal."
          itens={dados.soNaSecullum.map((p) => ({
            chave: p.cpf,
            nome: p.nome,
            detalhe: `${formatarCpf(p.cpf)}${p.numeroFolha ? ` · folha ${p.numeroFolha}` : ""}`,
          }))}
        />
        <ListaDivergencia
          titulo="Só no Portal"
          vazio="Ninguém — todo colaborador ativo está na Secullum."
          itens={dados.soNoPortal.map((c) => ({
            chave: c.id,
            nome: c.nome,
            detalhe: `${formatarCpf(c.cpf)}${c.matricula ? ` · matrícula ${c.matricula}` : ""}`,
          }))}
        />
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  destaque,
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
  destaque?: "bom" | "alerta";
}) {
  const cor =
    destaque === "alerta"
      ? "text-amber-600"
      : destaque === "bom"
        ? "text-emerald-600"
        : "text-[#213368]";
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={`text-2xl font-bold leading-tight ${cor}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-muted-foreground">{detalhe}</p>}
    </Card>
  );
}

function ListaDivergencia({
  titulo,
  vazio,
  itens,
}: {
  titulo: string;
  vazio: string;
  itens: { chave: string; nome: string; detalhe: string }[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#213368]">
          <Users className="h-4 w-4" /> {titulo}
        </p>
        <Badge variant="outline">{itens.length}</Badge>
      </div>
      {itens.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto">
          {itens.map((i) => (
            <li key={i.chave} className="px-4 py-2">
              <p className="text-sm font-medium text-[#213368]">{i.nome || "(sem nome)"}</p>
              <p className="text-xs text-muted-foreground">{i.detalhe}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
