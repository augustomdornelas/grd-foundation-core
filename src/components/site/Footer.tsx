import { Instagram, Linkedin, Mail, MapPin, Phone, MessageCircle } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="bg-[#213368] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <Logo variant="light" />
          <p className="mt-4 text-sm text-white/70">
            Especialistas em obras industriais há mais de 14 anos. Agudos, SP.
          </p>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Navegação</h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li><a href="#inicio" className="hover:text-[#F37032]">Início</a></li>
            <li><a href="#empresa" className="hover:text-[#F37032]">A Empresa</a></li>
            <li><a href="#servicos" className="hover:text-[#F37032]">Serviços</a></li>
            <li><a href="#projetos" className="hover:text-[#F37032]">Projetos</a></li>
            <li><a href="#contato" className="hover:text-[#F37032]">Contato</a></li>
            <li><a href="#contato" className="hover:text-[#F37032]">Trabalhe Conosco</a></li>
            <li><a href="#contato" className="hover:text-[#F37032]">Seja nosso fornecedor</a></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Contato</h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2"><Phone className="h-4 w-4 text-[#F37032]" /> (14) 3261-4194</li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4 text-[#F37032]" /> comercial@grupogrdbrasil.com</li>
            <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#F37032]" /> Av. José Antunes de Oliveira, 307 · Agudos-SP</li>
          </ul>
          <div className="mt-5 flex gap-3">
            <a href="#" aria-label="Instagram" className="rounded-full bg-white/10 p-2 hover:bg-[#F37032]"><Instagram className="h-4 w-4" /></a>
            <a href="#" aria-label="LinkedIn" className="rounded-full bg-white/10 p-2 hover:bg-[#F37032]"><Linkedin className="h-4 w-4" /></a>
            <a href="https://wa.me/5514997562761" target="_blank" rel="noreferrer" aria-label="WhatsApp" className="rounded-full bg-white/10 p-2 hover:bg-[#25D366]"><MessageCircle className="h-4 w-4" /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row sm:px-6">
          <p>© 2026 Grupo GRD. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-white">Política de Privacidade</a>
            <a href="#" className="hover:text-white">LGPD</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
