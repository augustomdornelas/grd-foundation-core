## Diagnóstico

Após a atualização do modal de "Registrar empréstimo" o módulo começou a usar `@react-pdf/renderer` (via `PDFViewer` / `PDFDownloadLink` e `TermoEmprestimoDocument`) importado **no topo** de `src/components/equipamentos/EmprestimoDialog.tsx`. Esse componente é importado diretamente pelas rotas:

- `src/routes/app.equipamentos.index.tsx`
- `src/routes/app.equipamentos.$id.tsx`

`@react-pdf/renderer` é uma biblioteca browser-only e muito pesada. Importada no grafo síncrono de uma rota que também roda em SSR (TanStack Start), ela quebra a renderização/hydration do módulo Equipamentos assim que qualquer rota do módulo é aberta em produção — sintoma exato de "o site parou de funcionar depois da atualização em Registrar Empréstimo".

Confirmado nesta investigação:
- SSR do `/app/equipamentos` retorna 200, mas o HTML volta praticamente vazio (~4 KB, só o shell) — a árvore da rota não hidrata.
- Nenhum outro arquivo foi tocado após a introdução do PDF que justifique a quebra.
- O restante do projeto (equipamentos GET, dashboard etc.) continua respondendo normal — o problema é escopado ao bundle que carrega o dialog.

## Correção proposta (somente frontend, sem tocar em dados)

1. **Isolar `@react-pdf/renderer` do grafo de módulos das rotas**
   - Remover os imports de `PDFViewer`, `PDFDownloadLink`, `TermoEmprestimoDocument` e `termoFileName` do topo de `EmprestimoDialog.tsx`.
   - Criar `src/components/equipamentos/TermoPreview.tsx` contendo toda a UI do modal de prévia do PDF (viewer + botão de download). Esse componente concentra 100% dos imports de `@react-pdf/renderer` e do `termo-emprestimo-pdf`.
   - Em `EmprestimoDialog.tsx` carregar `TermoPreview` via `React.lazy(() => import('./TermoPreview'))` dentro de `<ClientOnly>` + `<Suspense fallback={...}>`, montado apenas quando `previewOpen === true`.
   - Resultado: SSR e o bundle inicial das rotas de Equipamentos deixam de puxar `@react-pdf/renderer`; ele só é baixado quando o usuário salva um empréstimo.

2. **Fallback de download seguro**
   - Enquanto a prévia (`PDFViewer`) está carregando, exibir estado "Gerando PDF…" com botão desabilitado. `PDFDownloadLink` também fica dentro do `TermoPreview`, então não precisa de nenhum shim adicional.

3. **Validação**
   - `curl` em `/app/equipamentos` e `/app/equipamentos/:id` deve devolver HTML SSR com conteúdo real da página (não só o shell).
   - Abrir a rota via Playwright autenticado (quando o usuário reabrir logado) e conferir: (a) página monta, (b) botão "Registrar empréstimo" abre o modal, (c) após salvar, a prévia do PDF aparece e o download funciona.
   - Nenhum erro `window is not defined` / `iframe is not defined` no log do dev-server nem no console do preview.

## Fora de escopo (não vou mexer)

- Schema do Supabase, RLS, colunas de `emprestimos`, políticas.
- Fluxo de negócio do empréstimo (validações, cálculo de custo, campos do formulário).
- Layout/estilo do PDF (`termo-emprestimo-pdf.tsx` fica igual — só muda quem o importa).
- Autenticação do preview (o redirecionamento para `/login` observado agora é apenas porque a sessão de teste está `signed_out`, não é o bug reportado).

## Arquivos afetados

- `src/components/equipamentos/EmprestimoDialog.tsx` — remover imports pesados, montar prévia via `lazy` + `ClientOnly`.
- `src/components/equipamentos/TermoPreview.tsx` — **novo**, encapsula `PDFViewer`, `PDFDownloadLink` e o documento.
