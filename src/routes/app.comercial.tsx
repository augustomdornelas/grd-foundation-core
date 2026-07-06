import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, Search } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { orcamentos, comercialSerie, comercialStatus, brl } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/app/comercial")({ component: Comercial });

function Comercial() {
  const [q, setQ] = useState("");
  const filtered = orcamentos.filter(o =>
    (o.cliente + o.obra + o.id).toLowerCase().includes(q.toLowerCase())
  );
  const total = orcamentos.reduce((s, o) => s + o.valor, 0);
  const aprovados = orcamentos.filter(o => o.status === "Aprovado").length;
  const conv = Math.round((aprovados / orcamentos.length) * 100);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Valor total", brl(total)],
          ["Nº de orçamentos", String(orcamentos.length)],
          ["Ticket médio", brl(Math.round(total / orcamentos.length))],
          ["Taxa de conversão", `${conv}%`],
        ].map(([l, v]) => (
          <Card key={l} className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="mt-2 text-2xl font-extrabold text-[#213368]">{v}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="text-sm font-semibold text-muted-foreground">Valor mês a mês</div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comercialSerie}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
                <YAxis stroke="#6E7280" fontSize={12} tickFormatter={v => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="valor" fill="#F37032" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-6">
          <div className="text-sm font-semibold text-muted-foreground">Por status</div>
          <div className="mt-2 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={comercialStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={3}>
                  {comercialStatus.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Orçamentos</h3>
            <p className="text-xs text-muted-foreground">Gerencie propostas comerciais.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar orçamento..." className="pl-9 w-64" />
            </div>
            <NovoOrcamento />
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="font-semibold">{o.id}</TableCell>
                  <TableCell>{o.cliente}</TableCell>
                  <TableCell>{o.obra}</TableCell>
                  <TableCell className="font-semibold">{brl(o.valor)}</TableCell>
                  <TableCell>{new Date(o.data).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{o.responsavel}</TableCell>
                  <TableCell><StatusBadge status={o.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function NovoOrcamento() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Novo orçamento</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Novo orçamento</DialogTitle></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); setOpen(false); }}>
          <div className="grid gap-2"><label className="text-sm font-medium">Cliente</label><Input placeholder="Nome do cliente" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Obra</label><Input placeholder="Descrição da obra" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Valor (R$)</label><Input type="number" placeholder="0,00" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Data</label><Input type="date" /></div>
          <div className="grid gap-2">
            <label className="text-sm font-medium">Status</label>
            <Select><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Enviado">Enviado</SelectItem>
                <SelectItem value="Em análise">Em análise</SelectItem>
                <SelectItem value="Aprovado">Aprovado</SelectItem>
                <SelectItem value="Recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><label className="text-sm font-medium">Responsável</label><Input placeholder="Nome" /></div>
          <div className="grid gap-2 md:col-span-2"><label className="text-sm font-medium">Observações</label><Textarea rows={3} /></div>
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
