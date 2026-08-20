// ============================================================
// Aba Fornecedores da tela do projeto
// ------------------------------------------------------------
// Complemento do cadastro rápido do FornecedorSelect: é aqui que
// o "completar depois" acontece. O cadastro feito no meio de um
// lançamento costuma ter só o nome; esta aba é onde o CNPJ, o
// telefone e o endereço entram com calma.
//
// A lista é global (a tabela `fornecedores` não é por projeto),
// e a aba diz isso na tela para ninguém achar que está editando
// algo restrito a esta obra.
// ============================================================
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FornecedorCampos } from "@/components/fornecedores/FornecedorCampos";
import {
  useFornecedores, criarFornecedor, atualizarFornecedor, inativarFornecedor,
  fornecedorVazio, type Fornecedor, type FornecedorInput,
} from "@/lib/fornecedores-store";

function paraForm(f: Fornecedor): FornecedorInput {
  const { id: _id, ativo: _ativo, ...campos } = f;
  return campos;
}

export function AbaFornecedores() {
  const fornecedores = useFornecedores();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState<FornecedorInput>(fornecedorVazio);
  const [salvando, setSalvando] = useState(false);
  const [inativar, setInativar] = useState<Fornecedor | null>(null);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return fornecedores;
    return fornecedores.filter(f =>
      [f.nome, f.cnpjCpf, f.contato, f.cidade, f.telefone]
        .some(c => c.toLowerCase().includes(q)),
    );
  }, [fornecedores, busca]);

  const abrirNovo = () => { setEditando(null); setForm(fornecedorVazio()); setCriando(true); };
  const abrirEdicao = (f: Fornecedor) => { setEditando(f); setForm(paraForm(f)); setCriando(true); };
  const fechar = () => { setCriando(false); setEditando(null); setForm(fornecedorVazio()); };

  async function salvar() {
    setSalvando(true);
    const salvo = editando
      ? await atualizarFornecedor(editando.id, form)
      : await criarFornecedor(form);
    setSalvando(false);
    if (!salvo) return;
    toast.success(editando ? "Fornecedor atualizado" : "Fornecedor cadastrado");
    fechar();
  }

  async function confirmarInativacao() {
    if (!inativar) return;
    const ok = await inativarFornecedor(inativar.id);
    if (ok) toast.success(`"${inativar.nome}" saiu da lista.`);
    setInativar(null);
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#213368]">Fornecedores</h3>
            <p className="text-xs text-muted-foreground">
              Cadastro compartilhado por todos os projetos — o que for editado aqui vale para
              o sistema inteiro. Só o nome é obrigatório.
            </p>
          </div>
          <Button onClick={abrirNovo} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo fornecedor
          </Button>
        </div>

        <div className="relative mb-4 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome, CNPJ, contato ou cidade"
            className="pl-9"
          />
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ / CPF</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {busca.trim() ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado ainda."}
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map(f => (
                <TableRow key={f.id}>
                  <TableCell className="font-semibold text-[#213368]">{f.nome}</TableCell>
                  <TableCell>{f.cnpjCpf || "—"}</TableCell>
                  <TableCell>{f.contato || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{f.telefone || "—"}</TableCell>
                  <TableCell>{[f.cidade, f.estado].filter(Boolean).join("/") || "—"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Editar" onClick={() => abrirEdicao(f)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Remover da lista" onClick={() => setInativar(f)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={criando} onOpenChange={o => !o && fechar()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#213368]">
              {editando ? "Editar fornecedor" : "Novo fornecedor"}
            </DialogTitle>
          </DialogHeader>

          <FornecedorCampos form={form} onChange={setForm} autoFocusNome={!editando} />

          <DialogFooter>
            <Button variant="outline" onClick={fechar}>Cancelar</Button>
            <Button
              onClick={salvar}
              disabled={salvando || !form.nome.trim()}
              className="bg-[#213368] text-white hover:bg-[#2a4185]"
            >
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!inativar} onOpenChange={o => !o && setInativar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{inativar?.nome}” da lista?</AlertDialogTitle>
            <AlertDialogDescription>
              O fornecedor é marcado como inativo e some das buscas, mas os lançamentos
              e notas já feitos continuam mostrando o nome dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarInativacao} className="bg-destructive text-destructive-foreground">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
