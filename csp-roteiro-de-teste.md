# Roteiro de teste da CSP — Etapa 3

A política está em **modo relatório** (`Content-Security-Policy-Report-Only`).
Nada é bloqueado: o navegador apenas escreve no console o que *teria* sido
bloqueado. Rode este roteiro inteiro e me traga as violações — só depois
trocamos para bloqueio de verdade.

## Como rodar

```
npm run dev
```

Abra o Chrome, tecle **F12**, vá em **Console** e ligue o filtro para não perder
nada: clique na engrenagem do console e marque **Preserve log** (ele apaga o
console a cada navegação, e é justamente na navegação que a violação aparece).

Uma violação tem esta cara:

```
[Report Only] Refused to load the script 'https://exemplo.com/x.js'
because it violates the following Content Security Policy directive:
"script-src 'self' 'nonce-...' https://autenticador.secullum.com.br".
```

**Copie a linha inteira.** O que interessa é o par: *qual recurso* e *qual
diretiva*. Sem os dois eu só posso adivinhar.

## Antes de tudo: o nonce está funcionando?

No console, cole:

```js
document.querySelector('meta[property="csp-nonce"]')?.content
```

Tem que devolver uma string tipo `N9MrMcR6oqaCtS8G4O51sw`. Recarregue a página:
o valor tem que **mudar**. Se vier `undefined` ou repetir, pare aqui e me avise
— o resto do teste não vale.

---

## As telas, e o que olhar em cada uma

### 1. Home (`/`)
As fotos de obra vêm do storage do Supabase e o og:image vem do R2.
**Olhar:** as imagens aparecem? Alguma violação de `img-src`?

### 2. `/ponto` — **o teste mais importante**
É a única tela que carrega script de terceiro. O script da Secullum tem 535
bytes, o que quase certamente quer dizer que ele é um carregador: vai buscar
outra coisa, e essa outra coisa pode estar em domínio que eu não tinha como
saber.

**Olhar, nesta ordem:**
- O formulário de login aparece?
- Violação de `script-src`? → tem um segundo domínio a autorizar.
- Violação de `frame-src`? → o login é um iframe. Deixei `frame-src 'none'`
  porque não há iframe nenhum no nosso código; se ele criar um, a violação diz
  o domínio exato e eu acrescento só ele.
- Violação de `connect-src`? → o script conversa com outro host.

Teste também **no celular, com dados móveis**, e veja se o formulário chega
antes dos 8 segundos ou se aparece o aviso "está demorando".

### 3. `/app/ponto`
Mesma coisa da anterior, mas logado e dentro do Portal.

### 4. Login do Portal (`/login`)
Fala com o Supabase Auth por `fetch`.
**Olhar:** violação de `connect-src`. O login conclui?

### 5. Módulo de RH — as telas
Abra, uma a uma: `/app/rh`, `/app/rh/vagas`, `/app/rh/selecao`,
`/app/rh/candidatos`, `/app/rh/admissoes`, `/app/rh/colaboradores`,
`/app/rh/documentos`, `/app/rh/cargos`, `/app/rh/configuracoes`.

**Olhar:** no Kanban de seleção, a bolinha colorida de cada etapa vem de um
atributo `style=` inline. Se aparecer violação de `style-src`, me avise — não
deveria, porque a política aceita estilo inline, mas é o ponto onde eu erraria.

### 6. Upload de arquivo
Em `/app/rh/colaboradores`, abra a ficha de alguém → aba **Documentos** →
**Adicionar documento** → anexe um PDF.
**Olhar:** violação de `connect-src` (o upload é um `fetch` para o Supabase).
O arquivo sobe?

### 7. Geração de PDF
Em `/app/rh/vagas`, abra uma vaga → **Requisição em PDF**.
O jsPDF carrega o logo, passa por um `canvas` e devolve um `blob:`.
**Olhar:** violação de `img-src` mencionando `blob:` ou `data:`. O PDF baixa e
abre com o logo?

Repita com a **Ficha do colaborador** e a **Carta-proposta**, que fazem o mesmo
caminho.

### 8. Exportar CSV
Em `/app/rh/documentos`, clique em **Exportar CSV**. Ele cria um `blob:` e
dispara o download.
**Olhar:** o arquivo baixa? Abre no Excel com as colunas certas?

### 9. Site público de vagas
`/trabalhe-conosco`, uma vaga em `/vagas/:slug` e `/candidato`.
Se houver vaga publicada, preencha o formulário até o fim — inclusive o envio
do currículo, que é upload para o storage.
**Olhar:** `connect-src` no envio, e o e-mail do magic link em `/candidato`.

### 10. Fechar a volta
Navegue entre as telas **sem recarregar a página**. O TanStack Router injeta
script sozinho ao pré-carregar rota, e é aí que o nonce do cliente entra em
ação.
**Olhar:** violação de `script-src` que só aparece ao navegar, nunca ao
recarregar. Esse é o sintoma de nonce que não chegou ao cliente.

---

## O que fazer com o resultado

**Nenhuma violação:** me avise e eu troco `MODO_CSP` para `"enforce"` em
`src/lib/security-headers.ts`. É uma linha.

**Alguma violação:** me traga as linhas do console. Eu acrescento **o domínio
exato que o relatório nomear** — nunca `*`, nunca `'unsafe-inline'` em
`script-src`. Se a única saída for afrouxar, eu paro e pergunto antes.

## Duas coisas que ainda não estão na política

**GA4 e Meta Pixel.** Não estão no código, então não entraram — pela sua
própria regra. Quando entrarem, precisam de `www.googletagmanager.com` e
`*.google-analytics.com` em `script-src` e `connect-src`, e
`connect.facebook.net` e `www.facebook.com` para o Pixel. Se ligarem o
rastreamento com a CSP já em bloqueio e sem esses domínios, ele falha calado —
o script não roda e ninguém percebe, porque não há tela quebrada para avisar.

**HSTS curto, de propósito.** O `max-age` está em **300 segundos**, não em um
ano. É o único header do lote que não desfaz por deploy: o navegador obedece
pelo tempo do `max-age`, então errar com um ano configurado são doze meses de
gente sem conseguir abrir o site. Depois de uma semana em produção sem
problema, subimos para `31536000`.

Sobre `includeSubDomains`: continua de fora, mas o motivo mudou depois de
verificar os domínios. `grupogrdbrasil.com` responde 200 e é o site;
`grupogrdbrasil.com.br` responde 404 e `www.grupogrdbrasil.com.br` responde 522.
São domínios registráveis diferentes — o webmail em `.com.br:2096` está fora do
alcance de `includeSubDomains` de qualquer jeito. A dúvida que sobra é sobre
subdomínios de `.com`, que ninguém enumerou. Levante a lista e a gente decide.

**O botão de webmail do Portal parece quebrado.** `grupogrdbrasil.com.br:2096`
devolve 404. Não faz parte desta tarefa, mas apareceu ao conferir o domínio.
