// ============================================================
// Server functions da Secullum — a ponte entre a tela e a API
// ------------------------------------------------------------
// A tela chama estas funções; elas rodam no servidor e são as únicas
// que enxergam `secullum-client.ts`. Assim a credencial nunca sai do
// servidor e o navegador nunca fala com a Secullum.
//
// O `await import()` dentro de cada handler não é estilo: é o que
// garante que o módulo do cliente da Secullum não entre no grafo do
// bundle do navegador. Import no topo do arquivo dependeria de o
// compilador remover tudo direitinho; o import dinâmico não depende.
//
// A CONCILIAÇÃO NÃO ACONTECE AQUI, e isso é de propósito. Ler a tabela
// `funcionarios` exige a sessão do usuário, que vive no navegador —
// uma server function com a chave anônima veria zero linhas por causa
// da própria RLS. Então o servidor devolve o lado da Secullum, e o
// cruzamento é feito na tela, onde o RH já está autenticado.
// ============================================================

import { createServerFn } from "@tanstack/react-start";
import type { PessoaImportavel } from "@/lib/secullum-carga";

// ------------------------------------------------------------
// Formatos devolvidos para a tela
// ------------------------------------------------------------
export type ItemCatalogo = { id: number | null; descricao: string };

export type HorarioResumo = {
  numero: number | null;
  descricao: string;
  desativar: boolean;
};

export type SituacaoLicencaDto = {
  limite: number | null;
  emUso: number | null;
  restantes: number | null;
  podeEnviar: boolean;
  perto: boolean;
  mensagem: string;
};

export type EstadoIntegracao = {
  configurado: boolean;
  faltando: string;
  idBanco: string;
  erro: string | null;
  ehLgpd: boolean;
  licenca: SituacaoLicencaDto | null;
  banco: {
    nome: string;
    razaoSocial: string;
    documento: string;
    plano: string;
    validade: string;
    modoTeste: boolean;
  } | null;
};

export type CatalogosSecullum = {
  erro: string | null;
  ehLgpd: boolean;
  departamentos: ItemCatalogo[];
  funcoes: ItemCatalogo[];
  empresas: ItemCatalogo[];
  horarios: HorarioResumo[];
};

/** O que a carga inicial precisa: os ativos com o cadastro inteiro. */
export type CadastroSecullum = {
  erro: string | null;
  ehLgpd: boolean;
  /** Todos os registros do endpoint, ativos e demitidos. */
  total: number;
  /** Quantos tinham data de demissão — ficam de fora da carga. */
  demitidos: number;
  ativos: PessoaImportavel[];
  /**
   * Nomes de campo que não foram encontrados em NENHUM registro. É o
   * aviso de que o payload mudou e o mapeamento precisa de ajuste — e
   * aparece na tela, em vez de virar coluna vazia sem explicação.
   */
  camposAusentes: string[];
};

// ------------------------------------------------------------
// Testar conexão e ler a licença
// ------------------------------------------------------------
export const obterEstadoSecullum = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoIntegracao> => {
    const { lerConfig, configuracaoFaltando, verificarLicenca, secullum, SecullumErro } =
      await import("@/lib/secullum-client");
    const { formatarDocumento } = await import("@/lib/documento");

    const config = lerConfig();
    if (!config) {
      return {
        configurado: false,
        faltando: configuracaoFaltando(),
        idBanco: "",
        erro: null,
        ehLgpd: false,
        licenca: null,
        banco: null,
      };
    }

    try {
      const [licenca, bancos] = await Promise.all([
        verificarLicenca(config),
        secullum.listarBancos(config),
      ]);
      const banco = bancos.find((b) => String(b.id) === config.idBanco) ?? bancos[0] ?? null;

      return {
        configurado: true,
        faltando: "",
        idBanco: config.idBanco,
        erro: null,
        ehLgpd: false,
        licenca,
        banco: banco
          ? {
              nome: banco.nome ?? "",
              razaoSocial: banco.razaoSocial ?? "",
              documento: formatarDocumento(banco.documento),
              plano: String(banco.plano ?? ""),
              validade: banco.validade ?? "",
              modoTeste: Boolean(banco.modoTeste),
            }
          : null,
      };
    } catch (e) {
      const erro = e instanceof SecullumErro ? e : null;
      return {
        configurado: true,
        faltando: "",
        idBanco: config.idBanco,
        erro: erro?.message ?? (e instanceof Error ? e.message : String(e)),
        ehLgpd: erro?.ehLgpd ?? false,
        licenca: null,
        banco: null,
      };
    }
  },
);

