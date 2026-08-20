// ============================================================
// Campo de valor com vírgula decimal (pt-BR)
// ------------------------------------------------------------
// `type="number"` do navegador não serve aqui: no Chrome em
// português ele recusa a vírgula, e quem digita "1.234,56" perde
// os centavos sem receber nenhum aviso. Este campo é um
// `type="text"` que aceita vírgula enquanto a pessoa digita e
// entrega um NÚMERO para quem chama — é o número que vai para o
// banco, nunca o texto da tela.
//
// Comportamento:
//  - a vírgula é sempre o separador decimal;
//  - o ponto é separador de milhar quando há vírgula na frente
//    ("1.234,56") ou quando aparece mais de uma vez ("1.234.567");
//    sozinho, é a vírgula que o teclado numérico não tem ("12.34");
//  - as casas decimais são limitadas a `casas` enquanto digita;
//  - `casas={0}` é contagem: a parte depois da vírgula é descartada
//    do número (12,5 → 12), nunca grudada nos dígitos;
//  - ao sair do campo o texto é normalizado ("1234,5" → "1.234,50").
// ============================================================
import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { num, paraNumero, paraTexto } from "@/lib/formato";

type Props = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  /** Valor atual. `null` representa campo em branco. */
  valor: number | null | undefined;
  /** Recebe o número pronto para gravar (`null` quando em branco). */
  onChange: (valor: number | null) => void;
  /** Casas decimais aceitas. 0 para contagens inteiras. */
  casas?: number;
  /** Casas exibidas ao sair do campo — por padrão acompanha `casas`. */
  casasMin?: number;
  /** Prefixo dentro do campo. `null` remove (quantidade, percentual). */
  prefixo?: string | null;
  /** Sufixo dentro do campo (ex.: "%", "m²"). */
  sufixo?: string | null;
  permiteNegativo?: boolean;
};

/**
 * Deixa no texto apenas o que forma um número em pt-BR, respeitando
 * o limite de casas decimais. Roda a cada tecla, sobre o texto todo,
 * então colar "R$ 1.234,56" também funciona.
 */
function sanitizar(bruto: string, casas: number, permiteNegativo: boolean): string {
  let t = bruto.replace(/[^\d.,-]/g, "");
  const negativo = permiteNegativo && bruto.trimStart().startsWith("-");
  t = t.replace(/-/g, "");

  // Campo inteiro. O separador continua aparecendo enquanto a pessoa
  // digita — apagá-lo na hora faria "12,5" virar 125, porque a tecla
  // seguinte grudaria nos dígitos que sobraram. O que ele separa é
  // descartado do NÚMERO (ver `ler`), não do texto.
  // O ponto de milhar ("1.234") some antes, senão o corte daria 1.
  if (casas <= 0) {
    // Separador seguido de exatamente 3 dígitos é milhar e some, venha
    // como ponto ou como vírgula: em campo inteiro, "1,234" só pode ser
    // mil duzentos e trinta e quatro. Com 1 ou 2 dígitos depois ("12,5")
    // é decimal, e aí a parte fracionária é o que vai ser descartada.
    t = t.replace(/[.,](?=\d{3}(?:[.,]|$))/g, "");
    const ate = t.search(/[.,]/);
    if (ate < 0) return (negativo ? "-" : "") + t;
    const descartado = t.slice(ate + 1).replace(/[.,]/g, "").slice(0, 2);
    return `${negativo ? "-" : ""}${t.slice(0, ate)},${descartado}`;
  }

  // O ponto é deixado no texto de propósito, sem virar vírgula na hora.
  // Quem decide o que ele significa é `paraNumero`: decimal quando é o
  // único separador (teclado numérico manda "."), milhar quando há
  // vírgula. Converter aqui travaria quem digita "1.234,56" na ordem —
  // o "1." viraria "1," e os dígitos seguintes cairiam nos centavos.
  const corte = t.indexOf(",");
  if (corte >= 0) {
    // Só a primeira vírgula é decimal; o resto é engano de digitação.
    const parteInteira = t.slice(0, corte);
    const parteDecimal = t.slice(corte + 1).replace(/[.,]/g, "").slice(0, casas);
    t = `${parteInteira},${parteDecimal}`;
  }

  return (negativo ? "-" : "") + t;
}

export const InputMoeda = React.forwardRef<HTMLInputElement, Props>(
  (
    {
      valor,
      onChange,
      casas = 2,
      casasMin,
      prefixo = "R$",
      sufixo = null,
      permiteNegativo = false,
      className,
      onBlur,
      ...rest
    },
    ref,
  ) => {
    /** Texto do campo -> número gravável. Campo inteiro trunca. */
    const ler = React.useCallback(
      (t: string) => {
        const n = paraNumero(t);
        if (n === null) return null;
        return casas <= 0 ? Math.trunc(n) : n;
      },
      [casas],
    );

    const [texto, setTexto] = React.useState(() => paraTexto(valor, casas));

    // Guarda o último número que ESTE campo emitiu. Sem isso, o efeito
    // abaixo reescreveria o texto a cada tecla e a vírgula recém-digitada
    // sumiria antes de virar decimal.
    const ultimoEmitido = React.useRef<number | null>(valor ?? null);

    // Reflete valor vindo de fora: reset do formulário, carga do banco,
    // preenchimento automático por outro campo.
    React.useEffect(() => {
      const v = valor ?? null;
      if (v === ultimoEmitido.current) return;
      ultimoEmitido.current = v;
      setTexto(paraTexto(v, casas));
    }, [valor, casas]);

    const aoDigitar = (e: React.ChangeEvent<HTMLInputElement>) => {
      const limpo = sanitizar(e.target.value, casas, permiteNegativo);
      setTexto(limpo);
      const n = ler(limpo);
      ultimoEmitido.current = n;
      onChange(n);
    };

    const aoSair = (e: React.FocusEvent<HTMLInputElement>) => {
      const n = ler(texto);
      ultimoEmitido.current = n;
      setTexto(n === null ? "" : num(n, casas, casasMin ?? casas));
      onBlur?.(e);
    };

    return (
      <div className="relative w-full">
        {prefixo && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefixo}
          </span>
        )}
        <Input
          {...rest}
          ref={ref}
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={aoDigitar}
          onBlur={aoSair}
          className={cn(
            "tabular-nums",
            prefixo && "pl-10",
            sufixo && "pr-9",
            className,
          )}
        />
        {sufixo && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {sufixo}
          </span>
        )}
      </div>
    );
  },
);
InputMoeda.displayName = "InputMoeda";

/**
 * Mesmo campo sem o "R$" — quantidade, metragem, percentual.
 * Continua com 2 casas por padrão, como manda a regra de medidas;
 * passe `casas={0}` para contagem inteira.
 */
export const InputNumero = React.forwardRef<HTMLInputElement, Props>(
  (props, ref) => <InputMoeda {...props} ref={ref} prefixo={props.prefixo ?? null} />,
);
InputNumero.displayName = "InputNumero";
