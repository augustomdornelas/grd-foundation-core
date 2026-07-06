# Login com credenciais fixas de demo

Manter a v1 sem backend, mas fazer o formulário de `/login` validar as credenciais no cliente contra um par fixo. Credenciais erradas mostram erro; credenciais corretas seguem para `/app` como já acontece.

## Credenciais

- **Usuário:** `demo@grupogrd.com.br`
- **Senha:** `grd2026`

Exibidas de forma discreta na própria tela de login, num bloco de "Credenciais de demonstração", para quem estiver testando saber o que digitar.

## Mudanças

1. **`src/routes/login.tsx`**
   - Adicionar constantes `DEMO_USER` e `DEMO_PASSWORD`.
   - Trocar o `submit` atual (que sempre navega) por: validar campos com `zod` (obrigatórios, e-mail válido), comparar com as constantes.
     - Se bater: navegar para `/app` (comportamento atual).
     - Se não bater: mostrar mensagem de erro em vermelho abaixo do formulário ("Usuário ou senha incorretos").
   - Adicionar um card informativo abaixo do botão "Entrar" com as credenciais de demo em `<code>`, sinalizando que é ambiente de demonstração.
   - Manter o aviso "Acesso exclusivo para equipe autorizada".

2. **Nenhuma outra rota é alterada.** As rotas `/app/*` continuam sem `beforeLoad` guard — isso é coerente com o escopo mock aceito na memória de segurança. Não estou reintroduzindo o finding `no_real_auth`; ele permanece aceito até habilitarmos backend real.

## Fora do escopo

- Backend, banco de usuários, sessão real, logout com invalidação, guard em `/app/*`, hashing de senha. Tudo isso fica para quando ativarmos o Lovable Cloud.
