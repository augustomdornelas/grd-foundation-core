// ============================================================
// /app/admin — Administração de usuários e permissões
// Integrado com Supabase (tabela profiles)
// ============================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PortfolioAdmin } from "@/components/portal/PortfolioAdmin";

export const Route = createFileRoute("/app/admin")({ component: Admin });

type ModuloKey = "comercial" | "projetos" | "equipamentos" | "webmail" | "admin" | "financeiro";
type PainelKey = "comercial" | "previsao" | "projetos" | "equipamentos" | "financeiro";

const MODULOS: { key: ModuloKey; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "projetos", label: "Projetos" },
  { key: "equipamentos", label: "Equipamentos" },
  { key: "webmail", label: "Webmail" },
  { key: "financeiro", label: "Financeiro" },
  { key: "admin", label: "Administração" },
];

const PAINEIS: { key: PainelKey; label: string; modulo: ModuloKey }[] = [
  { key: "comercial", label: "Comercial", modulo: "comercial" },
  { key: "previsao", label: "Previsao de Entrada", modulo: "comercial" },
  { key: "projetos", label: "Projetos", modulo: "projetos" },
  { key: "equipamentos", label: "Equipamentos", modulo: "equipamentos" },
  { key: "financeiro", label: "Financeiro", modulo: "financeiro" },
];

const PERFIS = ["Administrador", "Comercial", "Projetos", "Almoxarifado", "Colaborador"];

type Usuario = {
  id: string;
  nome: string;
  email: string;
  perfil: string;
  status: string;
  permissoes: Record<string, boolean>;
  paineis: Record<string, boolean>;
};

function permissoesDoPerfil(perfil: string): Record<ModuloKey, boolean> {
  switch (perfil) {
    case "Administrador":
    case "admin":
      return { comercial: true, projetos: true, equipamentos: true, webmail: true, admin: true, financeiro: true };
    case "Comercial":
      return { comercial: true, projetos: false, equipamentos: false, webmail: true, admin: false, financeiro: false };
    case "Projetos":
      return { comercial: false, projetos: true, equipamentos: false, webmail: true, admin: false, financeiro: true };
    case "Almoxarifado":
      return { comercial: false, projetos: false, equipamentos: true, webmail: true, admin: false, financeiro: false };
    default:
      return { comercial: false, projetos: false, equipamentos: false, webmail: true, admin: false, financeiro: false };
  }
}

