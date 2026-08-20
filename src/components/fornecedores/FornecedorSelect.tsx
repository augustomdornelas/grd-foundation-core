// ============================================================
// Seleção de fornecedor, com pré-cadastro na hora
// ------------------------------------------------------------
// O cadastro acontece DENTRO do popover, trocando o conteúdo dele
// por um formulário curto — mesma decisão já documentada em
// UnidadeSelect: este select vive dentro do Dialog da nota
// fiscal, e diálogo dentro de diálogo briga por foco e por trava
// de rolagem.
//
// Ao salvar, o fornecedor recém-criado já sai selecionado no
// campo de onde o cadastro foi aberto — que é o ponto todo: não
// perder o lançamento pela metade só porque faltava o fornecedor.
// ============================================================
import { useState } from "react";
import { ArrowLeft, Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { FornecedorCampos } from "@/components/fornecedores/FornecedorCampos";
import {
  useFornecedores, criarFornecedor, fornecedorVazio, type FornecedorInput,
} from "@/lib/fornecedores-store";

type Props = {
  /** Id do fornecedor escolhido. */
  value: string | null | undefined;
  /**
   * Nome a exibir quando não há id — notas antigas gravaram o
   * fornecedor como texto solto, antes de existir o cadastro.
   */
  fallbackNome?: string;
  onChange: (id: string, nome: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function FornecedorSelect({
  value,
  fallbackNome,
  onChange,
  placeholder = "Selecione o fornecedor...",
  disabled,
}: Props) {
  const fornecedores = useFornecedores();
  const [open, setOpen] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<FornecedorInput>(fornecedorVazio);
  const [salvando, setSalvando] = useState(false);

  const atual = fornecedores.find(f => f.id === value);
  const rotulo = atual?.nome ?? fallbackNome ?? "";

  function fechar() {
    setOpen(false);
    setCadastrando(false);
    setBusca("");
    setForm(fornecedorVazio());
  }

  /** Abre o formulário já com o que a pessoa digitou na busca. */
  function abrirCadastro() {
    setForm({ ...fornecedorVazio(), nome: busca.trim() });
    setCadastrando(true);
  }

  async function salvar() {
    setSalvando(true);
    const novo = await criarFornecedor(form);
    setSalvando(false);
    if (novo) {
      onChange(novo.id, novo.nome);
      fechar();
    }
  }

  return (
    <Popover open={open} onOpenChange={o => (o ? setOpen(true) : fechar())}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !rotulo && "text-muted-foreground")}
        >
          <span className="truncate">{rotulo || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        {cadastrando ? (
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <div className="mb-3 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setCadastrando(false)}
                aria-label="Voltar para a lista"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-[#213368]">Novo fornecedor</span>
            </div>

            <p className="mb-3 text-[11px] text-muted-foreground">
              Só o nome é obrigatório. Dá para completar o resto depois, pela aba Fornecedores.
            </p>

            <FornecedorCampos form={form} onChange={setForm} compacto autoFocusNome />

            <Button
              type="button"
              onClick={salvar}
              disabled={salvando || !form.nome.trim()}
              className="mt-3 w-full bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              {salvando ? "Salvando..." : "Cadastrar e usar"}
            </Button>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar fornecedor..." value={busca} onValueChange={setBusca} />
            <CommandList>
              <CommandEmpty>
                <button
                  type="button"
                  onClick={abrirCadastro}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:text-[#F37032]"
                >
                  <Plus className="h-4 w-4" />
                  {busca.trim() ? `Cadastrar "${busca.trim()}"` : "Cadastrar novo fornecedor"}
                </button>
              </CommandEmpty>

              <CommandGroup>
                {fornecedores.map(f => (
                  <CommandItem
                    key={f.id}
                    // O documento entra na chave de busca: é comum ter dois
                    // cadastros de nome parecido e só o CNPJ diferencia.
                    value={`${f.nome} ${f.cnpjCpf} ${f.cidade}`}
                    onSelect={() => { onChange(f.id, f.nome); fechar(); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === f.id ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{f.nome}</span>
                    {f.cnpjCpf && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{f.cnpjCpf}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup>
                <CommandItem value="__cadastrar" onSelect={abrirCadastro}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar novo fornecedor
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
