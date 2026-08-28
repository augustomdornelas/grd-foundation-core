// ============================================================
// Carga inicial Secullum → Portal — a tela
// ------------------------------------------------------------
// Roda UMA VEZ. Traz para o cadastro do Portal os ativos que hoje só
// existem no Ponto Web (19 dos 20, na medição de 27/08/2026).
//
// TRÊS COISAS QUE ESTA TELA GARANTE, E POR QUÊ
//
// 1. NADA GRAVA SEM PRÉ-VISUALIZAÇÃO. O botão abre uma tabela com o
//    que vai ser criado, linha a linha, e cada linha pode ser
//    desmarcada. É cadastro de pessoa entrando num sistema que já tem
//    dono — não é operação para acontecer atrás de um spinner.
//
// 2. A GRAVAÇÃO É DA SESSÃO DO RH, e não de uma chave de serviço. Vai
//    pela RLS de `funcionarios`, que exige `rh_pode_editar()`. Se um
//    dia esta tela abrir para outro perfil, o banco continua sendo
//    quem recusa.
//
// 3. IDEMPOTENTE. A chave é o CPF em dígitos: quem já está no Portal
//    nem aparece na lista. Clicar duas vezes não duplica ninguém, o
//    que importa porque uma carga de 19 linhas pode falhar no meio.
//
// O QUE ELA NÃO FAZ: não cria ninguém na Secullum, então não consome
// licença do plano. O sentido é só de lá para cá.
// ============================================================
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  AlertTriangle,
  Info,
  Building2,
  Briefcase,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { upperizePayload } from "@/lib/utils";
import { formatarCpf } from "@/lib/documento";
import { dataBr } from "@/lib/rh-regras";
import {
  planejarCarga,
  montarFuncionario,
  type LinhaCarga,
  type PessoaImportavel,
} from "@/lib/secullum-carga";
import { useColaboradores, recarregarColaboradores } from "@/lib/rh-colaboradores-store";
import { useRhCatalogos, recarregarCatalogosRh } from "@/lib/rh-catalogos-store";
import { useProjetosStore, recarregarProjetos } from "@/lib/projetos-store";

