// ============================================================
// Carga inicial Secullum → Portal — o plano, sem efeito colateral
// ------------------------------------------------------------
// Este arquivo NÃO grava nada. Ele recebe os dois lados e devolve o
// que aconteceria, linha a linha. Quem grava é a tela, depois de o RH
// olhar e confirmar.
//
// A separação é o que torna a pré-visualização honesta: a tela mostra
// exatamente o objeto que a gravação vai usar, e não uma aproximação
// escrita à parte que pode divergir do que de fato acontece.
//
// POR QUE ESTA CARGA EXISTE, E POR QUE SÓ UMA VEZ
//
// A conciliação de 27/08/2026: 20 ativos na Secullum, 1 nos dois
// lados, 19 só na Secullum, ZERO só no Portal. O módulo de RH está
// praticamente vazio — dezenove pessoas batem ponto e não existem no
// cadastro. O desenho final continua sendo o Portal como dono do
// cadastro, empurrando admissão para a Secullum; só que hoje não há o
// que empurrar.
//
// Depois desta carga a direção se inverte de vez, e este arquivo vira
// história.
//
// IDEMPOTÊNCIA
// A chave é o CPF em dígitos. Quem já existe no Portal não é planejado
// de novo — não vira linha, vira contagem. Rodar duas vezes não
// duplica ninguém, e é por isso que o botão pode ser clicado sem medo
// depois de uma falha no meio.
// ============================================================

import { chaveDeNome } from "@/lib/secullum-formato";
import { soDigitos } from "@/lib/documento";
import { cpfValido } from "@/lib/rh-regras";

// ------------------------------------------------------------
// O que vem de cada lado
// ------------------------------------------------------------
/** Uma pessoa ativa na Secullum, já normalizada pelo servidor. */
export type PessoaImportavel = {
  /** `Id` na Secullum. É o vínculo permanente entre os dois cadastros. */
  secullumId: number | null;
  /** Só dígitos. A API manda "181.272.888-37". */
  cpf: string;
  nome: string;
  /** `NumeroFolha` — vira a matrícula do Portal. Nunca geramos uma nova. */
  numeroFolha: string;
  admissao: string | null;
  /** Descrição do departamento; na conta da GRD, departamento é a OBRA. */
  departamento: string;
  /** Descrição da função; corresponde ao cargo do Portal. */
  funcao: string;
  horarioNumero: number | null;
};

/** O mínimo que a carga precisa saber de quem já está no Portal. */
export type ColaboradorExistente = {
  id: string;
  nome: string;
  cpf: string;
  matricula: string;
};

export type ObraExistente = { id: string; nome: string };
export type CargoExistente = { id: string; nome: string };

// ------------------------------------------------------------
// O plano
// ------------------------------------------------------------
export type LinhaCarga = {
  pessoa: PessoaImportavel;
  /** `NumeroFolha` reaproveitado. Vazio quando a Secullum não tem um. */
  matricula: string;
  /** Obra do Portal que casou por nome. */
  projetoId: string | null;
  projetoNome: string;
  /** Nome da obra que precisa nascer para esta linha ter lotação. */
  obraNova: string | null;
  cargoId: string | null;
  cargoNome: string;
  cargoNovo: string | null;
  /** Impede a gravação desta linha. O banco recusaria de qualquer forma. */
  impedimentos: string[];
  /** Não impede: a linha grava, mas o RH precisa saber. */
  avisos: string[];
};

export type PlanoCarga = {
  linhas: LinhaCarga[];
  /** Já estavam no Portal — a idempotência em número. */
  jaExistem: number;
  /** Ativos da Secullum sem CPF de 11 dígitos: não há como conciliar. */
  semCpf: number;
  /** Nomes de obra que a carga criaria (sem repetição). */
  obrasNovas: string[];
  /** Nomes de cargo que a carga criaria (sem repetição). */
  cargosNovos: string[];
};

/**
 * Monta o plano. Puro: mesma entrada, mesma saída, nenhuma escrita.
 */
