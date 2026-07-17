import { useState } from "react";
import { X } from "lucide-react";

const setores = [
  { nome: "Comercial", numero: "5514997562761" },
  { nome: "Financeiro", numero: "551432614194" },
  { nome: "RH", numero: "5514996619004" },
];

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2C6.48 2 2 6.48 2 12C2 13.85 2.5 15.55 3.38 17L2.54 20.46L6.08 19.62C7.55 20.5 9.22 21 11 21H12C17.52 21 22 16.52 22 12C22 6.48 17.52 2 12 2ZM12 20C10.32 20 8.75 19.55 7.4 18.75L7.12 18.58L4.42 19.17L5.02 16.52L4.82 16.22C3.94 14.82 3.45 13.23 3.45 11.55C3.45 7.19 7.03 3.62 11.38 3.62C15.74 3.62 19.31 7.19 19.31 11.55C19.31 15.9 15.74 20 12 20ZM16.34 13.38C16.21 13.31 15.54 12.98 15.42 12.94C15.3 12.89 15.21 12.87 15.13 12.99C15.05 13.11 14.84 13.36 14.77 13.44C14.7 13.52 14.63 13.53 14.5 13.46C13.89 13.15 13.29 12.77 12.77 12.3C12.44 11.99 12.12 11.64 11.85 11.25C11.79 11.16 11.84 11.11 11.9 11.06C11.95 11.01 12.01 10.94 12.06 10.88C12.11 10.82 12.14 10.76 12.18 10.69C12.22 10.62 12.2 10.56 12.17 10.5C12.14 10.44 11.9 9.89 11.8 9.66C11.7 9.41 11.6 9.44 11.52 9.44H11.27C11.18 9.44 11.07 9.46 10.97 9.57C10.87 9.68 10.6 9.94 10.6 10.48C10.6 11.02 10.98 11.54 11.03 11.61C11.08 11.68 11.74 12.71 12.83 13.54C13.36 13.95 13.82 14.21 14.2 14.4C14.84 14.7 15.19 14.66 15.39 14.62C15.65 14.57 16.1 14.32 16.19 14.04C16.28 13.76 16.28 13.53 16.25 13.48C16.22 13.43 16.16 13.4 16.34 13.38Z"
        fill="currentColor"
      />
    </svg>
  );
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="igGradient" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#833AB4" />
          <stop offset="0.5" stopColor="#FD1D1D" />
          <stop offset="1" stopColor="#F77737" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#igGradient)" />
      <path
        d="M12 6.8C14.9 6.8 17.2 9.1 17.2 12C17.2 14.9 14.9 17.2 12 17.2C9.1 17.2 6.8 14.9 6.8 12C6.8 9.1 9.1 6.8 12 6.8ZM12 15.2C13.8 15.2 15.2 13.8 15.2 12C15.2 10.2 13.8 8.8 12 8.8C10.2 8.8 8.8 10.2 8.8 12C8.8 13.8 10.2 15.2 12 15.2ZM18.4 6.6C18.4 7.16 17.96 7.6 17.4 7.6C16.84 7.6 16.4 7.16 16.4 6.6C16.4 6.04 16.84 5.6 17.4 5.6C17.96 5.6 18.4 6.04 18.4 6.6ZM21.6 7.6C21.6 6.38 21.38 5.18 20.9 4.1C20.42 3.02 19.56 2.2 18.5 1.7C17.42 1.2 16.22 1 15 1H9C7.78 1 6.58 1.2 5.5 1.7C4.42 2.2 3.6 3.02 3.1 4.1C2.6 5.18 2.4 6.38 2.4 7.6V13.6C2.4 14.82 2.6 16.02 3.1 17.1C3.6 18.18 4.42 18.98 5.5 19.48C6.58 19.98 7.78 20.2 9 20.2H15C16.22 20.2 17.42 19.98 18.5 19.48C19.56 18.98 20.42 18.18 20.9 17.1C21.38 16.02 21.6 14.82 21.6 13.6V7.6ZM19.6 13.6C19.6 15.58 18.98 17.2 17.2 17.2H6.8C5.02 17.2 4.4 15.58 4.4 13.6V7.6C4.4 5.82 5.82 4.4 7.6 4.4H16.4C18.18 4.4 19.6 5.82 19.6 7.6V13.6Z"
        fill="white"
      />
    </svg>
  );
}

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
        className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-white shadow-lg transition hover:scale-105"
      >
        <InstagramIcon className="h-8 w-8" />
      </a>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="WhatsApp"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105"
      >
        {open ? <X className="h-7 w-7" /> : <WhatsAppIcon className="h-8 w-8" />}
      </button>
    </div>
  );
}
