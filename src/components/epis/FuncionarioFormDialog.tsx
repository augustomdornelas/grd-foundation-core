// Formulário de Funcionário — saiu de app.epis.tsx quando as abas
// viraram rotas. Usado pela aba Funcionários.
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { epiActions, type Funcionario } from "@/lib/epis-store";
import { maskCpf } from "@/components/epis/epis-formato";

export function FuncionarioFormDialog({
  funcionario,
  onClose,
}: {
  funcionario: Funcionario | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    nome: funcionario?.nome ?? "",
    cpf: funcionario?.cpf ?? "",
    rg: funcionario?.rg ?? "",
    cargo: funcionario?.cargo ?? "",
    setor: funcionario?.setor ?? "",
    matricula: funcionario?.matricula ?? "",
    dataAdmissao: funcionario?.dataAdmissao ?? "",
    ativo: funcionario?.ativo ?? true,
    observacoes: funcionario?.observacoes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do funcionário");
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim(),
      rg: form.rg.trim(),
      cargo: form.cargo.trim(),
      setor: form.setor.trim(),
      matricula: form.matricula.trim(),
      dataAdmissao: form.dataAdmissao || undefined,
      ativo: form.ativo,
      observacoes: form.observacoes.trim(),
    };
    if (funcionario) await epiActions.atualizarFuncionario(funcionario.id, payload);
    else await epiActions.criarFuncionario(payload);
    toast.success(funcionario ? "Funcionário atualizado." : "Funcionário cadastrado.");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <Users className="h-5 w-5 text-[#F37032]" />{" "}
            {funcionario ? "Editar funcionário" : "Novo funcionário"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome completo *</Label>
            <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div>
            <Label>CPF</Label>
            <Input
              value={form.cpf}
              onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })}
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <Label>RG</Label>
            <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
          </div>
          <div>
            <Label>Cargo / Função</Label>
            <Input
              value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
            />
          </div>
          <div>
            <Label>Setor</Label>
            <Input
              value={form.setor}
              onChange={(e) => setForm({ ...form, setor: e.target.value })}
            />
          </div>
          <div>
            <Label>Matrícula</Label>
            <Input
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
            />
          </div>
          <div>
            <Label>Data de admissão</Label>
            <Input
              type="date"
              value={form.dataAdmissao}
              onChange={(e) => setForm({ ...form, dataAdmissao: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Situação</Label>
            <Select
              value={form.ativo ? "ativo" : "inativo"}
              onValueChange={(v) => setForm({ ...form, ativo: v === "ativo" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={saving}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
