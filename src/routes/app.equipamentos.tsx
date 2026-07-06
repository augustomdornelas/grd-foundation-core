import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { equipamentos, brl } from "@/lib/mock-data";
import { useState } from "react";

export const Route = createFileRoute("/app/equipamentos")({ component: Equipamentos });

const historico = [
  { data: "2026-06-01", equipamento: "Escavadeira CAT 320", destino: "Obra Vale Verde", responsavel: "João Costa", periodo: "01/06 – 30/06", custo: 4500 },
  { data: "2026-06-03", equipamento: "Andaime Multidirecional", destino: "Obra Aurora", responsavel: "Marta Lima", periodo: "03/06 – 20/07", custo: 890 },
  { data: "2026-06-10", equipamento: "Gerador 60kVA", destino: "Obra AutoTech", responsavel: "Paulo Reis", periodo: "10/06 – 30/07", custo: 1200 },
];

const custosMes = [
  { mes: "Jan", valor: 12400 },
  { mes: "Fev", valor: 15300 },
  { mes: "Mar", valor: 18900 },
  { mes: "Abr", valor: 17200 },
  { mes: "Mai", valor: 21500 },
  { mes: "Jun", valor: 24600 },
];

function Equipamentos() {
  const emUso = equipamentos.filter(e => e.status === "Emprestado").length;
  const disp = equipamentos.filter(e => e.status === "Disponível").length;
  const custo = equipamentos.filter(e => e.status === "Emprestado").reduce((s, e) => s + e.custo, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Em uso", String(emUso)],
          ["Disponíveis", String(disp)],
          ["Custo total no período", brl(custo)],
        ].map(([l, v]) => (
          <Card key={l} className="p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l}</div>
            <div className="mt-2 text-2xl font-extrabold text-[#213368]">{v}</div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="text-sm font-semibold text-muted-foreground">Custos de locação — últimos 6 meses</div>
        <div className="mt-4 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={custosMes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="mes" stroke="#6E7280" fontSize={12} />
              <YAxis stroke="#6E7280" fontSize={12} />
              <Tooltip formatter={(v: number) => brl(v)} />
              <Bar dataKey="valor" fill="#213368" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Frota</h3>
            <p className="text-xs text-muted-foreground">Equipamentos em aluguel, empréstimo e manutenção.</p>
          </div>
          <RegistrarEmprestimo />
        </div>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Localização</TableHead><TableHead>Custo/mês</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {equipamentos.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="font-semibold">{e.codigo}</TableCell>
                  <TableCell>{e.nome}</TableCell>
                  <TableCell>{e.local}</TableCell>
                  <TableCell>{brl(e.custo)}</TableCell>
                  <TableCell><StatusBadge status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold text-[#213368]">Histórico de movimentações</h3>
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Equipamento</TableHead><TableHead>Destino</TableHead><TableHead>Responsável</TableHead><TableHead>Período</TableHead><TableHead>Custo</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {historico.map((h, i) => (
                <TableRow key={i}>
                  <TableCell>{new Date(h.data).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>{h.equipamento}</TableCell>
                  <TableCell>{h.destino}</TableCell>
                  <TableCell>{h.responsavel}</TableCell>
                  <TableCell>{h.periodo}</TableCell>
                  <TableCell className="font-semibold">{brl(h.custo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function RegistrarEmprestimo() {
  const [open, setOpen] = useState(false);
  const [custo, setCusto] = useState(0);
  const [dias, setDias] = useState(0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#F37032] text-white hover:bg-[#ff8850]"><Plus className="mr-1 h-4 w-4" /> Registrar empréstimo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Registrar empréstimo</DialogTitle></DialogHeader>
        <form className="grid gap-4 md:grid-cols-2" onSubmit={e => { e.preventDefault(); setOpen(false); }}>
          <div className="grid gap-2 md:col-span-2">
            <label className="text-sm font-medium">Equipamento</label>
            <Select><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{equipamentos.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2"><label className="text-sm font-medium">Destino / Obra</label><Input placeholder="Nome da obra ou pessoa" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Responsável</label><Input placeholder="Nome" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Data início</label><Input type="date" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Data fim</label><Input type="date" onChange={e => { const d = e.target.value; if (d) setDias(Math.max(1, 10)); }} /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Custo por período (R$)</label><Input type="number" value={custo || ""} onChange={e => setCusto(Number(e.target.value))} /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Dias</label><Input type="number" value={dias || ""} onChange={e => setDias(Number(e.target.value))} /></div>
          <div className="md:col-span-2 rounded-lg bg-[#F4F4F4] p-4 text-sm">
            <span className="text-muted-foreground">Custo total estimado: </span>
            <span className="font-bold text-[#213368]">{brl((custo || 0) * (dias || 0))}</span>
          </div>
          <DialogFooter className="md:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
