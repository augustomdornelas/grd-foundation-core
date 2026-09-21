// ============================================================
// Bloco de campos de planejamento (6 percentuais).
// Usado no formulário de orçamento e no diálogo de edição do
// projeto — a conta do preview é a mesma nos dois lugares.
//
// Os percentuais somam 100% e incluem imposto e lucro: dividem o
// CONTRATO (no orçamento, o valor do orçamento). O valor em reais ao
// lado de cada um incide sobre essa base, que aparece só para leitura
// — é a mesma de planejamento-execucao.ts (BASE_PERCENTUAIS =
// "contrato").
//
// "Custos planejados" saiu da tela: a coluna planejado_custos continua
// no banco, mas não é mais base de nada.
// ============================================================
import { InputNumero } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  CAMPOS_PCT,
  parseNumeroBR,
  percentualParaTexto,
  somaPercentuais,
  type PlanejamentoForm,
} from "@/lib/planejamento-campos";
import { brl, pct } from "@/lib/formato";

export function PlanejamentoCampos({
  form,
  onChange,
  valorBase,
  rotuloBase = "valor do orçamento",
}: {
  form: PlanejamentoForm;
  onChange: (f: PlanejamentoForm) => void;
  /** Base dos percentuais: o contrato (ou o valor do orçamento). Só leitura. */
  valorBase: number;
  rotuloBase?: string;
}) {
  const soma = somaPercentuais(form);
  // Tolerância de meio centésimo: 20 + 35 + 10 + 1,5 + 23,5 + 10 em
  // ponto flutuante não dá 100 exato.
  const fechaCem = Math.abs(soma - 100) < 0.005;

  const set = (chave: keyof PlanejamentoForm, valor: string) =>
    onChange({ ...form, [chave]: valor });

  return (
    <div className="space-y-3 rounded-lg border border-[#e6e6ea] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#213368]">Planejamento</span>
        <span className="text-xs text-muted-foreground">
          Base dos percentuais ({rotuloBase}): <b className="text-[#213368]">{brl(valorBase)}</b>
        </span>
      </div>
      {!(valorBase > 0) && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          Sem {rotuloBase} preenchido, os valores em reais ficam zerados — os percentuais incidem
          sobre ele.
        </p>
      )}

      {/* Percentuais, com o equivalente em reais ao lado */}
      <div className="grid gap-2 sm:grid-cols-2">
        {CAMPOS_PCT.map((c) => {
          const pctCampo = parseNumeroBR(form[c.chave]);
          return (
            <div key={c.chave}>
              <Label className="text-xs">{c.rotulo}</Label>
              {/* Percentual aceita até 2 casas mas não força nenhuma:
                  "10" continua "10" ao sair do campo. */}
              <InputNumero
                valor={pctCampo || null}
                onChange={(v) => set(c.chave, percentualParaTexto(v))}
                casas={2}
                casasMin={0}
                sufixo="%"
                placeholder="0"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {valorBase > 0 && pctCampo > 0 ? brl(valorBase * (pctCampo / 100)) : "—"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Soma dos percentuais: o esperado é exatamente 100% */}
      <div
        className={`flex items-center gap-2 rounded-md p-2 text-xs ${
          fechaCem ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
        }`}
      >
        {fechaCem ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" />
        )}
        <span>
          Soma dos percentuais: <b>{pct(soma, 2)}</b>
          {!fechaCem &&
            ` — o esperado é 100%: os percentuais dividem o ${rotuloBase} inteiro, com imposto e lucro. ` +
              (soma > 100 ? "Passou do total." : `Faltam ${pct(100 - soma, 2)} para fechar.`) +
              " Dá para salvar assim mesmo."}
        </span>
      </div>
    </div>
  );
}
