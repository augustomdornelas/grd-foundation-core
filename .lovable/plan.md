
## Diagnóstico

Acabei de testar os dois endereços:

- `https://grd-foundation-core.lovable.app` → **HTTP 200 (site funcionando)**
- `https://grupogrdbrasil.com.br` → **HTTP 500 (Cloudflare/Lovable)**

Ou seja, **o site publicado está no ar e funcionando**. O que está quebrado é apenas o **roteamento do domínio customizado** `grupogrdbrasil.com.br` até este projeto. A tela "This page didn't load" que você viu é a página de erro do Lovable quando o domínio chega até a infra mas não encontra o projeto correto (normalmente porque o domínio está vinculado a outro projeto Lovable, ou foi removido, ou o DNS ainda aponta para o lugar antigo).

Isso **não é um bug de código** — o `.lovable.app` responde 200. É configuração de domínio no painel do Lovable + DNS no registrador.

## O que precisa ser feito (você, no painel)

Não consigo alterar vinculação de domínio nem DNS pelo código. Os passos:

1. **Project Settings → Project → Domains** neste projeto (GRD Horizon).
2. Se `grupogrdbrasil.com.br` **não aparecer** na lista: clique em **Connect Domain**, digite `grupogrdbrasil.com.br` e siga o fluxo. Se disser que o domínio já está em outro projeto, vai pedir para provar propriedade (registro TXT `_lovable`). Faça isso.
3. Adicione também `www.grupogrdbrasil.com.br` como entrada separada.
4. No seu registrador (Registro.br / Cloudflare / etc.), confirme:
   - `A  @   185.158.133.1`
   - `A  www 185.158.133.1`
   - `TXT _lovable  <valor que o Lovable mostrar>`
   - Remova qualquer A/CNAME antigo apontando para outro lugar.
5. Aguarde o status ir para **Active** (pode levar minutos a algumas horas).

Se estiver em Cloudflare com proxy laranja, marque **"Domain uses Cloudflare or a similar proxy"** no diálogo (usa CNAME em vez de A).

## Sobre "corrigir tudo que fez de errado"

Revisando o que alterei em código relacionado a este problema, foi só o `src/integrations/supabase/client.ts` — deixei URL e chave anônima fixadas no projeto onde estão de fato todas as suas tabelas, buckets e dados (`fpuwyndpmcgwkuaqbcvm`). É o motivo do `.lovable.app` estar retornando 200 e o app carregar dados normalmente. **Não vou reverter isso**, porque reverter faria o app voltar a apontar para o projeto Cloud vazio e quebraria login, catálogo, equipamentos, orçamentos, tudo.

## O que farei quando você aprovar

Nada em código — não há nada a corrigir no repositório para este problema específico. Vou apenas:

- Confirmar mais uma vez, via `curl`, que `grd-foundation-core.lovable.app` continua 200.
- Te orientar em tempo real enquanto você faz os passos 1–5 acima, se quiser.
- Depois que o DNS propagar, testar `https://grupogrdbrasil.com.br/` de novo e confirmar 200.

Se preferir, posso em vez disso investigar outra hipótese: você tem alguma ideia de qual projeto Lovable pode estar segurando esse domínio hoje (algum projeto antigo/deletado com o mesmo nome)? Isso acelera o passo 2.