// ------------------------------------------------------------
// Catálogos
// ------------------------------------------------------------
export const obterCatalogosSecullum = createServerFn({ method: "GET" }).handler(
  async (): Promise<CatalogosSecullum> => {
    const { lerConfig, secullum, SecullumErro } = await import("@/lib/secullum-client");

    const vazio: CatalogosSecullum = {
      erro: null,
      ehLgpd: false,
      departamentos: [],
      funcoes: [],
      empresas: [],
      horarios: [],
    };

    const config = lerConfig();
    if (!config) return { ...vazio, erro: "Integração não configurada no servidor." };

    try {
      const [departamentos, funcoes, empresas, horarios] = await Promise.all([
        secullum.departamentos(config),
        secullum.funcoes(config),
        secullum.empresas(config),
        secullum.horarios(config),
      ]);

      const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v));
      const catalogo = (lista: { Id?: number; Descricao?: string }[]): ItemCatalogo[] =>
        (lista ?? []).map((i) => ({ id: i.Id ?? null, descricao: texto(i.Descricao) }));

      return {
        erro: null,
        ehLgpd: false,
        departamentos: catalogo(departamentos),
        funcoes: catalogo(funcoes),
        empresas: (empresas ?? []).map((e) => ({
          id: e.Id ?? null,
          descricao: texto(e.Descricao),
        })),
        // Só três campos: o payload completo de Horarios passa de 80 KB
        // e nada mais dele é usado por esta tela.
        horarios: (horarios ?? []).map((h) => ({
          numero: h.Numero ?? null,
          descricao: texto(h.Descricao),
          desativar: Boolean(h.Desativar),
        })),
      };
    } catch (e) {
      const erro = e instanceof SecullumErro ? e : null;
      return {
        ...vazio,
        erro: erro?.message ?? (e instanceof Error ? e.message : String(e)),
        ehLgpd: erro?.ehLgpd ?? false,
      };
    }
  },
);

// ------------------------------------------------------------
// Cadastro completo dos ativos — insumo da carga inicial
// ------------------------------------------------------------
/**
 * A única leitura de /Funcionarios que a tela faz. Traz o que vai
 * virar cadastro no Portal: admissão, departamento, função e horário.
 * Endereço, RG e telefone ficam na Secullum — o Portal não tem o que
 * fazer com eles hoje, e dado pessoal que não é usado é dado pessoal
 * que não devia trafegar.
 *
 * DUAS DECISÕES QUE VALEM EXPLICAÇÃO
 *
 * 1. Departamento e função são resolvidos AQUI, contra /Departamentos
 *    e /Funcoes. O endpoint de funcionários entrega ora a descrição
 *    (`DepartamentoDescricao`), ora só o id (`DepartamentoId`) — e o
 *    que a carga precisa é sempre o nome, porque é por nome que ela
 *    casa com a obra do Portal. Resolver no servidor custa duas
 *    chamadas que já eram feitas para a aba de catálogos e evita que a
 *    tela receba um número onde esperava um texto.
 *
 * 2. Só os ATIVOS atravessam. Os 108 demitidos ficam do lado de lá:
 *    importar quem já saiu encheria o cadastro do Portal de gente que
 *    nunca vai bater ponto de novo, e dado pessoal que não é usado é
 *    dado pessoal que não devia trafegar.
 */
