import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "#inicio", label: "Início" },
  { href: "#empresa", label: "A Empresa" },
  { href: "#servicos", label: "Serviços" },
  { href: "#projetos", label: "Projetos" },
  { href: "#contato", label: "Contato" },
];

export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/"><Logo /></Link>
        <nav className="hidden items-center gap-7 md:flex">
          {nav.map(n => (
            <a key={n.href} href={n.href} className="text-sm font-medium text-foreground/80 hover:text-primary">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:block">
          <Button asChild className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Link to="/login">Acesso Restrito</Link>
          </Button>
        </div>
        <button className="md:hidden" onClick={() => setOpen(v => !v)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t bg-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
            {nav.map(n => (
              <a key={n.href} href={n.href} className="rounded px-2 py-2 text-sm font-medium hover:bg-muted" onClick={() => setOpen(false)}>
                {n.label}
              </a>
            ))}
            <Button asChild className="mt-2 bg-[#F37032] text-white hover:bg-[#ff8850]">
              <Link to="/login">Área do Colaborador</Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