export function planejarCarga(entrada: {
  pessoas: PessoaImportavel[];
  colaboradores: ColaboradorExistente[];
  obras: ObraExistente[];
  cargos: CargoExistente[];
}): PlanoCarga {
  const { pessoas, colaboradores, obras, cargos } = entrada;

  // Índices do lado do Portal. CPF por dígitos, matrícula por texto
  // exato — é assim que o índice único do banco compara.
  const cpfNoPortal = new Set<string>();
  const matriculaNoPortal = new Map<string, string>();
  for (const c of colaboradores) {
    const d = soDigitos(c.cpf);
    if (d) cpfNoPortal.add(d);
    const m = (c.matricula ?? "").trim();
    if (m) matriculaNoPortal.set(m, c.nome);
  }

  const obraPorNome = new Map<string, ObraExistente>();
  for (const o of obras) {
    const k = chaveDeNome(o.nome);
    if (k && !obraPorNome.has(k)) obraPorNome.set(k, o);
  }
  const cargoPorNome = new Map<string, CargoExistente>();
  for (const c of cargos) {
    const k = chaveDeNome(c.nome);
    if (k && !cargoPorNome.has(k)) cargoPorNome.set(k, c);
  }

  // Repetições DENTRO do próprio lote. Uma pessoa cadastrada duas
  // vezes no Ponto Web, ou dois números de folha iguais, passariam
  // pelas checagens contra o Portal e só quebrariam na hora de gravar
  // — com metade do lote já dentro do banco.
  const vezesCpf = new Map<string, number>();
  const vezesFolha = new Map<string, number>();
  let semCpf = 0;
  for (const p of pessoas) {
    const d = soDigitos(p.cpf);
    if (d.length !== 11) {
      semCpf += 1;
      continue;
    }
    vezesCpf.set(d, (vezesCpf.get(d) ?? 0) + 1);
    const f = (p.numeroFolha ?? "").trim();
    if (f) vezesFolha.set(f, (vezesFolha.get(f) ?? 0) + 1);
  }

  let jaExistem = 0;
  const linhas: LinhaCarga[] = [];
  const obrasNovas = new Set<string>();
  const cargosNovos = new Set<string>();

  for (const pessoa of pessoas) {
    const cpf = soDigitos(pessoa.cpf);
    if (cpf.length !== 11) continue; // contado em semCpf
    if (cpfNoPortal.has(cpf)) {
      jaExistem += 1;
      continue;
    }

    const impedimentos: string[] = [];
    const avisos: string[] = [];

    // O banco tem CHECK rh_cpf_valido(cpf) em funcionarios. Ele é NOT
    // VALID para a base antiga, mas vale para tudo que entrar de hoje
    // em diante: um CPF com dígito verificador errado derrubaria o
    // INSERT. Melhor descobrir na pré-visualização.
    if (!cpfValido(cpf)) {
      impedimentos.push(
        "CPF com dígito verificador inválido — o banco recusa. Corrija na Secullum.",
      );
    }
    if ((vezesCpf.get(cpf) ?? 0) > 1) {
      impedimentos.push("CPF repetido entre os ativos da Secullum — há cadastro duplicado lá.");
    }

    const matricula = (pessoa.numeroFolha ?? "").trim();
    if (!matricula) {
      avisos.push("Sem número de folha na Secullum: entra sem matrícula (não geramos uma).");
    } else {
      const dono = matriculaNoPortal.get(matricula);
      if (dono) {
        impedimentos.push(
          `A matrícula ${matricula} já é de ${dono} no Portal. Reaproveitar o número de folha criaria duas pessoas com a mesma matrícula.`,
        );
      }
      if ((vezesFolha.get(matricula) ?? 0) > 1) {
        impedimentos.push(`O número de folha ${matricula} se repete entre os ativos da Secullum.`);
      }
    }

    if (!pessoa.admissao) {
      avisos.push("Sem data de admissão na Secullum: o tempo de casa fica em branco.");
    }

    // ---------- Obra ----------
    let projetoId: string | null = null;
    let projetoNome = "";
    let obraNova: string | null = null;
    const depto = (pessoa.departamento ?? "").trim();
    if (!depto) {
      avisos.push("Sem departamento na Secullum: entra sem obra.");
    } else {
      const achada = obraPorNome.get(chaveDeNome(depto));
      if (achada) {
        projetoId = achada.id;
        projetoNome = achada.nome;
      } else {
        obraNova = depto;
        obrasNovas.add(depto);
      }
    }

    // ---------- Cargo ----------
    let cargoId: string | null = null;
    let cargoNome = "";
    let cargoNovo: string | null = null;
    const funcao = (pessoa.funcao ?? "").trim();
    if (!funcao) {
      avisos.push("Sem função na Secullum: entra sem cargo.");
    } else {
      const achado = cargoPorNome.get(chaveDeNome(funcao));
      if (achado) {
        cargoId = achado.id;
        cargoNome = achado.nome;
      } else {
        cargoNovo = funcao;
        cargosNovos.add(funcao);
      }
    }

    linhas.push({
      pessoa: { ...pessoa, cpf },
      matricula,
      projetoId,
      projetoNome,
      obraNova,
      cargoId,
      cargoNome,
      cargoNovo,
      impedimentos,
      avisos,
    });
  }

  linhas.sort((a, b) => a.pessoa.nome.localeCompare(b.pessoa.nome, "pt-BR"));

  return {
    linhas,
    jaExistem,
    semCpf,
    obrasNovas: [...obrasNovas].sort((a, b) => a.localeCompare(b, "pt-BR")),
    cargosNovos: [...cargosNovos].sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}

// ------------------------------------------------------------
// A linha que vai para o banco
// ------------------------------------------------------------
/**
 * O objeto exato do INSERT em `public.funcionarios`. Fica aqui, e não
 * espalhado na tela, para que o que a pré-visualização mostra e o que
 * a gravação faz sejam a mesma coisa.
 *
 * `projetoId` e `cargoId` chegam de fora porque a obra e o cargo podem
 * ter acabado de nascer nesta mesma execução — o plano só sabe o NOME
 * do que falta criar, nunca o id.
 *
 * NÃO passa por `upperizePayload`: o nome vem da Secullum como o RH
 * digitou lá, e a carga não é lugar de reescrever cadastro alheio.
 */
export function montarFuncionario(
  linha: LinhaCarga,
  resolvido: { projetoId: string | null; cargoId: string | null },
): Record<string, unknown> {
  return {
    nome: linha.pessoa.nome,
    cpf: linha.pessoa.cpf,
    matricula: linha.matricula,
    data_admissao: linha.pessoa.admissao,
    // `setor` guarda o texto do departamento mesmo quando a obra casou:
    // é o que a Secullum tem, e é o que permite conferir o De/Para
    // depois sem voltar na API.
    setor: linha.pessoa.departamento,
    cargo: linha.cargoNome || linha.pessoa.funcao,
    cargo_id: resolvido.cargoId,
    projeto_id: resolvido.projetoId,
    secullum_id: linha.pessoa.secullumId,
    horario_numero: linha.pessoa.horarioNumero,
    situacao: "ativo",
    ativo: true,
    tipo_contratacao: "clt",
    observacoes: "Importado da Secullum na carga inicial.",
  };
}
