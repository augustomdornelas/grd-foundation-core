## Diagnóstico (verificado agora)

Rodei uma auditoria no código de autenticação e no backend. **O código de login está correto** — o problema é outro.

### 1. Configuração do Supabase (client.ts / client.server.ts)
Ambos leem `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` do `.env`. Valores atuais:

- `VITE_SUPABASE_URL = https://uxamqazqhcpuxlthvxbp.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` → ref `uxamqazqhcpuxlthvxbp` ✅ (URL e chave batem)

Observação: você mencionou `fpuwyndpmcgwkuaqbcvm` como "o projeto correto". Esse **não é** o projeto do backend atual. Existe no `.env` uma variável órfã `VITE_SUPABASE_ANON_KEY` apontando pra esse projeto antigo, mas ela **não é usada por nenhum código** (o `client.ts` foi corrigido dias atrás para ler `VITE_SUPABASE_PUBLISHABLE_KEY`). Ou seja: o app está falando com `uxamqazqhcpuxlthvxbp`, que é o projeto ativo do Lovable Cloud.

### 2. Uppercase em senha/e-mail
- `src/styles.css` (linhas 107-110) aplica `text-transform: uppercase` só dentro de `.app-layout`, e **exclui** `type="email"`, `type="password"`, etc.
- `/login` **não está** dentro de `.app-layout` — nenhum uppercase é aplicado, nem visual nem no valor.
- `src/routes/login.tsx` envia `email: user.trim()` e `password: password` para `supabase.auth.signInWithPassword`, **sem** `.toUpperCase()` nem qualquer outra transformação.

Nenhuma alteração recente de CSS/form quebrou o login.

### 3. Causa real do "usuário ou senha incorretos"
Consultei `auth.users` no backend atual:

```
select id, email from auth.users → []  (zero linhas)
```

**Não existe nenhum usuário cadastrado no projeto ativo.** Por isso qualquer credencial retorna "Invalid login credentials", que sua UI traduz como "usuário ou senha incorretos". Isso é consistente com um cenário em que o backend do Lovable Cloud foi (re)provisionado / trocado em algum momento — os usuários antigos ficaram no projeto `fpuwyndpmcgwkuaqbcvm` (que hoje não é mais o backend do app).

## O que fazer

Preciso de uma decisão sua antes de mexer em qualquer coisa, porque envolve dados de acesso:

**Opção A — Recriar usuários no backend atual (recomendado)**
- Você me passa a lista de e-mails que precisam voltar a ter acesso.
- Eu crio cada um no backend ativo (`uxamqazqhcpuxlthvxbp`) com uma senha provisória, já confirmados, e você redistribui as senhas para o time trocar no primeiro login.
- Limpo a variável órfã `VITE_SUPABASE_ANON_KEY` do `.env` pra não gerar confusão futura.

**Opção B — Apenas 1 usuário admin agora**
- Mesmo fluxo da A, mas só um usuário (ex.: o seu) pra você entrar, e depois cadastramos o resto pelo módulo `/app/admin`.

**Opção C — Você prefere investigar migrar os usuários do projeto antigo?**
- Isso exigiria acesso ao projeto antigo `fpuwyndpmcgwkuaqbcvm`, que não é gerenciado por este app no Lovable Cloud. Só faz sentido se você tiver certeza que quer voltar pra aquele backend inteiro (o que significaria trocar URL+chave e perder os dados atuais de equipamentos/orçamentos/clientes que estão no backend novo). **Não recomendo.**

Me diga qual opção seguir (e, se A/B, quais e-mails + se quer que eu gere as senhas provisórias).
