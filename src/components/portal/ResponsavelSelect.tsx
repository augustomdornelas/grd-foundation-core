// ============================================================
// Combobox de responsável (técnico ou comercial)
// ------------------------------------------------------------
// Alimentado pelo pré-cadastro `responsaveis`. Lista só os ativos
// cujo `tipo` bate com o papel pedido (ou `ambos`).
//
// Um responsável inativado continua sendo exibido quando já está
// selecionado num registro antigo — sumir do combobox não pode
// significar sumir do projeto que aponta para ele.
// ============================================================
import { useState } from "react";
import { Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useResponsaveis, responsaveisActions, filtrarPorPapel, usePodeCadastrarResponsavel,
  RESPONSAVEL_TIPOS, RESPONSAVEL_TIPO_LABEL,
  type Responsavel, type ResponsavelTipo,
} from "@/lib/responsaveis-store";

type Props = {
  papel: "tecnico" | "comercial";
  value: string | null;
  onChange: (id: string | null) => void;
  /** Nome em texto livre do registro antigo, exibido quando não há vínculo. */
  fallbackNome?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function ResponsavelSelect({ papel, value, onChange, fallbackNome, placeholder, disabled }: Props) {
  const todos = useResponsaveis(s => s);
  const podeCadastrar = usePodeCadastrarResponsavel();
  const [open, setOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  const disponiveis = filtrarPorPapel(todos, papel);
  const selecionado = todos.find(r => r.id === value) ?? null;

  // O selecionado entra na lista mesmo se estiver inativo ou for de outro
  // papel, para não desaparecer da tela ao abrir um registro antigo.
  const opcoes: Responsavel[] = selecionado && !disponiveis.some(r => r.id === selecionado.id)
    ? [selecionado, ...disponiveis]
    : disponiveis;

  const rotulo = selecionado?.nome || fallbackNome || "";
  const placeholderFinal = placeholder ?? (papel === "tecnico" ? "Selecione o técnico..." : "Selecione o comercial...");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn("w-full justify-between font-normal", !rotulo && "text-muted-foreground")}
          >
            <span className="truncate">
              {rotulo || placeholderFinal}
              {selecionado && !selecionado.ativo && <span className="ml-1 text-xs text-muted-foreground">(inativo)</span>}
              {!selecionado && fallbackNome && <span className="ml-1 text-xs text-muted-foreground">(não vinculado)</span>}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar por nome..." />
            <CommandList>
              <CommandEmpty>Nenhum responsável encontrado.</CommandEmpty>
              <CommandGroup>
                {value && (
                  <CommandItem value="__limpar__" onSelect={() => { onChange(null); setOpen(false); }}>
                    <span className="text-muted-foreground">Limpar seleção</span>
                  </CommandItem>
                )}
                {opcoes.map(r => (
                  <CommandItem key={r.id} value={r.nome} onSelect={() => { onChange(r.id); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", value === r.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{r.nome}</span>
                    {!r.ativo && <span className="ml-auto text-xs text-muted-foreground">inativo</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
              {podeCadastrar && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__novo__"
                      onSelect={() => { setOpen(false); setNovoOpen(true); }}
                      className="text-[#213368]"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Cadastrar novo responsável
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <NovoResponsavelDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        papel={papel}
        onCriado={r => onChange(r.id)}
      />
    </>
  );
}

/**
 * Cadastro rápido: nome + tipo, sem sair da tela do projeto. O criado já
 * volta selecionado no combobox que o abriu.
 */
function NovoResponsavelDialog({ open, onOpenChange, papel, onCriado }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  papel: "tecnico" | "comercial";
  onCriado: (r: Responsavel) => void;
}) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<ResponsavelTipo>(papel);
  const [salvando, setSalvando] = useState(false);

  function reset() { setNome(""); setTipo(papel); }

  async function salvar() {
    if (!nome.trim()) { toast.error("Informe o nome."); return; }
    setSalvando(true);
    const criado = await responsaveisActions.criar({ nome, tipo });
    setSalvando(false);
    if (!criado) return;
    toast.success("Responsável cadastrado.");
    onCriado(criado);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Novo responsável</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label>Nome *</Label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome completo"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void salvar(); } }}
            />
          </div>
          <div className="grid gap-2">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as ResponsavelTipo)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSAVEL_TIPOS.map(t => (
                  <SelectItem key={t} value={t}>{RESPONSAVEL_TIPO_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" disabled={salvando || !nome.trim()} onClick={() => void salvar()} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            {salvando ? "Salvando..." : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
