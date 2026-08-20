// ============================================================
// Bloco de campos de planejamento (custos + 6 percentuais).
// Usado no formulário de orçamento e no diálogo de edição do
// projeto — a conta do preview é a mesma nos dois lugares.
//
// O valor em reais ao lado de cada percentual incide sobre os
// "custos planejados", que é a base usada por
// planejamento-execucao.ts para montar a coluna Planejado. O
// valor do contrato aparece só como referência.
// ============================================================
import { InputMoeda, InputNumero } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Wand2 } from "lucide-react";
import {
  CAMPOS_PCT, parseNumeroBR, somaPercentuais, custosSugeridos,
  type PlanejamentoForm,
} from "@/lib/planejamento-campos";
import { brl, paraTexto, pct } from "@/lib/formato";

export function PlanejamentoCampos({
  form,
  onChange,
  valorBase,
  rotuloBase = "valor do orçamento",
}: {
  form: PlanejamentoForm;
  onChange: (f: PlanejamentoForm) => void;
  /** Contrato/orçamento — referência e origem da sugestão de custos. */
  valorBase: number;
  rotuloBase?: string;
}) {
  const custos = parseNumeroBR(form.custos);
  const soma = somaPercentuais(form);
  const excedeu = soma > 100;

  const sugestao = custosSugeridos(
    valorBase,
    parseNumeroBR(form.lucroPct),
    parseNumeroBR(form.impostoPct),
  );
  const podeSugerir = sugestao > 0 && Math.abs(sugestao - custos) >= 0.01;

  const set = (chave: keyof PlanejamentoForm, valor: string) =>
    onChange({ ...form, [chave]: valor });

  return (
    <div className="space-y-3 rounded-lg border border-[#e6e6ea] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[#213368]">Planejamento</span>
        <span className="text-xs text-muted-foreground">
          {rotuloBase}: <b className="text-[#213368]">{brl(valorBase)}</b>
        </span>
      </div>

      {/* Custos planejados — base dos percentuais */}
      <div>
        <Label className="text-xs">Custos planejados</Label>
        <div className="flex items-center gap-2">
          {/* O formulário guarda texto (é o formato que vai e volta do
              banco por planejamento-campos), então o campo converte nas
              duas pontas em vez de trocar o tipo do estado inteiro. */}
          <InputMoeda
            valor={custos || null}
            onChange={v => set("custos", paraTexto(v))}
            placeholder="0,00"
          />
          {podeSugerir && (
            <button
              type="button"
              onClick={() => set("custos", paraTexto(sugestao))}
              className="flex shrink-0 items-center gap-1 rounded-md border border-[#213368]/30 px-2 py-1.5 text-xs text-[#213368] hover:bg-[#213368]/5"
              title="Preenche com o valor menos lucro e impostos"
            >
              <Wand2 className="h-3.5 w-3.5" /> {brl(sugestao)}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          É sobre este valor que os percentuais abaixo incidem — a mesma base da aba
          Planejamento × Execução do projeto.
        </p>
      </div>

      {/* Percentuais, com o equivalente em reais ao lado */}
      <div className="grid gap-2 sm:grid-cols-2">
        {CAMPOS_PCT.map(c => {
          const pctCampo = parseNumeroBR(form[c.chave]);
          return (
            <div key={c.chave}>
              <Label className="text-xs">{c.rotulo}</Label>
              {/* Percentual aceita até 2 casas mas não força nenhuma:
                  "10" continua "10" ao sair do campo. */}
              <InputNumero
                valor={pctCampo || null}
                onChange={v => set(c.chave, paraTexto(v).replace(/,00$/, ""))}
                casas={2}
                casasMin={0}
                sufixo="%"
                placeholder="0"
              />
              <p className="mt-0.5 text-xs text-muted-foreground">
                {custos > 0 && pctCampo > 0 ? brl(custos * (pctCampo / 100)) : "—"}
              </p>
            </div>
          );
        })}
      </div>

      {/* Soma dos percentuais */}
      <div
        className={`flex items-center gap-2 rounded-md p-2 text-xs ${
          excedeu ? "bg-amber-50 text-amber-800" : "bg-[#F4F4F4] text-[#213368]"
        }`}
      >
        {excedeu && <AlertTriangle className="h-4 w-4 shrink-0" />}
        <span>
          Soma dos percentuais: <b>{pct(soma, 2)}</b>
          {excedeu && " — passou de 100%. Dá para salvar assim mesmo, só confira se é isso mesmo."}
        </span>
      </div>
    </div>
  );
}
