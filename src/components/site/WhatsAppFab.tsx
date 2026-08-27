import { useState } from "react";
import { X } from "lucide-react";
import instagramIcon from "@/assets/instagram.png";
import whatsappIcon from "@/assets/whatsapp.png";

const setores = [
  { nome: "Comercial", numero: "5514997562761" },
  { nome: "Financeiro", numero: "551432614194" },
  { nome: "RH", numero: "5514996619004" },
];

export function WhatsAppFab() {
  const [open, setOpen] = useState(false);
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3">
      {open && (
        <div className="mb-3 w-64 animate-fade-in overflow-hidden rounded-xl border bg-white shadow-2xl">
          <div className="bg-[#25D366] px-4 py-3 text-sm font-semibold text-white">Fale com a GRD</div>
          <ul className="divide-y">
            {setores.map(s => (
              <li key={s.nome}>
                <a
                  href={`https://wa.me/${s.numero}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted"
                >
                  <span className="font-medium">{s.nome}</span>
                  <span className="text-xs text-[#25D366]">Chamar →</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      <a
        href="https://instagram.com/grupogrdbrasil"
        target="_blank"
        rel="noreferrer"
        aria-label="Instagram"
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-white shadow-lg transition hover:scale-105"
      >
        <img src={instagramIcon} alt="" className="h-full w-full object-cover" />
      </a>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="WhatsApp"
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-7 w-7" /> : <img src={whatsappIcon} alt="" className="h-full w-full object-cover" />}
      </button>
    </div>
  );
}