export const obterCadastroSecullum = createServerFn({ method: "GET" }).handler(
  async (): Promise<CadastroSecullum> => {
    const { lerConfig, secullum, SecullumErro, chaveDeDocumento } =
      await import("@/lib/secullum-client");
    const { campo, texto, inteiro, data } = await import("@/lib/secullum-formato");

    const vazio: CadastroSecullum = {
      erro: null,
      ehLgpd: false,
      total: 0,
      demitidos: 0,
      ativos: [],
      camposAusentes: [],
    };

    const config = lerConfig();
    if (!config) return { ...vazio, erro: "Integração não configurada no servidor." };

    try {
      const [lista, departamentos, funcoes] = await Promise.all([
        secullum.funcionarios(config),
        secullum.departamentos(config),
        secullum.funcoes(config),
      ]);

      const nomePorId = (itens: { Id?: number; Descricao?: string }[]) => {
        const mapa = new Map<number, string>();
        for (const i of itens ?? []) {
          const id = inteiro(campo(i, "Id", "id"));
          const desc = texto(campo(i, "Descricao", "descricao", "Nome"));
          if (id !== null && desc) mapa.set(id, desc);
        }
        return mapa;
      };
      const deptoPorId = nomePorId(departamentos);
      const funcaoPorId = nomePorId(funcoes);

      /** Descrição direta quando vier; senão, a resolvida pelo id. */
      const descrever = (
        registro: unknown,
        campoDescricao: string[],
        campoId: string[],
        mapa: Map<number, string>,
      ): string => {
        const direta = texto(campo(registro, ...campoDescricao)).trim();
        if (direta && !/^\d+$/.test(direta)) return direta;
        const id = inteiro(campo(registro, ...campoId));
        if (id !== null) return mapa.get(id) ?? "";
        return "";
      };

      // Quais campos o payload não trouxe em registro nenhum. Um
      // `HorarioNumero` ausente em todos é mudança de contrato, não
      // pessoa sem horário — e a diferença precisa aparecer.
      const vistos = { admissao: false, departamento: false, funcao: false, horario: false };

      let demitidos = 0;
      const ativos: PessoaImportavel[] = [];

      for (const f of lista ?? []) {
        const demissao = data(campo(f, "Demissao", "demissao"));
        if (demissao) {
          demitidos += 1;
          continue;
        }

        const admissao = data(campo(f, "Admissao", "admissao"));
        const departamento = descrever(
          f,
          ["DepartamentoDescricao", "Departamento", "departamento"],
          ["DepartamentoId", "departamentoId"],
          deptoPorId,
        );
        const funcao = descrever(
          f,
          ["FuncaoDescricao", "Funcao", "funcao"],
          ["FuncaoId", "funcaoId"],
          funcaoPorId,
        );
        const horarioNumero = inteiro(campo(f, "HorarioNumero", "HorarioId", "horarioId"));

        if (admissao) vistos.admissao = true;
        if (departamento) vistos.departamento = true;
        if (funcao) vistos.funcao = true;
        if (horarioNumero !== null) vistos.horario = true;

        ativos.push({
          secullumId: inteiro(campo(f, "Id", "id")),
          cpf: chaveDeDocumento(texto(campo(f, "Cpf", "cpf"))),
          nome: texto(campo(f, "Nome", "nome")).trim(),
          numeroFolha: texto(campo(f, "NumeroFolha", "numeroFolha")).trim(),
          admissao,
          departamento,
          funcao,
          horarioNumero,
        });
      }

      const camposAusentes: string[] = [];
      if (ativos.length > 0) {
        if (!vistos.admissao) camposAusentes.push("Admissao");
        if (!vistos.departamento) camposAusentes.push("Departamento");
        if (!vistos.funcao) camposAusentes.push("Funcao");
        if (!vistos.horario) camposAusentes.push("HorarioNumero");
      }

      return {
        erro: null,
        ehLgpd: false,
        total: lista?.length ?? 0,
        demitidos,
        ativos,
        camposAusentes,
      };
    } catch (e) {
      const erro = e instanceof SecullumErro ? e : null;
      return {
        ...vazio,
        erro: erro?.message ?? (e instanceof Error ? e.message : String(e)),
        ehLgpd: erro?.ehLgpd ?? false,
      };
    }
  },
);