function Admin() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoOpen, setNovoOpen] = useState(false);
  const [editOpen, setEditOpen] = useState<Usuario | null>(null);
  const [excluirId, setExcluirId] = useState<string | null>(null);

  async function fetchUsuarios() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
    setUsuarios((data ?? []).map((r: any) => ({
      id: r.id,
      nome: r.nome ?? "",
      email: r.email ?? "",
      perfil: r.perfil ?? "colaborador",
      status: r.status ?? "ativo",
      permissoes: typeof r.permissoes === "object" && r.permissoes !== null ? r.permissoes : {},
      paineis: typeof r.paineis === "object" && r.paineis !== null ? r.paineis : {},
    })));
    setLoading(false);
  }

  useEffect(() => { void fetchUsuarios(); }, []);

  async function togglePermissao(userId: string, mod: ModuloKey, tipo: "ver" | "editar", valor: boolean) {
    const key = tipo === "ver" ? mod : `${mod}_editar`;
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;
    const novas = { ...u.permissoes, [key]: valor };
    setUsuarios(prev => prev.map(x => x.id === userId ? { ...x, permissoes: novas } : x));
    await supabase.from("profiles").update({ permissoes: novas }).eq("id", userId);
  }

  async function togglePainel(userId: string, painel: PainelKey, valor: boolean) {
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;
    const novos = { ...u.paineis, [painel]: valor };
    setUsuarios(prev => prev.map(x => x.id === userId ? { ...x, paineis: novos } : x));
    await supabase.from("profiles").update({ paineis: novos }).eq("id", userId);
  }

  async function resetarPermissoes(userId: string) {
    const u = usuarios.find(x => x.id === userId);
    if (!u) return;
    const novas = permissoesDoPerfil(u.perfil);
    setUsuarios(prev => prev.map(x => x.id === userId ? { ...x, permissoes: novas } : x));
    await supabase.from("profiles").update({ permissoes: novas }).eq("id", userId);
    toast.success("Permissões resetadas para o padrão do perfil.");
  }

  function temPermissao(u: Usuario, mod: ModuloKey, tipo: "ver" | "editar") {
    const key = tipo === "ver" ? mod : `${mod}_editar`;
    if (u.permissoes[key] !== undefined) return !!u.permissoes[key];
    const padrao = permissoesDoPerfil(u.perfil);
    return !!padrao[mod];
  }

  function temPainel(u: Usuario, painel: PainelKey) {
    if (u.paineis[painel] !== undefined) return !!u.paineis[painel];
    const mod = PAINEIS.find(p => p.key === painel)?.modulo;
    return mod ? temPermissao(u, mod, "ver") : false;
  }

  async function excluirUsuario(id: string) {
    setUsuarios(prev => prev.filter(x => x.id !== id));
    await supabase.from("profiles").delete().eq("id", id);
    toast.success("Usuário removido.");
    setExcluirId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-[#213368]">Administração</h2>
          <p className="text-xs text-muted-foreground">Gerencie contas e perfis de acesso.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="bg-[#F37032] text-white hover:bg-[#ff8850]">
          <Plus className="mr-1 h-4 w-4" /> Novo usuário
        </Button>
      </div>

      {/* Tabela de usuários */}
      <Card className="p-6">
        <h3 className="mb-4 text-lg font-bold text-[#213368]">Usuários</h3>
        <p className="mb-4 text-xs text-muted-foreground">Gerencie contas e perfis de acesso.</p>
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário cadastrado.</TableCell></TableRow>
              ) : usuarios.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-semibold">{u.nome}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell><Badge variant="outline">{u.perfil}</Badge></TableCell>
                  <TableCell>
                    <Badge className={u.status === "ativo" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
                      {u.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditOpen(u)}><Pencil className="h-4 w-4 text-[#213368]" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setExcluirId(u.id)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Matriz de permissões */}
      <Card className="p-6">
        <h3 className="mb-1 text-lg font-bold text-[#213368]">Acesso às abas do sistema</h3>
        <p className="mb-4 text-xs text-muted-foreground">Controle, por usuário, o que ele pode ver e editar em cada módulo. Alterações valem imediatamente.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-semibold text-[#213368]">Usuário</th>
                {MODULOS.map(m => (
                  <th key={m.key} colSpan={2} className="px-2 py-2 text-center font-semibold text-[#213368]">{m.label}</th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-[#213368]">Padrão</th>
              </tr>
              <tr className="border-b text-xs text-muted-foreground">
                <th />
                {MODULOS.map(m => (
                  <>
                    <th key={`${m.key}-ver`} className="px-2 py-1 text-center">Ver</th>
                    <th key={`${m.key}-editar`} className="px-2 py-1 text-center">Editar</th>
                  </>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <div className="font-semibold">{u.nome}</div>
                    <div className="text-xs text-[#F37032]">{u.perfil}</div>
                  </td>
                  {MODULOS.map(m => (
                    <>
                      <td key={`${u.id}-${m.key}-ver`} className="px-2 py-2 text-center">
                        <input type="checkbox" checked={temPermissao(u, m.key, "ver")}
                          onChange={e => togglePermissao(u.id, m.key, "ver", e.target.checked)}
                          className="h-4 w-4 accent-[#213368]" />
                      </td>
                      <td key={`${u.id}-${m.key}-editar`} className="px-2 py-2 text-center">
                        <input type="checkbox" checked={temPermissao(u, m.key, "editar")}
                          onChange={e => togglePermissao(u.id, m.key, "editar", e.target.checked)}
                          disabled={!temPermissao(u, m.key, "ver")}
                          className="h-4 w-4 accent-[#213368] disabled:opacity-30" />
                      </td>
                    </>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <Button size="icon" variant="ghost" onClick={() => resetarPermissoes(u.id)} title="Resetar para padrão do perfil">
                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Gráficos do painel */}
      <Card className="p-6">
        <h3 className="mb-1 text-lg font-bold text-[#213368]">Gráficos do painel inicial</h3>
        <p className="mb-4 text-xs text-muted-foreground">Escolha quais blocos aparecem em /app para cada usuário. Blocos ficam desabilitados quando o módulo correspondente está bloqueado acima.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-semibold text-[#213368]">Usuário</th>
                {PAINEIS.map(p => <th key={p.key} className="px-4 py-2 text-center font-semibold text-[#213368]">{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 pr-4">
                    <div className="font-semibold">{u.nome}</div>
                    <div className="text-xs text-[#F37032]">{u.perfil}</div>
                  </td>
                  {PAINEIS.map(p => {
                    const bloqueado = !temPermissao(u, p.modulo, "ver");
                    return (
                      <td key={p.key} className="px-4 py-2 text-center">
                        {bloqueado ? (
                          <span className="text-xs text-muted-foreground">bloqueado</span>
                        ) : (
                          <input type="checkbox" checked={temPainel(u, p.key)}
                            onChange={e => togglePainel(u.id, p.key, e.target.checked)}
                            className="h-4 w-4 accent-[#213368]" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PortfolioAdmin />

      {/* Modal novo usuário */}
      <NovoUsuarioModal open={novoOpen} onClose={() => setNovoOpen(false)} onCriado={fetchUsuarios} />

      {/* Modal editar */}
      {editOpen && (
        <EditarUsuarioModal usuario={editOpen} onClose={() => setEditOpen(null)} onSalvo={fetchUsuarios} />
      )}

      {/* Confirmar exclusão */}
      <AlertDialog open={!!excluirId} onOpenChange={o => !o && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação remove o perfil do usuário. O acesso dele será revogado imediatamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirId && excluirUsuario(excluirId)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ------------------------------------------------------------
// Modal novo usuário
// ------------------------------------------------------------
function NovoUsuarioModal({ open, onClose, onCriado }: { open: boolean; onClose: () => void; onCriado: () => void }) {
  const [form, setForm] = useState({ nome: "", email: "", perfil: "Colaborador", status: "ativo", senha: "", confirmar: "" });
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!form.nome.trim() || !form.email.trim() || !form.senha) { setErro("Preencha todos os campos obrigatórios."); return; }
    if (form.senha !== form.confirmar) { setErro("As senhas não coincidem."); return; }
    if (form.senha.length < 6) { setErro("A senha deve ter pelo menos 6 caracteres."); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: form.email.trim(), password: form.senha });
      if (error) { setErro(error.message); setLoading(false); return; }
      const uid = data.user?.id;
      if (uid) {
        const permissoes = permissoesDoPerfil(form.perfil);
        const { error: pe } = await supabase.from("profiles").upsert({
          id: uid, nome: form.nome.trim(), email: form.email.trim(),
          perfil: form.perfil, status: form.status, permissoes, paineis: {},
        });
        if (pe) { setErro("Conta criada no Auth, mas falhou ao gravar o perfil: " + pe.message); setLoading(false); return; }
      }
      toast.success("Usuário cadastrado com sucesso!");
      onCriado();
      onClose();
    } catch (err: any) {
      setErro(err.message ?? "Erro inesperado.");
    }
    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Novo usuário</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2"><label className="text-sm font-medium">Nome completo</label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do colaborador" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">E-mail</label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@grupogrdbrasil.com.br" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Perfil</label>
              <Select value={form.perfil} onValueChange={v => setForm({ ...form, perfil: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PERFIS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2"><label className="text-sm font-medium">Senha</label><Input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
          <div className="grid gap-2"><label className="text-sm font-medium">Confirmar senha</label><Input type="password" value={form.confirmar} onChange={e => setForm({ ...form, confirmar: e.target.value })} /></div>
          {erro && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-[#F37032] text-white hover:bg-[#ff8850]">{loading ? "Cadastrando..." : "Cadastrar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------
// Modal editar usuário
// ------------------------------------------------------------
function EditarUsuarioModal({ usuario, onClose, onSalvo }: { usuario: Usuario; onClose: () => void; onSalvo: () => void }) {
  const [form, setForm] = useState({ nome: usuario.nome, perfil: usuario.perfil, status: usuario.status });
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const permissoes = permissoesDoPerfil(form.perfil);
    await supabase.from("profiles").update({ nome: form.nome, perfil: form.perfil, status: form.status, permissoes }).eq("id", usuario.id);
    toast.success("Usuário atualizado.");
    onSalvo();
    onClose();
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2"><label className="text-sm font-medium">Nome completo</label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Perfil</label>
              <Select value={form.perfil} onValueChange={v => setForm({ ...form, perfil: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PERFIS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="inativo">Inativo</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading} className="bg-[#F37032] text-white hover:bg-[#ff8850]">{loading ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
