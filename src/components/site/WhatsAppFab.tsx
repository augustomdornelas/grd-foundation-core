import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

const setores = [
  { nome: "Comercial", numero: "5511999990001" },
  { nome: "Financeiro", numero: "5511999990002" },
  { nome: "RH", numero: "5511999990003" },
  { nome: "Suporte", numero: "5511999990004" },
];

export function WhatsAppFab() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="mb-3 w-64 overflow-hidden rounded-xl border bg-white shadow-2xl">
          <div className="bg-[#25D366] px-4 py-3 text-sm font-semibold text-white">Fale conosco</div>
          <ul className="divide-y">
            {setores.map(s => (
              <li key={s.nome}>
                <a
                  href={`https://wa.me/${s.numero}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{s.nome}</span>
                  <span className="text-xs text-muted-foreground">Chamar</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="WhatsApp"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xl transition hover:scale-105"
      >
        {open ? <X /> : <MessageCircle className="h-7 w-7" />}
      </button>
    </div>
  );
}
