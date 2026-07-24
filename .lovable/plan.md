## Objetivo
Criar página `/app/catalogo-admin` no portal, acessível pelo menu lateral com item "CATÁLOGO" (ícone `BookImage`), listando em tabela somente leitura os equipamentos marcados para exibição no catálogo público.

## Alterações

### 1. Nova rota `src/routes/app.catalogo-admin.tsx`
- `createFileRoute("/app/catalogo-admin")`
- Busca via Supabase: `equipamentos` onde `exibir_catalogo = true`, ordenado por `nome`.
- Colunas exibidas: **NOME INTERNO** (`nome`), **NOME NO CATÁLOGO** (`catalogo_nome`, fallback "—"), **CATEGORIA** (`categoria`).
- Campo de busca (Input) filtrando por `nome` no client-side (case-insensitive).
- Estados de loading e vazio.
- Layout coerente com as demais páginas do portal (Card + Table shadcn), todos os rótulos em CAIXA ALTA (herdado do CSS global `.app-layout`).

### 2. Menu lateral `src/components/portal/PortalLayout.tsx`
- Adicionar item na lista `items`:
  ```
  { to: "/app/catalogo-admin", label: "Catálogo", icon: BookImage, exact: false }
  ```
- Importar `BookImage` de `lucide-react`.

### 3. Ajuste no título da topbar `src/routes/app.tsx`
- Adicionar entrada em `titles`: `"/app/catalogo-admin": "Catálogo"`.

## Notas técnicas
- Somente leitura — sem edição, sem mutações, sem upload.
- `catalogo_nome` já existe na tabela (usado pelo catálogo público); se não existir será tratado como coluna opcional retornando null → exibe "—".
- Nenhum outro arquivo/componente do sistema é alterado.
