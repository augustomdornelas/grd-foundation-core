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

// ------------------------------------------------------------
// Formatos devolvidos para a tela
// ------------------------------------------------------------
export type ItemCatalogo = { id: number | null; descricao: string };

export type HorarioResumo = {
  numero: number | null;
  descricao: string;
  desativar: boolean;
};

export type PessoaSecullum = {
  /** Só dígitos — é a chave de conciliação. */
  cpf: string;
  nome: string;
  numeroFolha: string;
  ativo: boolean;
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

export type PessoasSecullum = {
  erro: string | null;
  ehLgpd: boolean;
  total: number;
  pessoas: PessoaSecullum[];
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
// Pessoas — só o necessário para conciliar
// ------------------------------------------------------------
export const obterPessoasSecullum = createServerFn({ method: "GET" }).handler(
  async (): Promise<PessoasSecullum> => {
    const { lerConfig, secullum, SecullumErro, chaveDeDocumento } =
      await import("@/lib/secullum-client");

    const config = lerConfig();
    if (!config) {
      return {
        erro: "Integração não configurada no servidor.",
        ehLgpd: false,
        total: 0,
        pessoas: [],
      };
    }

    try {
      const lista = await secullum.funcionarios(config);
      return {
        erro: null,
        ehLgpd: false,
        total: lista?.length ?? 0,
        // Vai para a tela só o que a conciliação precisa. Endereço,
        // RG e telefone ficam na Secullum: o Portal não tem o que
        // fazer com eles hoje, e dado pessoal que não é usado é dado
        // pessoal que não devia trafegar.
        pessoas: (lista ?? []).map((f) => ({
          cpf: chaveDeDocumento(f.Cpf),
          nome: f.Nome ?? "",
          numeroFolha: f.NumeroFolha ?? "",
          ativo: !f.Demissao,
        })),
      };
    } catch (e) {
      const erro = e instanceof SecullumErro ? e : null;
      return {
        erro: erro?.message ?? (e instanceof Error ? e.message : String(e)),
        ehLgpd: erro?.ehLgpd ?? false,
        total: 0,
        pessoas: [],
      };
    }
  },
);
