## Problema

O arquivo `src/routes/app.projetos.tsx` funciona como rota PAI de `src/routes/app.projetos.$id.tsx`. Como o pai renderiza a listagem sem `<Outlet />`, ao clicar em "Ver detalhe" a URL muda para `/app/projetos/P-001`, o filho até casa, mas não há onde ele aparecer — então a tela continua mostrando a listagem (aparenta "não abrir nada").

## Correção

Converter a listagem em rota leaf `index`, seguindo a convenção do TanStack:

1. Renomear `src/routes/app.projetos.tsx` → `src/routes/app.projetos.index.tsx` (conteúdo idêntico, só muda o `createFileRoute("/app/projetos")` — que continua igual, pois `.index` mapeia para o mesmo path).
2. Assim `/app/projetos` passa a ser leaf (listagem) e `/app/projetos/$id` é outro leaf independente — sem necessidade de Outlet compartilhado.
3. O plugin do Router regenera `routeTree.gen.ts` automaticamente.

Nenhuma alteração é necessária em `app.projetos.$id.tsx`, no `Link` da listagem, nem no layout `/app`.

## Observação (fora do escopo desta correção, mas relevante)

Há um warning de hidratação por causa de `new Date(...).toLocaleDateString("pt-BR")` (fuso do server vs client). Não impede a navegação, mas se quiser posso corrigir em seguida formatando a data de forma determinística (`dd/mm/yyyy` manual a partir da string ISO).