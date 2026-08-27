// ============================================================
// Filtro de múltipla escolha por responsável
// ------------------------------------------------------------
// Usado nas listagens de projetos e de orçamentos. Combina com os
// filtros que já existiam — não substitui nenhum.
// ============================================================
import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useResponsaveis, filtrarPorPapel } from "@/lib/responsaveis-store";

export function ResponsavelFiltro({ papel, rotulo, selecionados, onChange, className }: {
  papel: "tecnico" | "comercial";
  rotulo: string;
  selecionados: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}) {
  const todos = useResponsaveis(s => s);
  const [open, setOpen] = useState(false);

  // Inativos entram na lista do filtro: registros antigos ainda apontam
  // para eles, e sem isso ficariam impossíveis de encontrar.
  const ativos = filtrarPorPapel(todos, papel);
  const usadosInativos = todos.filter(r => selecionados.includes(r.id) && !ativos.some(a => a.id === r.id));
  const opcoes = [...ativos, ...usadosInativos];

  function alternar(id: string) {
    onChange(selecionados.includes(id) ? selecionados.filter(x => x !== id) : [...selecionados, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className={cn("justify-between font-normal", className)}>
          <span className="truncate">
            {rotulo}
            {selecionados.length > 0 && (
              <span className="ml-1 rounded bg-[#213368] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {selecionados.length}
              </span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nome..." />
          <CommandList>
            <CommandEmpty>Nenhum responsável cadastrado.</CommandEmpty>
            <CommandGroup>
              {opcoes.map(r => (
                <CommandItem key={r.id} value={r.nome} onSelect={() => alternar(r.id)}>
                  <Check className={cn("mr-2 h-4 w-4", selecionados.includes(r.id) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{r.nome}</span>
                  {!r.ativo && <span className="ml-auto text-xs text-muted-foreground">inativo</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Chip removível de um filtro ativo. */
export function FiltroChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#213368]/20 bg-[#213368]/5 px-2.5 py-1 text-xs font-medium text-[#213368]">
      {label}
      <button type="button" onClick={onRemove} aria-label={`Remover filtro ${label}`} className="text-[#213368]/60 hover:text-[#F37032]">
        ×
      </button>
    </span>
  );
}
