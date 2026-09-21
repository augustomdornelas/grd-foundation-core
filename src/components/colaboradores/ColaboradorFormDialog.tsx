// ============================================================
// Ficha do colaborador — cadastro e edição no mesmo formulário
// ------------------------------------------------------------
// É a ficha inteira: dados pessoais, cargo, contato e situação. Não há
// mais abas de documentos, dependentes, EPIs, histórico, salário ou
// obra — esses dados continuam no banco, só não aparecem aqui.
//
// Sem botão de excluir: quem sai muda a Situação para Desligado. Ao
// desligar, o store carimba a data de desligamento.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { formatarCpf, formatarTelefone } from "@/lib/rh-regras";
import { soDigitos } from "@/lib/documento";
import {
  colaboradorActions,
  useColaboradores,
  SITUACAO_LABEL,
  type Colaborador,
  type SituacaoColaborador,
} from "@/lib/rh-colaboradores-store";

export function ColaboradorFormDialog({
  colaborador,
  onClose,
}: {
  colaborador: Colaborador | null;
  onClose: () => void;
}) {
  const colaboradores = useColaboradores((s) => s.colaboradores);
  const [form, setForm] = useState({
    nome: colaborador?.nome ?? "",
    cpf: colaborador?.cpf ?? "",
    rg: colaborador?.rg ?? "",
    matricula: colaborador?.matricula ?? "",
    cargo: colaborador?.cargo ?? "",
    setor: colaborador?.setor ?? "",
    dataAdmissao: colaborador?.dataAdmissao ?? "",
    telefone: colaborador?.telefone ?? "",
    email: colaborador?.email ?? "",
    observacoes: colaborador?.observacoes ?? "",
    situacao: (colaborador?.situacao ?? "ativo") as SituacaoColaborador,
  });
  const [saving, setSaving] = useState(false);

  // A tela oferece Ativo e Desligado. Quem hoje está em Experiência ou
  // Afastado (situações antigas, vindas da admissão) mantém a sua como
  // terceira opção — senão abrir e salvar a ficha trocaria a situação
  // sem ninguém pedir.
  const opcoesSituacao: SituacaoColaborador[] = ["ativo", "desligado"];
  if (colaborador && !opcoesSituacao.includes(colaborador.situacao)) {
    opcoesSituacao.unshift(colaborador.situacao);
  }

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
      matricula: form.matricula.trim(),
      cargo: form.cargo.trim(),
      setor: form.setor.trim(),
      dataAdmissao: form.dataAdmissao || null,
      telefone: form.telefone.trim(),
      email: form.email.trim(),
      observacoes: form.observacoes.trim(),
      situacao: form.situacao,
    };
    const r = colaborador
      ? await colaboradorActions.atualizarCadastro(colaborador, dados)
      : await colaboradorActions.criar(dados);
    setSaving(false);
    if (!r.ok) {
      toast.error(`Não foi possível salvar: ${r.erro ?? "erro desconhecido"}`);
      return;
    }
    toast.success(colaborador ? "Cadastro atualizado." : "Colaborador cadastrado.");
    onClose();
  };

  const campo = (chave: keyof typeof form, valor: string) => setForm({ ...form, [chave]: valor });

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <Users className="h-5 w-5 text-[#F37032]" />{" "}
            {colaborador ? "Editar colaborador" : "Novo colaborador"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome completo *</Label>
            <Input value={form.nome} onChange={(e) => campo("nome", e.target.value)} />
          </div>
          <div>
            <Label>CPF</Label>
            <Input
              value={form.cpf}
              onChange={(e) => campo("cpf", formatarCpf(e.target.value))}
              placeholder="000.000.000-00"
            />
          </div>
          <div>
            <Label>RG</Label>
            <Input value={form.rg} onChange={(e) => campo("rg", e.target.value)} />
          </div>
          <div>
            <Label>Matrícula</Label>
            <Input value={form.matricula} onChange={(e) => campo("matricula", e.target.value)} />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input value={form.cargo} onChange={(e) => campo("cargo", e.target.value)} />
          </div>
          <div>
            <Label>Setor</Label>
            <Input value={form.setor} onChange={(e) => campo("setor", e.target.value)} />
          </div>
          <div>
            <Label>Data de admissão</Label>
            <Input
              type="date"
              value={form.dataAdmissao}
              onChange={(e) => campo("dataAdmissao", e.target.value)}
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.telefone}
              onChange={(e) => campo("telefone", formatarTelefone(e.target.value))}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => campo("email", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Observações</Label>
            <Textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => campo("observacoes", e.target.value)}
            />
          </div>
          <div>
            <Label>Situação</Label>
            <Select value={form.situacao} onValueChange={(v) => campo("situacao", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcoesSituacao.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SITUACAO_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
