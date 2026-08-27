// ============================================================
// CPF e CNPJ — formatar, limpar e comparar
// ------------------------------------------------------------
// A API da Secullum trafega documento FORMATADO, com ponto, barra e
// hífen: "181.272.888-37" e "13.553.331/0001-09". O Portal guarda de
// jeitos diferentes conforme a origem — o cadastro de EPIs gravou com
// máscara, o formulário público do site grava o que a pessoa digitou.
//
// Comparar string crua entre os dois lados é o erro que faz uma pessoa
// já cadastrada virar duplicata: "18127288837" e "181.272.888-37" são
// a mesma pessoa e nunca vão ser iguais em ===.
//
// Regra deste arquivo, e do módulo inteiro:
//   COMPARAR sempre por `soDigitos`.
//   ENVIAR para a Secullum sempre por `formatarCpf`/`formatarCnpj`.
//   GUARDAR no Portal como veio, sem reescrever cadastro alheio.
// ============================================================

/** Tira tudo que não é dígito. É a forma canônica de comparação. */
export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** 18127288837 → "181.272.888-37". Devolve como veio se não tiver 11 dígitos. */
export function formatarCpf(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length !== 11) return valor ?? "";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** 13553331000109 → "13.553.331/0001-09". Devolve como veio se não tiver 14 dígitos. */
export function formatarCnpj(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length !== 14) return valor ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Formata pelo tamanho: 11 dígitos vira CPF, 14 vira CNPJ. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length === 11) return formatarCpf(d);
  if (d.length === 14) return formatarCnpj(d);
  return valor ?? "";
}

/**
 * A comparação que vale. Dois documentos são o mesmo quando os dígitos
 * batem — máscara não entra na conta.
 */
export function mesmoDocumento(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const da = soDigitos(a);
  const db = soDigitos(b);
  return da.length > 0 && da === db;
}

/** Só o formato; a validação dos dígitos verificadores é rh_regras.cpfValido. */
export function ehCpfCompleto(valor: string | null | undefined): boolean {
  return soDigitos(valor).length === 11;
}

export function ehCnpjCompleto(valor: string | null | undefined): boolean {
  return soDigitos(valor).length === 14;
}

/**
 * Índice por dígitos, para conciliar duas listas sem laço aninhado.
 * Chave é sempre `soDigitos`; quem não tem documento fica de fora,
 * porque documento vazio casaria com todo mundo.
 */
export function indexarPorDocumento<T>(
  itens: T[],
  extrair: (item: T) => string | null | undefined,
): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = soDigitos(extrair(item));
    if (!chave) continue;
    const atual = mapa.get(chave);
    if (atual) atual.push(item);
    else mapa.set(chave, [item]);
  }
  return mapa;
}
