// ============================================================
// Seleção de unidade de medida, com cadastro na hora
// ------------------------------------------------------------
// O valor guardado é a SIGLA (texto), não o id — ver a explicação
// em src/lib/unidades-store.ts.
//
// O cadastro acontece dentro do próprio popover, trocando o conteúdo
// dele por um formulário curto. NÃO usa um Dialog aninhado de
// propósito: este select vive dentro do Dialog da nota fiscal, e
// diálogo dentro de diálogo briga por foco e por trava de rolagem.
// ============================================================
import { useState } from "react";
import { Check, ChevronsUpDown, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useUnidades, criarUnidade } from "@/lib/unidades-store";

type Props = {
  value: string;
  onChange: (sigla: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function UnidadeSelect({
  value,
  onChange,
  placeholder = "Selecione a unidade...",
  disabled,
}: Props) {
  const unidades = useUnidades();
  const [open, setOpen] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState({ nome: "", sigla: "" });
  const [salvando, setSalvando] = useState(false);

  const atual = unidades.find(u => u.sigla === value);
  const rotulo = atual ? `${atual.nome} (${atual.sigla})` : value;

  function fechar() {
    setOpen(false);
    setCadastrando(false);
    setBusca("");
    setNovo({ nome: "", sigla: "" });
  }

  /** Abre o formulário já preenchido com o que a pessoa digitou na busca. */
  function abrirCadastro() {
    setNovo({ nome: busca.trim(), sigla: "" });
    setCadastrando(true);
  }

  async function salvar() {
    setSalvando(true);
    const criada = await criarUnidade(novo.nome, novo.sigla);
    setSalvando(false);
    if (criada) {
      onChange(criada.sigla);
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

      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        {cadastrando ? (
          <div className="grid gap-3 p-3">
            <div className="flex items-center gap-2">
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
              <span className="text-sm font-semibold">Nova unidade</span>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="un-nome" className="text-xs">Nome</Label>
              <Input
                id="un-nome"
                value={novo.nome}
                onChange={e => setNovo({ ...novo, nome: e.target.value })}
                placeholder="Metro quadrado"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="un-sigla" className="text-xs">Sigla</Label>
              <Input
                id="un-sigla"
                value={novo.sigla}
                onChange={e => setNovo({ ...novo, sigla: e.target.value })}
                placeholder="m²"
              />
              <p className="text-[11px] text-muted-foreground">
                É a sigla que aparece na nota. Em branco, usa o nome.
              </p>
            </div>

            <Button
              type="button"
              onClick={salvar}
              disabled={salvando || !novo.nome.trim()}
              className="bg-[#213368] text-white"
            >
              {salvando ? "Salvando..." : "Cadastrar e usar"}
            </Button>
          </div>
        ) : (
          <Command>
            <CommandInput
              placeholder="Buscar unidade..."
              value={busca}
              onValueChange={setBusca}
            />
            <CommandList>
              <CommandEmpty>
                <button
                  type="button"
                  onClick={abrirCadastro}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:text-[#F37032]"
                >
                  <Plus className="h-4 w-4" />
                  {busca.trim() ? `Cadastrar "${busca.trim()}"` : "Cadastrar nova unidade"}
                </button>
              </CommandEmpty>

              <CommandGroup>
                {unidades.map(u => (
                  <CommandItem
                    key={u.id}
                    value={`${u.nome} ${u.sigla}`}
                    onSelect={() => { onChange(u.sigla); fechar(); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === u.sigla ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1">{u.nome}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{u.sigla}</span>
                  </CommandItem>
                ))}
              </CommandGroup>

              <CommandGroup>
                <CommandItem value="__cadastrar" onSelect={abrirCadastro}>
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar nova unidade
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}
