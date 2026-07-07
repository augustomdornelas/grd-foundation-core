## Objetivo

Permitir que o Administrador defina, por usuário:
1. Quais **abas** do sistema ele pode ver/editar (Comercial, Previsão, Projetos, Equipamentos, Webmail, Admin).
2. Quais **gráficos/seções** aparecem no Painel inicial (`/app`).

Tudo persistido em `localStorage` (mesma camada mock atual — pronto para migrar ao Supabase depois).

## O que muda

### 1. Nova store `src/lib/access-store.ts`
- Guarda `Record<userId, { modulos: Record<ModuloKey, {ver:boolean; editar:boolean}>; paineis: Record<PainelKey, boolean> }>`.
- `PainelKey`: `"comercial" | "previsao" | "projetos" | "equipamentos" | "financeiro"` (cada bloco/seção do painel).
- Se um usuário ainda não tem entrada, usa o default do perfil (mesma matriz atual `permsForPerfil` + todos os painéis dos módulos que ele pode ver).
- API: `useAccess(userId)`, `useCanSeeModule(userId, mod)`, `useCanShowPainel(userId, painel)`, `accessActions.setModulo(...)`, `accessActions.setPainel(...)`, `accessActions.resetToPerfil(userId, perfil)`.
- Segue o mesmo padrão dos stores existentes (`useSyncExternalStore` + `SSR_EMPTY` + `useMemo`) para não regressar o bug de loop/hydration.

### 2. `src/lib/current-user.ts`
- `useHasPermission(mod)` passa a ler da `access-store` (efetivo) em vez do array estático `permissoes` do perfil, com fallback para o default do perfil quando não houver override.
- Adiciona `useCanShowPainel(painel)` que lê da mesma store.
- Sidebar (`PortalLayout`) e painel (`app.index.tsx`) continuam usando os hooks — nenhum call site muda.

### 3. `src/routes/app.admin.tsx`
Substitui a "Matriz de permissões" local por duas seções conectadas à `access-store`:

**a) Matriz de acesso às abas** (por usuário × módulo, Ver/Editar):
- Módulos passam a incluir também: Comercial, Previsão de Entrada, Projetos, Equipamentos, Webmail. Administrador (Admin) fica travado só para perfil Administrador.
- Checkbox altera direto na store → todas as sessões do usuário no navegador refletem na hora.
- Botão "Restaurar padrão do perfil" por linha.

**b) Painel inicial — gráficos visíveis** (por usuário × painel):
- Grid com colunas: Comercial · Previsão de Entrada · Projetos · Equipamentos · Financeiro.
- Um checkbox por célula. Se o usuário não tem permissão para o módulo, a célula fica desabilitada.

### 4. `src/routes/app.index.tsx`
- Cada seção (`SecaoComercial`, `SecaoProjetos`, `SecaoEquipamentos`, `SecaoFinanceiro`, `PrevisaoEntradaResumo`) passa a ser renderizada apenas se `podeVerModulo && podeMostrarPainel(painelKey)`.
- Mensagem vazia quando o usuário não tem nenhum painel liberado permanece.

## Detalhes técnicos

- Persistência: `localStorage` key `grd_access_matrix_v1`.
- Nada muda no Supabase/RLS (a nota de segurança do topo de `app.index.tsx` continua válida — front só controla exibição).
- Sem novos pacotes.
- Sem alterações de rotas ou sidebar (a sidebar já filtra por `useHasPermission`, então passa a respeitar a nova store automaticamente).

## Arquivos afetados
- **novo:** `src/lib/access-store.ts`
- **editado:** `src/lib/current-user.ts` (hooks passam a consultar a store)
- **editado:** `src/routes/app.admin.tsx` (matriz + painel de gráficos conectados à store)
- **editado:** `src/routes/app.index.tsx` (cada seção respeita `useCanShowPainel`)

## Validação
- Como admin, desmarcar "Projetos → Ver" para um usuário → esse usuário perde o item na sidebar e a seção Projetos some do painel.
- Desmarcar "Painel · Comercial" mantendo "Aba · Comercial" ligada → o usuário continua acessando `/app/comercial`, mas o bloco Comercial some do `/app`.
- Recarregar a página mantém as escolhas (localStorage).
- Sem regressão de loop infinito (usa mesmo padrão `useSyncExternalStore + useMemo`).