export function CargaInicialSecullum({
  ativos,
  camposAusentes,
}: {
  ativos: PessoaImportavel[];
  camposAusentes: string[];
}) {
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const portalCarregado = useColaboradores((s) => s.carregado);
  const cargos = useRhCatalogos((s) => s.cargos);
  const catalogosCarregados = useRhCatalogos((s) => s.carregado);
  const projetos = useProjetosStore((s) => s.projetos);
  const projetosCarregados = useProjetosStore((s) => s.carregado);

  const [aberto, setAberto] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  // Os TRÊS lados precisam ter chegado, não só o dos colaboradores.
  // `projetos` e `cargos` vazios significam coisas opostas conforme o
  // momento: "não há obra cadastrada" ou "o fetch ainda está em voo".
  // Planejar em cima do segundo marcaria TODO departamento como "obra
  // nova", e confirmar nessa janela criaria obra duplicada — projetos
  // não tem unique em nome para segurar o estrago depois.
  const plano = useMemo(() => {
    if (!portalCarregado || !projetosCarregados || !catalogosCarregados) return null;
    return planejarCarga({
      pessoas: ativos,
      colaboradores: colaboradores.map((c) => ({
        id: c.id,
        nome: c.nome,
        cpf: c.cpf,
        matricula: c.matricula,
      })),
      obras: projetos.map((p) => ({ id: p.id, nome: p.nome })),
      cargos: cargos.map((c) => ({ id: c.id, nome: c.nome })),
    });
  }, [
    ativos,
    colaboradores,
    portalCarregado,
    projetos,
    projetosCarregados,
    cargos,
    catalogosCarregados,
  ]);

  /** Marcada = sem impedimento e não desmarcada à mão. */
  const marcada = useCallback(
    (l: LinhaCarga) => l.impedimentos.length === 0 && !desmarcados.has(l.pessoa.cpf),
    [desmarcados],
  );

  const selecionadas = useMemo(() => (plano ? plano.linhas.filter(marcada) : []), [plano, marcada]);

  const alternar = (cpf: string) => {
    setDesmarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(cpf)) proximo.delete(cpf);
      else proximo.add(cpf);
      return proximo;
    });
  };

  // ------------------------------------------------------------
  // A gravação
  // ------------------------------------------------------------
  const importar = useCallback(async () => {
    if (selecionadas.length === 0) return;
    setGravando(true);
    try {
      const resultado = await gravarCarga(selecionadas);
      if (resultado.criados > 0) {
        toast.success(
          `${resultado.criados} colaborador(es) importado(s) da Secullum.` +
            (resultado.obrasCriadas.length
              ? ` Obras criadas: ${resultado.obrasCriadas.join(", ")}.`
              : "") +
            (resultado.cargosCriados.length
              ? ` Cargos criados: ${resultado.cargosCriados.join(", ")}.`
              : ""),
        );
      }
      if (resultado.falhas.length > 0) {
        toast.error(
          `${resultado.falhas.length} linha(s) não entraram: ${resultado.falhas.slice(0, 3).join(" · ")}`,
        );
      }
      // Projetos entra na lista porque a carga cria obra: sem este
      // recarregamento o store fica sem a obra recém-nascida, e uma
      // segunda execução na mesma sessão — o cenário previsto quando a
      // primeira falha no meio — a criaria de novo, duplicada.
      await Promise.all([recarregarColaboradores(), recarregarCatalogosRh(), recarregarProjetos()]);
      setDesmarcados(new Set());
      setAberto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGravando(false);
    }
  }, [selecionadas]);

  // ------------------------------------------------------------
  // Estados de tela
  // ------------------------------------------------------------
  if (!plano) {
    return (
      <Card className="p-5">
        <div className="h-5 w-72 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  // Zero ativos com a conexão de pé não é carga concluída: é a
  // Secullum dizendo que não há ninguém batendo ponto. Dizer
  // "concluída" aqui esconderia um problema de configuração.
  if (ativos.length === 0) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        A Secullum não devolveu nenhum funcionário ativo. Não há o que importar — confira o banco
        selecionado e o cadastro no Ponto Web antes de concluir que está tudo certo.
      </Card>
    );
  }

  if (plano.linhas.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-900">Carga inicial concluída</p>
            <p className="mt-1 text-sm text-emerald-800">
              Todos os {plano.jaExistem} ativos da Secullum já têm colaborador no Portal. A partir
              daqui o sentido se inverte: o Portal passa a ser o dono do cadastro, e toda admissão
              nova vai do Portal para a Secullum.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const bloqueadas =
    plano.linhas.length - plano.linhas.filter((l) => !l.impedimentos.length).length;

  return (
    <>
      <Card className="border-amber-200 bg-amber-50 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-900">
              {plano.linhas.length} pessoa(s) batem ponto e não existem no cadastro do Portal
            </p>
            <p className="mt-1 text-sm text-amber-800">
              O módulo de RH está praticamente vazio. Antes de o Portal poder empurrar admissões
              para a Secullum, é preciso trazer de lá quem já está trabalhando — uma única vez.
              Importar <strong>não cria ninguém na Secullum</strong> e portanto{" "}
              <strong>não consome licença</strong> do plano.
            </p>
            <p className="mt-2 text-xs text-amber-800">
              {plano.jaExistem} já no Portal · {plano.obrasNovas.length} obra(s) a criar ·{" "}
              {plano.cargosNovos.length} cargo(s) a criar
              {bloqueadas > 0 ? ` · ${bloqueadas} linha(s) impedida(s)` : ""}
              {plano.semCpf > 0 ? ` · ${plano.semCpf} sem CPF válido na Secullum` : ""}
            </p>
          </div>
          <Button onClick={() => setAberto(true)} className="shrink-0">
            <Download className="mr-1.5 h-4 w-4" />
            Importar colaboradores da Secullum
          </Button>
        </div>
      </Card>

      <Dialog open={aberto} onOpenChange={(v) => !gravando && setAberto(v)}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b p-6 pb-4">
            <DialogTitle>Pré-visualização da carga inicial</DialogTitle>
            <DialogDescription>
              Nada é gravado até você confirmar. Desmarque qualquer linha que não deva entrar. A
              matrícula é o número de folha da Secullum, reaproveitado — o Portal não gera um novo.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] overflow-y-auto px-6">
            {camposAusentes.length > 0 && (
              <Card className="mt-4 border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mr-1.5 inline h-4 w-4" />A Secullum não devolveu{" "}
                <strong>{camposAusentes.join(", ")}</strong> em nenhum registro. O payload deles
                mudou; o mapeamento precisa de ajuste antes que estas colunas signifiquem alguma
                coisa.
              </Card>
            )}

            {(plano.obrasNovas.length > 0 || plano.cargosNovos.length > 0) && (
              <Card className="mt-4 p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-[#213368]">
                  <Info className="h-4 w-4" /> O que vai nascer junto
                </p>
                {plano.obrasNovas.length > 0 && (
                  <p className="mt-1.5 text-muted-foreground">
                    <Building2 className="mr-1 inline h-3.5 w-3.5" />
                    <strong>Obras:</strong> {plano.obrasNovas.join(", ")} — criadas só com o nome,
                    marcadas como vindas da Secullum. Sem cliente, contrato nem prazo: a Engenharia
                    completa depois.
                  </p>
                )}
                {plano.cargosNovos.length > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    <Briefcase className="mr-1 inline h-3.5 w-3.5" />
                    <strong>Cargos:</strong> {plano.cargosNovos.join(", ")} — sem CBO, NR exigida
                    nem EPI padrão. Enquanto ficarem assim, a regra de aptidão para alocação não
                    exige nada deles.
                  </p>
                )}
              </Card>
            )}

            <Table className="mt-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-36">CPF</TableHead>
                  <TableHead className="w-24">Matrícula</TableHead>
                  <TableHead className="w-28">Admissão</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Cargo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plano.linhas.map((l) => {
                  const impedida = l.impedimentos.length > 0;
                  return (
                    <TableRow key={l.pessoa.cpf} className={impedida ? "opacity-60" : ""}>
                      <TableCell>
                        <Checkbox
                          checked={marcada(l)}
                          disabled={impedida || gravando}
                          onCheckedChange={() => alternar(l.pessoa.cpf)}
                          aria-label={`Importar ${l.pessoa.nome}`}
                        />
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium text-[#213368]">
                          {l.pessoa.nome || "(sem nome)"}
                        </p>
                        {l.impedimentos.map((m) => (
                          <p key={m} className="mt-0.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            {m}
                          </p>
                        ))}
                        {l.avisos.map((m) => (
                          <p key={m} className="mt-0.5 text-xs text-amber-700">
                            {m}
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatarCpf(l.pessoa.cpf)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{l.matricula || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {l.pessoa.admissao ? dataBr(l.pessoa.admissao) : "—"}
                      </TableCell>
                      <TableCell>
                        <Vinculo existente={l.projetoNome} novo={l.obraNova} />
                      </TableCell>
                      <TableCell>
                        <Vinculo existente={l.cargoNome} novo={l.cargoNovo} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="items-center justify-between gap-3 border-t p-6 pt-4 sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <strong className="text-[#213368]">{selecionadas.length}</strong> de{" "}
              {plano.linhas.length} marcada(s)
              {bloqueadas > 0 && ` · ${bloqueadas} impedida(s) pelo banco`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setAberto(false)} disabled={gravando}>
                Cancelar
              </Button>
              <Button onClick={() => void importar()} disabled={gravando || !selecionadas.length}>
                {gravando ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando...
                  </>
                ) : (
                  `Importar ${selecionadas.length} colaborador(es)`
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Vinculo({ existente, novo }: { existente: string; novo: string | null }) {
  if (novo) {
    return (
      <span className="flex items-center gap-1.5">
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
          nova
        </Badge>
        <span className="text-sm">{novo}</span>
      </span>
    );
  }
  return <span className="text-sm">{existente || "—"}</span>;
}

// ============================================================
// A gravação, em quatro passos
// ============================================================
type ResultadoCarga = {
  criados: number;
  obrasCriadas: string[];
  cargosCriados: string[];
  falhas: string[];
};

/**
 * A ORDEM IMPORTA e não é arbitrária: obra e cargo primeiro, porque
 * `funcionarios.projeto_id` e `funcionarios.cargo_id` são chaves
 * estrangeiras. Inserir a pessoa antes deixaria o vínculo nulo, e
 * ninguém voltaria depois para preencher.
 *
 * Os colaboradores entram em UM insert só: 19 linhas numa transação do
 * PostgREST, tudo ou nada. Inserir um a um deixaria metade dentro se a
 * rede caísse no meio — recuperável, porque a carga é idempotente, mas
 * confuso de auditar.
 */
async function gravarCarga(linhas: LinhaCarga[]): Promise<ResultadoCarga> {
  const obrasCriadas: string[] = [];
  const cargosCriados: string[] = [];
  const falhas: string[] = [];

  // ---------- 1. Obras ----------
  const idPorObra = new Map<string, string>();
  for (const nome of [...new Set(linhas.map((l) => l.obraNova).filter(Boolean))] as string[]) {
    const id = crypto.randomUUID();
    const { error } = await supabase.from("projetos").insert(
      upperizePayload({
        id,
        nome,
        status: "EM ANDAMENTO",
        descricao: "Obra criada pela carga inicial da Secullum. Cadastro a completar.",
        origem_secullum: true,
      }),
    );
    if (error) {
      falhas.push(`obra ${nome}: ${error.message}`);
      continue;
    }
    idPorObra.set(nome, id);
    obrasCriadas.push(nome);
  }

  // ---------- 2. Cargos ----------
  const idPorCargo = new Map<string, string>();
  for (const nome of [...new Set(linhas.map((l) => l.cargoNovo).filter(Boolean))] as string[]) {
    const { data, error } = await supabase
      .from("rh_cargos")
      .insert({ nome, origem_secullum: true })
      .select("id")
      .single();
    if (error) {
      // 23505 = já existe um cargo com este nome. Acontece quando duas
      // pessoas do RH rodam a carga ao mesmo tempo, ou quando o cargo
      // nasceu entre o planejamento e o clique. Reaproveita em vez de
      // falhar: o objetivo é o vínculo existir, não este INSERT vencer.
      if (error.code === "23505") {
        const { data: achado } = await supabase
          .from("rh_cargos")
          .select("id")
          .ilike("nome", nome)
          .limit(1)
          .maybeSingle();
        const id = (achado as { id?: string } | null)?.id;
        if (id) {
          idPorCargo.set(nome, id);
          continue;
        }
      }
      falhas.push(`cargo ${nome}: ${error.message}`);
      continue;
    }
    idPorCargo.set(nome, String((data as { id: string }).id));
    cargosCriados.push(nome);
  }

  // ---------- 3. Colaboradores ----------
  const prontas = linhas.filter(
    // Linha cuja obra ou cargo não conseguiu nascer fica de fora: entrar
    // sem lotação é pior que não entrar, porque some do dashboard sem
    // ninguém perceber.
    (l) =>
      (!l.obraNova || idPorObra.has(l.obraNova)) && (!l.cargoNovo || idPorCargo.has(l.cargoNovo)),
  );
  for (const l of linhas) {
    if (!prontas.includes(l)) {
      falhas.push(`${l.pessoa.nome}: obra ou cargo não pôde ser criado`);
    }
  }
  if (prontas.length === 0) {
    return { criados: 0, obrasCriadas, cargosCriados, falhas };
  }

  const registros = prontas.map((l) =>
    montarFuncionario(l, {
      projetoId: l.projetoId ?? (l.obraNova ? (idPorObra.get(l.obraNova) ?? null) : null),
      cargoId: l.cargoId ?? (l.cargoNovo ? (idPorCargo.get(l.cargoNovo) ?? null) : null),
    }),
  );

  const { error: erroInsert } = await supabase.from("funcionarios").insert(registros);
  if (erroInsert) {
    throw new Error(
      `Nenhum colaborador foi criado — o banco recusou o lote: ${erroInsert.message}. ` +
        "Nada ficou pela metade; corrija e rode de novo.",
    );
  }

  // ---------- 4. O registro no diário ----------
  // Falha aqui NÃO desfaz a carga: os colaboradores já estão no banco e
  // apagá-los seria pior que ficar sem a linha de diário. Vira aviso.
  const { error: erroDiario } = await supabase.from("secullum_sync").insert({
    tipo: "carga_inicial",
    status: "ok",
    terminado_em: new Date().toISOString(),
    registros: prontas.length,
    requisicoes: 0,
    detalhe:
      `carga inicial: ${prontas.length} colaborador(es) criado(s) a partir da Secullum` +
      (obrasCriadas.length ? ` · obras criadas: ${obrasCriadas.join(", ")}` : "") +
      (cargosCriados.length ? ` · cargos criados: ${cargosCriados.join(", ")}` : "") +
      ` · CPFs: ${prontas.map((l) => l.pessoa.cpf).join(", ")}`,
  });
  if (erroDiario) {
    falhas.push(`diário não registrado: ${erroDiario.message}`);
  }

  return { criados: prontas.length, obrasCriadas, cargosCriados, falhas };
}
