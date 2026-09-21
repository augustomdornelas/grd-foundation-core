// ============================================================
// Formulário de cadastro do colaborador
// ------------------------------------------------------------
// Era o FuncionarioFormDialog da aba Funcionários do EPIs — um segundo
// cadastro em cima da mesma tabela. Veio para o menu Colaboradores e
// passou a ser o único formulário que cria ou edita gente à mão.
//
// Não tem "Situação": ativo/afastado/desligado têm fluxo próprio (o
// desligamento grava data, motivo e histórico), e um select aqui
// deixaria desligar alguém sem nada disso. Pelo mesmo motivo não
// existe botão de excluir.
// ============================================================
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
import { Users } from "lucide-react";
import { formatarCpf, formatarTelefone } from "@/lib/rh-regras";
import { soDigitos } from "@/lib/documento";
import {
  colaboradorActions,
  useColaboradores,
  type Colaborador,
} from "@/lib/rh-colaboradores-store";

export function ColaboradorFormDialog({
  colaborador,
  onClose,
  onSalvo,
}: {
  colaborador: Colaborador | null;
  onClose: () => void;
  /** Chamado com o id gravado — a lista usa para abrir a ficha do novo. */
  onSalvo?: (id: string) => void;
}) {
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const [form, setForm] = useState({
    nome: colaborador?.nome ?? "",
    cpf: colaborador?.cpf ?? "",
    rg: colaborador?.rg ?? "",
    cargo: colaborador?.cargo ?? "",
    setor: colaborador?.setor ?? "",
    matricula: colaborador?.matricula ?? "",
    dataAdmissao: colaborador?.dataAdmissao ?? "",
    telefone: colaborador?.telefone ?? "",
    email: colaborador?.email ?? "",
    observacoes: colaborador?.observacoes ?? "",
  });
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do colaborador");
    // CPF é a chave da conciliação com a Secullum: dois cadastros com o
    // mesmo CPF fariam a mesma pessoa aparecer duas vezes aqui e uma lá.
    const cpf = soDigitos(form.cpf);
    if (cpf) {
      const outro = colaboradores.find((c) => c.id !== colaborador?.id && soDigitos(c.cpf) === cpf);
      if (outro) return toast.error(`Este CPF já está no cadastro de ${outro.nome}.`);
    }
    setSaving(true);
    const dados = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim(),
      rg: form.rg.trim(),
      cargo: form.cargo.trim(),
      setor: form.setor.trim(),
      matricula: form.matricula.trim(),
      dataAdmissao: form.dataAdmissao || null,
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      observacoes: form.observacoes.trim(),
    };
    const r = colaborador
      ? await colaboradorActions.atualizarCadastro(colaborador.id, dados)
      : await colaboradorActions.criar(dados);
    setSaving(false);
    if (!r.ok) {
      toast.error(`Não foi possível salvar: ${r.erro ?? "erro desconhecido"}`);
      return;
    }
    toast.success(colaborador ? "Cadastro atualizado." : "Colaborador cadastrado.");
    const id = colaborador ? colaborador.id : (r.dado as string | undefined);
    if (id) onSalvo?.(id);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <Users className="h-5 w-5 text-[#F37032]" />{" "}
            {colaborador ? "Editar cadastro" : "Novo colaborador"}
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
              onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })}
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
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
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
