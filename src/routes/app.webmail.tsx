import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Inbox, Send, FileText, Trash2, Plus, Search, Reply, Forward, Archive, Star } from "lucide-react";
import { emails } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/app/webmail")({ component: Webmail });

const folders = [
  { key: "inbox", label: "Caixa de entrada", icon: Inbox, count: 7 },
  { key: "sent", label: "Enviados", icon: Send },
  { key: "drafts", label: "Rascunhos", icon: FileText },
  { key: "trash", label: "Lixeira", icon: Trash2 },
];

function Webmail() {
  const [active, setActive] = useState(1);
  const email = emails.find(e => e.id === active) ?? emails[0];
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_320px_1fr] h-[calc(100vh-10rem)]">
      <Card className="flex flex-col p-4">
        <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Escrever</Button>
        <nav className="mt-4 space-y-1">
          {folders.map(f => (
            <button key={f.key} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium ${f.key === "inbox" ? "bg-[#213368] text-white" : "hover:bg-muted"}`}>
              <span className="flex items-center gap-2"><f.icon className="h-4 w-4" />{f.label}</span>
              {f.count && <span className="text-xs font-bold">{f.count}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-lg border bg-[#F4F4F4] p-3 text-xs text-muted-foreground">
          <div className="font-semibold text-[#213368]">Microsoft 365</div>
          <div>Integração ativa</div>
        </div>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="border-b p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar e-mails..." className="pl-9" />
          </div>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto">
          {emails.map(e => (
            <li key={e.id}>
              <button onClick={() => setActive(e.id)} className={`w-full px-4 py-3 text-left transition ${active === e.id ? "bg-[#F37032]/5 border-l-4 border-[#F37032]" : "hover:bg-muted"}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm ${e.nao_lido ? "font-bold text-[#213368]" : "font-medium"}`}>{e.de}</span>
                  <span className="text-xs text-muted-foreground">{e.data}</span>
                </div>
                <div className={`mt-1 text-sm ${e.nao_lido ? "font-semibold" : ""}`}>{e.assunto}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{e.preview}</div>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col overflow-hidden p-0">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">{email.assunto}</h3>
            <p className="text-xs text-muted-foreground">De: <span className="font-medium">{email.de}</span> · {email.data}</p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost"><Reply className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost"><Forward className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost"><Star className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost"><Archive className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 text-sm leading-relaxed">
          <p>Prezado(a),</p>
          <p className="mt-3">{email.preview}</p>
          <p className="mt-3">Segue em anexo a documentação relacionada para sua análise. Fico à disposição para eventuais dúvidas e alinhamentos.</p>
          <p className="mt-6">Atenciosamente,</p>
          <p className="mt-1 font-semibold">{email.de.split("@")[0]}</p>
        </div>
      </Card>
    </div>
  );
}
