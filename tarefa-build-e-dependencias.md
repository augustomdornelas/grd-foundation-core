# Tarefa: `hono` ausente e a mistura bun + npm

Levantamento de 27/08/2026. Não mexi em nada — é decisão sua, e a correção
óbvia (rodar um install) piora o problema de fundo se for feita sem escolher
antes qual gerenciador manda.

## O sintoma

`npm run start` — o entry de produção da Hostinger — não roda nesta máquina:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@hono/node-server'
imported from C:\Users\augus\grd-antigo\server-node.mjs
```

`hono` e `@hono/node-server` estão declarados no `package.json`, mas não estão
em `node_modules`.

## O que aconteceu, na ordem

| Quando | O quê |
|---|---|
| 08/08 14:13 | `bun.lock` gerado. **Não contém hono.** |
| 08/08 17:16 | `node_modules` instalado — por **npm** (existe `node_modules/.package-lock.json`, que é marca do npm). Também sem hono. |
| 11/08 | commit `0a09bb3` "Update package.json" acrescenta `hono`, `@hono/node-server` e o script `start` — **sem tocar em lockfile nenhum**. |

Commit que altera `package.json` e não altera lockfile é a assinatura de uma
edição feita pela interface (GitHub ou Lovable), não de um `bun add` / `npm
install` rodado por alguém. A dependência entrou no papel e nunca foi instalada.

## O que isso quebra, e o que não quebra

**Provavelmente NÃO quebra a produção.** Se a Hostinger roda `npm install`, ele
resolve a partir do `package.json` e ignora o `bun.lock` — o `hono` seria
instalado lá. Vale confirmar no log de deploy antes de dar por certo.

**Quebra a máquina local**, que é o problema real: não dá para reproduzir
produção aqui. Nesta sessão isso me impediu de servir o build de produção para
inspecionar o HTML — precisei validar a CSP pelo servidor de desenvolvimento.
Um bug que só aparece no build de produção não teria como ser investigado.

## O problema de fundo

Três gerenciadores deixaram rastro no repositório:

- `bunfig.toml` e `bun.lock` — versionados, dizem "este projeto usa bun"
- `node_modules/.package-lock.json` — diz que quem instalou foi o npm
- `package-lock.json` — **não existe e não está no `.gitignore`**, ou seja, foi
  gerado localmente em algum momento e nunca commitado

Com dois lockfiles possíveis e nenhum autoritativo, cada máquina resolve as
versões do seu jeito, e a produção pode receber uma árvore de dependências
diferente da que foi testada. É o mesmo tipo de divergência silenciosa que fez
a migration de EPIs ficar dois meses no repositório sem estar no banco.

## O que decidir

**1. Qual gerenciador manda?**

- **bun** — combina com o que já está versionado (`bunfig.toml`, `bun.lock`).
  Corrigir é `bun install`, que atualiza o `bun.lock` com o hono. Exige que a
  Hostinger tenha bun, ou que o deploy continue usando npm — e aí o lockfile
  versionado não vale para produção, que é o pior dos dois mundos.
- **npm** — combina com o que a Hostinger provavelmente já faz. Corrigir é
  `npm install`, commitar o `package-lock.json` gerado e **apagar `bun.lock` e
  `bunfig.toml`**, para não sobrar dois.

Recomendo **npm**, por um motivo prático e não ideológico: é o que o ambiente de
deploy usa hoje. Lockfile que não vale no lugar onde o código roda não protege
nada.

**2. Confirmar como a Hostinger instala.** Antes de escolher, vale olhar o log
do último deploy. Se lá roda `npm ci`, a ausência de `package-lock.json` faz o
comando falhar — e aí o deploy só funciona por estar rodando `npm install`, que
é justamente o que não trava versão.

## Depois de decidir

Com a resposta em mãos, eu faço:

1. o install pelo gerenciador escolhido;
2. remoção do lockfile perdedor e do `bunfig.toml`, se for o caso;
3. um `npm run build && npm run start` local, servindo o build de produção e
   conferindo que o site sobe — o teste que hoje não é possível fazer;
4. commit separado, só de infraestrutura, sem misturar com código de produto.

## Nota lateral

O botão de webmail do Portal (`src/routes/app.webmail.tsx`) aponta para
`https://grupogrdbrasil.com.br:2096/`, que responde **404**. O domínio
`grupogrdbrasil.com.br` também responde 404, e `www.grupogrdbrasil.com.br`
responde 522. O site vivo é `grupogrdbrasil.com`. Apareceu ao conferir os
domínios para o HSTS; é outra tarefa, mas fica registrado.
