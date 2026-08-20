// ============================================================
// Campos do cadastro de fornecedor
// ------------------------------------------------------------
// Os mesmos campos aparecem em dois lugares: no popover do
// FornecedorSelect (cadastro rápido, no meio do lançamento) e no
// diálogo da aba Fornecedores (cadastro/edição com calma). Ficam
// aqui para que os dois não divirjam.
//
// `compacto` só muda a densidade: dentro do popover os campos vão
// numa coluna só, e o bloco de endereço começa recolhido.
// ============================================================
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FornecedorInput } from "@/lib/fornecedores-store";

type Props = {
  form: FornecedorInput;
  onChange: (f: FornecedorInput) => void;
  compacto?: boolean;
  autoFocusNome?: boolean;
};

/** Só dígitos, no formato do documento: 11 dígitos vira CPF, 14 vira CNPJ. */
export function mascaraDocumento(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function mascaraCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function FornecedorCampos({ form, onChange, compacto = false, autoFocusNome }: Props) {
  // No popover o endereço começa fechado: quem está no meio de uma nota
  // quase sempre só tem o nome à mão.
  const [endAberto, setEndAberto] = useState(!compacto);

  const set = (chave: keyof FornecedorInput, valor: string) =>
    onChange({ ...form, [chave]: valor });

  const grid = compacto ? "grid gap-2" : "grid gap-3 sm:grid-cols-2";

  return (
    <div className="space-y-3">
      <div className={grid}>
        <div className={cn(!compacto && "sm:col-span-2")}>
          <Label className="text-xs">Nome *</Label>
          <Input
            value={form.nome}
            onChange={e => set("nome", e.target.value)}
            placeholder="Razão social ou nome"
            autoFocus={autoFocusNome}
          />
        </div>
        <div>
          <Label className="text-xs">CNPJ / CPF</Label>
          <Input
            value={form.cnpjCpf}
            onChange={e => set("cnpjCpf", mascaraDocumento(e.target.value))}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
          />
        </div>
        <div>
          <Label className="text-xs">IE / RG</Label>
          <Input value={form.ieRg} onChange={e => set("ieRg", e.target.value)} placeholder="Isento" />
        </div>
        <div>
          <Label className="text-xs">Contato</Label>
          <Input value={form.contato} onChange={e => set("contato", e.target.value)} placeholder="Quem atende" />
        </div>
        <div>
          <Label className="text-xs">Telefone</Label>
          <Input
            value={form.telefone}
            onChange={e => set("telefone", mascaraTelefone(e.target.value))}
            inputMode="tel"
            placeholder="(13) 99999-9999"
          />
        </div>
        <div className={cn(!compacto && "sm:col-span-2")}>
          <Label className="text-xs">E-mail</Label>
          <Input
            type="email"
            value={form.email}
            onChange={e => set("email", e.target.value)}
            placeholder="contato@fornecedor.com.br"
          />
        </div>
      </div>

      {compacto && (
        <button
          type="button"
          onClick={() => setEndAberto(v => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-[#213368] hover:text-[#F37032]"
        >
          {endAberto ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Endereço e observações (opcional)
        </button>
      )}

      {endAberto && (
        <div className={grid}>
          <div className={cn(!compacto && "sm:col-span-2")}>
            <Label className="text-xs">Endereço</Label>
            <Input value={form.endereco} onChange={e => set("endereco", e.target.value)} placeholder="Rua, número, complemento" />
          </div>
          <div>
            <Label className="text-xs">Bairro</Label>
            <Input value={form.bairro} onChange={e => set("bairro", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Cidade</Label>
            <Input value={form.cidade} onChange={e => set("cidade", e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Input
              value={form.estado}
              onChange={e => set("estado", e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
              placeholder="SP"
              maxLength={2}
            />
          </div>
          <div>
            <Label className="text-xs">CEP</Label>
            <Input
              value={form.cep}
              onChange={e => set("cep", mascaraCep(e.target.value))}
              inputMode="numeric"
              placeholder="00000-000"
            />
          </div>
          <div className={cn(!compacto && "sm:col-span-2")}>
            <Label className="text-xs">Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={e => set("observacoes", e.target.value)}
              placeholder="Prazo de entrega, condição de pagamento…"
            />
          </div>
        </div>
      )}
    </div>
  );
}
