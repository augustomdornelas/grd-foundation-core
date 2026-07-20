import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type ClienteOption = { id: string; nome: string };

type Props = {
  value: string | null | undefined;
  fallbackNome?: string;
  onChange: (id: string, nome: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

let cache: ClienteOption[] | null = null;

export function ClienteSelect({ value, fallbackNome, onChange, placeholder = "Selecione o cliente...", disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ClienteOption[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    setLoading(true);
    supabase.from("clientes").select("id, nome").eq("ativo", true).order("nome", { ascending: true })
      .then(({ data }) => {
        if (!alive) return;
        const list = (data ?? []) as ClienteOption[];
        cache = list;
        setOptions(list);
        setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const selected = options.find(o => o.id === value);
  const label = selected?.nome ?? (value ? fallbackNome ?? "Cliente removido" : fallbackNome ?? "");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !label && "text-muted-foreground")}
        >
          <span className="truncate">{label || placeholder}</span>
          {loading ? <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin opacity-50" /> : <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar cliente..." />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
            <CommandGroup>
              {options.map(o => (
                <CommandItem
                  key={o.id}
                  value={o.nome}
                  onSelect={() => { onChange(o.id, o.nome); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  {o.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
