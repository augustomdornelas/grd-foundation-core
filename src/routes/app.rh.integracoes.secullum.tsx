// ============================================================
// /app/rh/integracoes/secullum — o painel da integração
// ------------------------------------------------------------
// Só Diretoria e RH/DP. A tela não fala com a Secullum: ela chama as
// server functions, que rodam no servidor e são as únicas que têm a
// credencial.
//
// A conciliação por CPF é feita AQUI, no navegador, e não no servidor:
// a lista da Secullum vem de lá, a do Portal vem da sessão autenticada
// do RH — que é a única que a RLS de `funcionarios` deixa ler. Cruzar
// os dois no servidor exigiria uma chave de serviço que este sistema
// não tem, e não deveria ter.
//
// Comparação sempre por dígitos: a Secullum manda "181.272.888-37" e o
// Portal pode ter "18127288837". Ver src/lib/documento.ts.
// ============================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  RefreshCw,
  PlugZap,
  ShieldAlert,
  Users,
  Building2,
  Clock,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RhTela } from "@/components/rh/RhTela";
import { PERFIS_RH } from "@/lib/current-user";
import { dataBr } from "@/lib/rh-regras";
import { formatarCpf, indexarPorDocumento, soDigitos } from "@/lib/documento";
import { useColaboradores } from "@/lib/rh-colaboradores-store";
import {
  obterEstadoSecullum,
  obterCatalogosSecullum,
  obterCadastroSecullum,
  type CadastroSecullum,
  type CatalogosSecullum,
  type EstadoIntegracao,
} from "@/lib/secullum-server";
import { CargaInicialSecullum } from "@/components/rh/CargaInicialSecullum";

export const Route = createFileRoute("/app/rh/integracoes/secullum")({
  ssr: false,
  component: PainelSecullum,
});

