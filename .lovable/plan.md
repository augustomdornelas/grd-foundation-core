## Problema

O site inteiro está retornando erro 401 "Invalid API key" em todas as chamadas ao backend (equipamentos, empréstimos, manutenções, catálogo público etc.).

## Causa raiz (confirmada)

Os arquivos `src/integrations/supabase/client.ts` e `src/integrations/supabase/client.server.ts` foram sobrescritos em algum momento e passaram a ler a variável `VITE_SUPABASE_ANON_KEY` do `.env`. Essa variável aponta para um projeto Supabase antigo/diferente (`fpuwyndpmcgwkuaqbcvm`), enquanto o projeto atual do backend é `uxamqazqhcpuxlthvxbp`. Resultado: a chave enviada não pertence ao projeto chamado → 401 em todo lugar.

Teste direto na API com a chave correta (`VITE_SUPABASE_PUBLISHABLE_KEY`) retornou 200, confirmando que o backend está saudável — o problema é apenas de configuração no cliente.

## Correção

1. **`src/integrations/supabase/client.ts`**: passar a ler `VITE_SUPABASE_PUBLISHABLE_KEY` (não `VITE_SUPABASE_ANON_KEY`) e usar `VITE_SUPABASE_URL`.
2. **`src/integrations/supabase/client.server.ts`**: mesma correção, garantindo consistência entre cliente e servidor.
3. **`.env`**: remover a linha órfã `VITE_SUPABASE_ANON_KEY` que aponta para o projeto antigo, para evitar que volte a ser usada por engano.

Nada mais precisa mudar — nenhum dado do Supabase é afetado, é apenas o cliente lendo a chave errada.
