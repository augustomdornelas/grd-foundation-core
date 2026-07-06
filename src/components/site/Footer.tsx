import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

export function Footer() {
  return (
    <footer className="bg-[#213368] text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <Logo variant="light" />
          <p className="mt-4 text-sm text-white/70">
            Engenharia e construção com segurança, prazo e qualidade em todo o Brasil.
          </p>
          <div className="mt-5 flex gap-3">
            <a href="#" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><Linkedin className="h-4 w-4" /></a>
            <a href="#" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><Instagram className="h-4 w-4" /></a>
            <a href="#" className="rounded-full bg-white/10 p-2 hover:bg-white/20"><Facebook className="h-4 w-4" /></a>
          </div>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Institucional</h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li><a href="#empresa" className="hover:text-white">A Empresa</a></li>
            <li><a href="#servicos" className="hover:text-white">Serviços</a></li>
            <li><a href="#projetos" className="hover:text-white">Projetos</a></li>
            <li><a href="#contato" className="hover:text-white">Contato</a></li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Contato</h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li className="flex items-center gap-2"><Phone className="h-4 w-4" /> (11) 4000-0000</li>
            <li className="flex items-center gap-2"><Mail className="h-4 w-4" /> contato@grupogrd.com.br</li>
            <li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> São Paulo, SP</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white">Legal</h4>
          <ul className="space-y-2 text-sm text-white/70">
            <li><a href="#" className="hover:text-white">Política de Privacidade</a></li>
            <li><a href="#" className="hover:text-white">Termos de Uso</a></li>
            <li><a href="#" className="hover:text-white">LGPD</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-white/60 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Grupo GRD. Todos os direitos reservados.</p>
          <p>Em conformidade com a LGPD.</p>
        </div>
      </div>
    </footer>
  );
}
