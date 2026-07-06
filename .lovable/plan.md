# Editar usuário no módulo Admin

Adicionar um botão **Editar** (ícone de lápis) ao lado do botão de excluir na coluna "Ações" da tabela de Usuários, em `/app/admin`, abrindo um diálogo para alterar os dados do usuário selecionado.

## O que muda na tela

- Na coluna **Ações**, ao lado do ícone vermelho de excluir, aparece um novo ícone azul-marinho de **lápis** (rótulo acessível "Editar {nome}").
- Ao clicar, abre um **Dialog** "Editar usuário" pré-preenchido com: nome, e-mail, perfil e status.
- Botões do diálogo: **Cancelar** e **Salvar alterações** (laranja GRD).
- Validações iguais às do "Novo usuário": nome e e-mail obrigatórios, formato de e-mail válido, e-mail único (ignorando o próprio usuário em edição).
- Ao salvar:
  - atualiza o usuário na lista (`users`);
  - se o **perfil** foi alterado, a matriz de permissões daquele usuário é redefinida pela função `permsForPerfil(novoPerfil)` — mesma regra usada na criação, mantendo consistência;
  - fecha o diálogo.
- A senha **não** é editada aqui (mantém o padrão do módulo — senha só é definida na criação). Fica pronto para, quando o Supabase estiver ligado, virar "Redefinir senha" via Auth Admin.

## Detalhes técnicos

Arquivo único afetado: `src/routes/app.admin.tsx`.

- Novo estado: `const [editing, setEditing] = useState<Usuario | null>(null)` e `const [editForm, setEditForm] = useState({ nome, email, perfil, status })` + `editError`.
- Nova função `openEdit(u: Usuario)` que popula `editForm` e abre o diálogo.
- Nova função `submitEdit(e)` que valida, chama `setUsers(prev => prev.map(...))` e, se `perfil` mudou, `setMatrix(prev => ({ ...prev, [id]: permsForPerfil(novoPerfil) }))`.
- Novo `<Dialog open={!!editing}>` com os mesmos campos do "Novo usuário", exceto senha/confirmar.
- Ícone `Pencil` do `lucide-react` (adicionar ao import existente).
- Como o estado é em memória (mesma store atual), a alteração reflete imediatamente na tabela e na "Matriz de permissões" logo abaixo.
