import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { Plus, Trash2, Pencil, KeyRound } from "lucide-react";
import { usuarios as seedUsuarios } from "@/lib/mock-data";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/app/admin")({ component: Admin });

const modulos = ["Comercial", "Projetos", "Equipamentos", "Webmail"] as const;
type Modulo = typeof modulos[number];
type Perm = { ver: boolean; editar: boolean };
type Matrix = Record<number, Record<Modulo, Perm>>;
type Usuario = { id: number; nome: string; email: string; perfil: string; status: string };

const perfis = ["Administrador", "Comercial", "Projetos", "Almoxarifado"] as const;

function permsForPerfil(perfil: string): Record<Modulo, Perm> {
  return {
    "Comercial": { ver: perfil !== "Almoxarifado", editar: perfil === "Comercial" || perfil === "Administrador" },
    "Projetos": { ver: true, editar: perfil === "Projetos" || perfil === "Administrador" },
    "Equipamentos": { ver: true, editar: perfil === "Almoxarifado" || perfil === "Administrador" },
    "Webmail": { ver: true, editar: true },
  };
}

const initialMatrix: Matrix = seedUsuarios.reduce((acc, u) => {
  acc[u.id] = permsForPerfil(u.perfil);
  return acc;
}, {} as Matrix);

function Admin() {
  const [users, setUsers] = useState<Usuario[]>(seedUsuarios);
  const [matrix, setMatrix] = useState<Matrix>(initialMatrix);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Usuario | null>(null);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", email: "", perfil: "Comercial", status: "Ativo" });
  const [editError, setEditError] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: "", email: "", perfil: "Comercial", status: "Ativo", senha: "", confirmar: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{ email: string; senha: string } | null>(null);
  const [pwdUser, setPwdUser] = useState<Usuario | null>(null);
  const [pwdForm, setPwdForm] = useState({ senha: "", confirmar: "" });
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [showPwdEdit, setShowPwdEdit] = useState(false);
  const [pwdResetInfo, setPwdResetInfo] = useState<{ email: string; senha: string } | null>(null);

  const toggle = (uid: number, mod: Modulo, key: keyof Perm) => {
    setMatrix(m => ({ ...m, [uid]: { ...m[uid], [mod]: { ...m[uid][mod], [key]: !m[uid][mod][key] } } }));
  };

  const openNew = () => {
    setForm({ nome: "", email: "", perfil: "Comercial", status: "Ativo", senha: "", confirmar: "" });
    setFormError(null);
    setShowPwd(false);
    setOpen(true);
  };

  const gerarSenha = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let s = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (const n of arr) s += chars[n % chars.length];
    setForm(f => ({ ...f, senha: s, confirmar: s }));
    setShowPwd(true);
  };

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    const nome = form.nome.trim();
    const email = form.email.trim().toLowerCase();
    if (!nome || !email) return setFormError("Preencha nome e e-mail.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setFormError("E-mail inválido.");
    if (users.some(u => u.email.toLowerCase() === email)) return setFormError("Já existe um usuário com esse e-mail.");
    if (form.senha.length < 8) return setFormError("A senha deve ter ao menos 8 caracteres.");
    if (form.senha !== form.confirmar) return setFormError("As senhas não coincidem.");
    const id = users.reduce((max, u) => Math.max(max, u.id), 0) + 1;
    const novo: Usuario = { id, nome, email, perfil: form.perfil, status: form.status };
    setUsers(prev => [...prev, novo]);
    setMatrix(prev => ({ ...prev, [id]: permsForPerfil(form.perfil) }));
    setCreatedInfo({ email, senha: form.senha });
    setOpen(false);
  };


  const confirmDelete = () => {
    if (!toDelete) return;
    const id = toDelete.id;
    setUsers(prev => prev.filter(u => u.id !== id));
    setMatrix(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setToDelete(null);
  };

  const openEdit = (u: Usuario) => {
    setEditForm({ nome: u.nome, email: u.email, perfil: u.perfil, status: u.status });
    setEditError(null);
    setEditing(u);
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const nome = editForm.nome.trim();
    const email = editForm.email.trim().toLowerCase();
    if (!nome || !email) return setEditError("Preencha nome e e-mail.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setEditError("E-mail inválido.");
    if (users.some(u => u.id !== editing.id && u.email.toLowerCase() === email)) {
      return setEditError("Já existe outro usuário com esse e-mail.");
    }
    const perfilMudou = editing.perfil !== editForm.perfil;
    setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, nome, email, perfil: editForm.perfil, status: editForm.status } : u));
    if (perfilMudou) {
      setMatrix(prev => ({ ...prev, [editing.id]: permsForPerfil(editForm.perfil) }));
    }
    setEditing(null);
  };

  const openPwd = (u: Usuario) => {
    setPwdForm({ senha: "", confirmar: "" });
    setPwdError(null);
    setShowPwdEdit(false);
    setPwdUser(u);
  };

  const gerarSenhaEdit = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let s = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (const n of arr) s += chars[n % chars.length];
    setPwdForm({ senha: s, confirmar: s });
    setShowPwdEdit(true);
  };

  const submitPwd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwdUser) return;
    if (pwdForm.senha.length < 8) return setPwdError("A senha deve ter ao menos 8 caracteres.");
    if (pwdForm.senha !== pwdForm.confirmar) return setPwdError("As senhas não coincidem.");
    // NOTA: quando o Supabase for conectado, esta ação deve chamar a Auth Admin API
    // (auth.admin.updateUserById) via edge function protegida por role de administrador.
    // No modo local em memória, apenas exibimos a nova credencial para repasse manual.
    setPwdResetInfo({ email: pwdUser.email, senha: pwdForm.senha });
    setPwdUser(null);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[#213368]">Usuários</h3>
            <p className="text-xs text-muted-foreground">Gerencie contas e perfis de acesso.</p>
          </div>
          <Button onClick={openNew} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Plus className="mr-1 h-4 w-4" /> Novo usuário
          </Button>
        </div>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Perfil</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-36 text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.nome}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.perfil}</TableCell>
                  <TableCell><StatusBadge status={u.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(u)}
                        aria-label={`Editar ${u.nome}`}
                        className="text-[#213368] hover:bg-[#213368]/10 hover:text-[#213368]"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openPwd(u)}
                        aria-label={`Trocar senha de ${u.nome}`}
                        className="text-[#F37032] hover:bg-[#F37032]/10 hover:text-[#F37032]"
                      >
                        <KeyRound className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setToDelete(u)}
                        aria-label={`Excluir ${u.nome}`}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum usuário cadastrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-bold text-[#213368]">Matriz de permissões</h3>
        <p className="mt-1 text-xs text-muted-foreground">Marque o nível de acesso de cada usuário por módulo.</p>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom">Usuário</TableHead>
                {modulos.map(m => <TableHead key={m} colSpan={2} className="text-center">{m}</TableHead>)}
              </TableRow>
              <TableRow>
                {modulos.map(m => (
                  <Fragment key={m}>
                    <TableHead className="text-center text-xs">Ver</TableHead>
                    <TableHead className="text-center text-xs">Editar</TableHead>
                  </Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.nome}<div className="text-xs font-normal text-muted-foreground">{u.perfil}</div></TableCell>
                  {modulos.map(m => (
                    <Fragment key={m}>
                      <TableCell className="text-center">
                        <Checkbox checked={matrix[u.id]?.[m].ver} onCheckedChange={() => toggle(u.id, m, "ver")} />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={matrix[u.id]?.[m].editar} onCheckedChange={() => toggle(u.id, m, "editar")} />
                      </TableCell>
                    </Fragment>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Dialog: editar usuário */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Altere os dados do funcionário. A senha não é modificada aqui.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEdit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-nome">Nome completo</Label>
              <Input id="edit-nome" value={editForm.nome} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select value={editForm.perfil} onValueChange={v => setEditForm(f => ({ ...f, perfil: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {perfis.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{editError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Alterar o perfil redefine as permissões deste usuário para o padrão do novo perfil.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar alterações</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: novo usuário */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>Cadastre manualmente um funcionário no portal.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNew} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome completo</Label>
              <Input id="nome" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex.: Ana Ribeiro" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ana.ribeiro@grupogrd.com.br" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Perfil</Label>
                <Select value={form.perfil} onValueChange={v => setForm(f => ({ ...f, perfil: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {perfis.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="senha">Senha</Label>
                  <button type="button" onClick={() => setShowPwd(v => !v)} className="text-xs font-medium text-[#213368] hover:text-[#F37032]">
                    {showPwd ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <Input
                  id="senha"
                  type={showPwd ? "text" : "password"}
                  value={form.senha}
                  onChange={e => setForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmar">Confirmar senha</Label>
                <Input
                  id="confirmar"
                  type={showPwd ? "text" : "password"}
                  value={form.confirmar}
                  onChange={e => setForm(f => ({ ...f, confirmar: e.target.value }))}
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button type="button" onClick={gerarSenha} className="justify-self-start text-xs font-semibold text-[#213368] hover:text-[#F37032]">
              Gerar senha automática
            </button>
            {formError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{formError}</p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Cadastrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: credenciais criadas */}
      <Dialog open={!!createdInfo} onOpenChange={o => !o && setCreatedInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuário criado</DialogTitle>
            <DialogDescription>Anote e envie as credenciais ao funcionário — a senha não poderá ser recuperada depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-lg border border-dashed border-[#213368]/25 bg-[#213368]/5 p-4 font-mono text-sm text-[#213368]">
            <div>Usuário: <code className="rounded bg-white px-1.5 py-0.5">{createdInfo?.email}</code></div>
            <div>Senha: <code className="rounded bg-white px-1.5 py-0.5">{createdInfo?.senha}</code></div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(`Usuário: ${createdInfo?.email}\nSenha: ${createdInfo?.senha}`)}
            >
              Copiar
            </Button>
            <Button type="button" className="bg-[#F37032] text-white hover:bg-[#ff8850]" onClick={() => setCreatedInfo(null)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Dialog: trocar senha */}
      <Dialog open={!!pwdUser} onOpenChange={o => !o && setPwdUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <strong>{pwdUser?.nome}</strong> ({pwdUser?.email}).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPwd} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="pwd-nova">Nova senha</Label>
                  <button type="button" onClick={() => setShowPwdEdit(v => !v)} className="text-xs font-medium text-[#213368] hover:text-[#F37032]">
                    {showPwdEdit ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <Input
                  id="pwd-nova"
                  type={showPwdEdit ? "text" : "password"}
                  value={pwdForm.senha}
                  onChange={e => setPwdForm(f => ({ ...f, senha: e.target.value }))}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pwd-conf">Confirmar</Label>
                <Input
                  id="pwd-conf"
                  type={showPwdEdit ? "text" : "password"}
                  value={pwdForm.confirmar}
                  onChange={e => setPwdForm(f => ({ ...f, confirmar: e.target.value }))}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button type="button" onClick={gerarSenhaEdit} className="justify-self-start text-xs font-semibold text-[#213368] hover:text-[#F37032]">
              Gerar senha automática
            </button>
            {pwdError && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{pwdError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              A senha antiga deixa de funcionar imediatamente. Anote e envie a nova ao usuário.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwdUser(null)}>Cancelar</Button>
              <Button type="submit" className="bg-[#F37032] text-white hover:bg-[#ff8850]">Salvar nova senha</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: senha redefinida */}
      <Dialog open={!!pwdResetInfo} onOpenChange={o => !o && setPwdResetInfo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha redefinida</DialogTitle>
            <DialogDescription>Envie as novas credenciais ao funcionário — a senha não poderá ser recuperada depois.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 rounded-lg border border-dashed border-[#213368]/25 bg-[#213368]/5 p-4 font-mono text-sm text-[#213368]">
            <div>Usuário: <code className="rounded bg-white px-1.5 py-0.5">{pwdResetInfo?.email}</code></div>
            <div>Nova senha: <code className="rounded bg-white px-1.5 py-0.5">{pwdResetInfo?.senha}</code></div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard?.writeText(`Usuário: ${pwdResetInfo?.email}\nSenha: ${pwdResetInfo?.senha}`)}
            >
              Copiar
            </Button>
            <Button type="button" className="bg-[#F37032] text-white hover:bg-[#ff8850]" onClick={() => setPwdResetInfo(null)}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert: confirmação de exclusão */}
      <AlertDialog open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá <strong>{toDelete?.nome}</strong> ({toDelete?.email}) da lista e das permissões. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