function PainelSecullum() {
  const [estado, setEstado] = useState<EstadoIntegracao | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogosSecullum | null>(null);
  const [cadastro, setCadastro] = useState<CadastroSecullum | null>(null);
  const [carregando, setCarregando] = useState(false);

  const colaboradores = useColaboradores((s) => s.colaboradores);
  const portalCarregado = useColaboradores((s) => s.carregado);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const e = await obterEstadoSecullum();
    setEstado(e);
    if (e.configurado && !e.erro) {
      const [c, p] = await Promise.all([obterCatalogosSecullum(), obterCadastroSecullum()]);
      setCatalogos(c);
      setCadastro(p);
    } else {
      setCatalogos(null);
      setCadastro(null);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ---------- Conciliação ----------
  const conciliacao = useMemo(() => {
    if (!cadastro || !portalCarregado) return null;

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
  }, [cadastro, colaboradores, portalCarregado]);

  return (
    <RhTela
      titulo="Integração Secullum Ponto Web"
      resumo="O Portal é dono do cadastro; a Secullum é dona do ponto. Esta tela mostra o que já conversa entre os dois e o tamanho da divergência."
      perfis={PERFIS_RH.integracoes}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {estado?.configurado && estado.idBanco && (
              <>
                Banco{" "}
                <span className="font-mono font-semibold text-[#213368]">{estado.idBanco}</span>
              </>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            {carregando ? "Testando..." : "Testar conexão"}
          </Button>
        </div>

        {/* ---------- Estado da conexão ---------- */}
        {!estado ? (
          <Card className="p-6">
            <div className="h-5 w-52 animate-pulse rounded bg-muted" />
          </Card>
        ) : !estado.configurado ? (
          <Card className="border-amber-200 bg-amber-50 p-5">
            <div className="flex gap-3">
              <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-900">
                  Integração não configurada no servidor
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Falta <strong>{estado.faltando}</strong> no ambiente de quem roda o Portal. As
                  credenciais ficam só no servidor — nunca no código, nunca no <code>.env</code> do
                  repositório, que é público.
                </p>
              </div>
            </div>
          </Card>
        ) : estado.erro ? (
          <Card className="border-red-200 bg-red-50 p-5">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div>
                <p className="font-semibold text-red-900">
                  {estado.ehLgpd
                    ? "A Secullum bloqueou o acesso"
                    : "Não foi possível falar com a Secullum"}
                </p>
                <p className="mt-1 text-sm text-red-800">{estado.erro}</p>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#213368]">Conectado</p>
                  {estado.banco && (
                    <div className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                      <Linha
                        rotulo="Empresa"
                        valor={estado.banco.nome || estado.banco.razaoSocial}
                      />
                      <Linha rotulo="Documento" valor={estado.banco.documento} />
                      <Linha rotulo="Plano" valor={estado.banco.plano} />
                      <Linha rotulo="Validade" valor={dataBr(estado.banco.validade)} />
                      {estado.banco.modoTeste && (
                        <Linha rotulo="Modo teste" valor="SIM — cuidado ao enviar dado real" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* ---------- Trava de licença ---------- */}
            {estado.licenca && <CartaoLicenca licenca={estado.licenca} />}

            {/* ---------- Etapa 0: a carga inicial ---------- */}
            {/* Fica ANTES das abas, e não dentro de uma delas, de
                propósito: enquanto houver gente batendo ponto fora do
                cadastro do Portal, é o assunto mais importante desta
                tela. Some sozinho quando a carga termina. */}
            {cadastro && !cadastro.erro && (
              <CargaInicialSecullum
                ativos={cadastro.ativos}
                camposAusentes={cadastro.camposAusentes}
              />
            )}

            {/* ---------- Dados ---------- */}
            <Tabs defaultValue="conciliacao">
              <TabsList className="w-full flex-wrap">
                <TabsTrigger value="conciliacao" className="flex-1">
                  Conciliação por CPF
                </TabsTrigger>
                <TabsTrigger value="departamentos" className="flex-1">
                  Obras {catalogos ? `(${catalogos.departamentos.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="funcoes" className="flex-1">
                  Funções {catalogos ? `(${catalogos.funcoes.length})` : ""}
                </TabsTrigger>
                <TabsTrigger value="horarios" className="flex-1">
                  Horários {catalogos ? `(${catalogos.horarios.length})` : ""}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="conciliacao" className="mt-4">
                <Conciliacao dados={conciliacao} cadastro={cadastro} carregado={portalCarregado} />
              </TabsContent>

              <TabsContent value="departamentos" className="mt-4">
                <CartaoCatalogo
                  icone={Building2}
                  titulo="Departamentos na Secullum"
                  explicacao="Na conta da GRD, departamento é a OBRA. É por aqui que a alocação do Portal vai se ligar ao ponto."
                  itens={catalogos?.departamentos ?? []}
                />
              </TabsContent>

              <TabsContent value="funcoes" className="mt-4">
                <CartaoCatalogo
                  icone={Briefcase}
                  titulo="Funções na Secullum"
                  explicacao="Correspondem aos cargos do Portal. Nomes que não baterem vão precisar de um De/Para na sincronização."
                  itens={catalogos?.funcoes ?? []}
                />
              </TabsContent>

              <TabsContent value="horarios" className="mt-4">
                <Card className="overflow-hidden">
                  <div className="border-b p-4">
                    <p className="flex items-center gap-2 font-semibold text-[#213368]">
                      <Clock className="h-4 w-4" /> Horários
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Só número, descrição e situação. O payload completo da Secullum passa de 80 KB
                      e o resto não é usado aqui.
                    </p>
                  </div>
                  {!catalogos ? (
                    <div className="p-4">
                      <div className="h-8 animate-pulse rounded bg-muted" />
                    </div>
                  ) : catalogos.horarios.length === 0 ? (
                    <p className="p-6 text-center text-sm text-muted-foreground">Nenhum horário.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Número</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-32">Situação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {catalogos.horarios.map((h) => (
                          <TableRow key={`${h.numero}-${h.descricao}`}>
                            <TableCell className="font-mono text-xs">{h.numero ?? "—"}</TableCell>
                            <TableCell className="text-sm">{h.descricao || "—"}</TableCell>
                            <TableCell>
                              <Badge
                                variant={h.desativar ? "outline" : "default"}
                                className={
                                  h.desativar
                                    ? "text-muted-foreground"
                                    : "bg-emerald-100 text-emerald-800"
                                }
                              >
                                {h.desativar ? "desativado" : "ativo"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </RhTela>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground">{rotulo}:</span>
      <span className="font-medium">{valor || "—"}</span>
    </div>
  );
}

// ------------------------------------------------------------
// Trava de licença
// ------------------------------------------------------------
function CartaoLicenca({ licenca }: { licenca: NonNullable<EstadoIntegracao["licenca"]> }) {
  const cor = !licenca.podeEnviar
    ? "border-red-200 bg-red-50"
    : licenca.perto
      ? "border-amber-200 bg-amber-50"
      : "border-emerald-200 bg-emerald-50";
  const Icone = !licenca.podeEnviar ? ShieldAlert : licenca.perto ? AlertTriangle : CheckCircle2;
  const corIcone = !licenca.podeEnviar
    ? "text-red-600"
    : licenca.perto
      ? "text-amber-600"
      : "text-emerald-600";

  const pct =
    licenca.limite && licenca.emUso !== null
      ? Math.min(100, Math.round((licenca.emUso / licenca.limite) * 100))
      : 0;

  return (
    <Card className={`p-5 ${cor}`}>
      <div className="flex gap-3">
        <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${corIcone}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#213368]">
            Licença do Ponto Web
            {licenca.limite !== null && (
              <span className="ml-2 font-normal">
                {licenca.emUso} de {licenca.limite} pessoas
              </span>
            )}
          </p>
          <p className="mt-1 text-sm">{licenca.mensagem}</p>

          {licenca.limite !== null && (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/70">
              <div
                className={`h-full rounded-full ${
                  !licenca.podeEnviar
                    ? "bg-red-500"
                    : licenca.perto
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            Esta conferência roda antes de todo envio de colaborador. Estourar o limite faria a
            Secullum recusar o cadastro no meio de uma admissão já dada por concluída — por isso o
            bloqueio acontece aqui, e não lá.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------
// Catálogo simples
// ------------------------------------------------------------
function CartaoCatalogo({
  icone: Icone,
  titulo,
  explicacao,
  itens,
}: {
  icone: typeof Building2;
  titulo: string;
  explicacao: string;
  itens: { id: number | null; descricao: string }[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-4">
        <p className="flex items-center gap-2 font-semibold text-[#213368]">
          <Icone className="h-4 w-4" /> {titulo}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{explicacao}</p>
      </div>
      {itens.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Nada devolvido pela Secullum.
        </p>
      ) : (
        <ul className="divide-y">
          {itens.map((i) => (
            <li
              key={`${i.id}-${i.descricao}`}
              className="flex items-center gap-3 px-4 py-2 text-sm"
            >
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                {i.id ?? "—"}
              </span>
              <span className="font-medium text-[#213368]">{i.descricao || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ------------------------------------------------------------
// Conciliação
// ------------------------------------------------------------
type DadosConciliacao = {
  totalSecullum: number;
  demitidos: number;
  ativosSecullum: number;
  semCpf: number;
  emAmbos: number;
  soNaSecullum: { cpf: string; nome: string; numeroFolha: string }[];
  soNoPortal: { id: string; nome: string; cpf: string; matricula: string }[];
};

function Conciliacao({
  dados,
  cadastro,
  carregado,
}: {
  dados: DadosConciliacao | null;
  cadastro: CadastroSecullum | null;
  carregado: boolean;
}) {
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

  if (!dados || !carregado) {
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
          foi cadastrado direto no Ponto Web. Quem está <strong>só no Portal</strong> está na folha
          do RH e não bate ponto.
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
