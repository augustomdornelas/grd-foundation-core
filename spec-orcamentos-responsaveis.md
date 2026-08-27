# Spec — Orçamentos: notas obrigatórias, alerta de inatividade e responsáveis

**Projeto:** grd-foundation-core (Grupo GRD) · pasta local `grd-antigo`
**Stack:** TanStack Start + React + Supabase (`fpuwyndpmcgwkuaqbcvm`) + shadcn/ui
**Pedido por:** Natalia · 27/08/2026

---

## Antes de escrever qualquer código

Leia estes arquivos e me diga o que encontrou **antes** de propor alterações:

- `src/lib/orcamentos-store.ts` — como o orçamento é lido/gravado hoje e quais status existem
- `src/routes/app.comercial.tsx` — a tela de orçamentos
- `src/lib/projetos-store.ts` e `src/routes/app.projetos.index.tsx` / `app.projetos.$id.tsx` — cadastro e edição de projetos
- `supabase/migrations/20260812140000_orcamentos_planejamento.sql` — estrutura atual
- `src/lib/access-store.ts` e `src/routes/app.admin.tsx` — como permissões e cadastros auxiliares são feitos

**Atenção:** as migrations do repositório estão defasadas em relação ao banco real (a tabela `projetos`, por exemplo, tem colunas a mais do que a migration declara). A fonte de verdade é o `information_schema` do Supabase, não o arquivo `.sql`. Confirme a estrutura real antes de gerar a migration.

---

## Regras de trabalho

1. Trabalhe numa branch nova: `git checkout -b orcamentos-notas-responsaveis`
2. Não commite na `main` — ela vai direto para produção via Hostinger
3. Ao final de cada bloco, rode `npx tsc --noEmit` e corrija antes de seguir
4. Toda alteração de banco vira uma migration em `supabase/migrations/`, com data no nome
5. **Pare e pergunte** antes de: apagar coluna existente, alterar status já usados em registros reais, ou mudar permissões de acesso

---

## Requisito 1 — Nota obrigatória em toda mudança de status

Hoje o status do orçamento muda sem registrar o motivo. Isso precisa acabar.

**Comportamento esperado:**

- Ao trocar o status de um orçamento, abre um diálogo pedindo uma nota. O botão de salvar fica desabilitado enquanto o texto estiver vazio (mínimo 5 caracteres, sem contar espaços).
- Não existe caminho alternativo: se o status muda, a nota é gravada junto, na mesma transação. Se a gravação da nota falhar, o status **não** muda.
- Também deve ser possível inserir uma nota **sem** mudar o status (registro de contato, follow-up etc.).
- O orçamento passa a ter um histórico visível de notas, em ordem cronológica decrescente, mostrando: data/hora, autor, texto e — quando houve — a transição de status (`De: Em negociação → Para: Aprovado`).

**Banco — tabela nova `orcamento_notas`:**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | default `gen_random_uuid()` |
| `orcamento_id` | uuid FK → `orcamentos.id` | `on delete cascade` |
| `texto` | text NOT NULL | |
| `status_anterior` | text NULL | nulo quando é nota avulsa |
| `status_novo` | text NULL | nulo quando é nota avulsa |
| `autor_id` | uuid NULL | usuário logado |
| `autor_nome` | text NULL | desnormalizado, para o histórico não quebrar se o usuário sumir |
| `created_at` | timestamptz | default `now()` |

Índice em `(orcamento_id, created_at desc)`. RLS no mesmo padrão das outras tabelas do projeto (leitura autenticada, escrita autenticada).

---

## Requisito 2 — Contador de dias sem atualização

Hoje o contador aparece em todo orçamento. Deve aparecer **apenas** em dois status:

- **Em negociação**
- **Aguardando retorno**

Em qualquer outro status (aprovado, recusado, rascunho, etc.) não mostra nada — nem "0 dias", nem o rótulo vazio. O espaço fica limpo.

**Como contar:** dias corridos desde a **data da última nota inserida** naquele orçamento (nota avulsa ou nota de mudança de status, tanto faz — qualquer nota zera o contador).

Se o orçamento ainda não tem nenhuma nota, conte a partir da data de criação do orçamento e deixe isso explícito no rótulo (ex.: `18 dias sem nota`).

**Sugestão de destaque visual** (confirme comigo antes de aplicar): até 7 dias neutro, de 8 a 15 dias em âmbar, acima de 15 dias em vermelho.

---

## Requisito 3 — Pré-cadastro de responsáveis técnico e comercial

Os nomes não podem ser digitados na mão — dá erro de digitação e quebra o filtro. Precisa de um cadastro próprio, e os campos do projeto puxam dele automaticamente.

**Banco — tabela nova `responsaveis`:**

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | |
| `nome` | text NOT NULL | |
| `email` | text NULL | |
| `telefone` | text NULL | |
| `tipo` | text NOT NULL | `tecnico`, `comercial` ou `ambos` |
| `ativo` | boolean | default `true` |
| `created_at` / `updated_at` | timestamptz | trigger de `updated_at` no padrão do projeto |

**Colunas novas em `projetos`:**

- `responsavel_tecnico_id` uuid NULL → FK `responsaveis(id)`
- `responsavel_comercial_id` uuid NULL → FK `responsaveis(id)`

Use `on delete set null` — apagar um responsável não pode apagar projeto.

**Telas:**

1. **Cadastro de responsáveis** — uma aba nova em `/app/admin` (ou o lugar equivalente onde já ficam os cadastros auxiliares), com listagem, criar, editar e inativar. Inativar, não apagar: responsável inativo some dos menus de seleção, mas continua aparecendo nos projetos antigos.

2. **Formulário de adicionar/editar projeto** — dois campos novos, `Responsável técnico` e `Responsável comercial`, cada um um combobox com busca por nome. O combobox técnico lista quem é `tecnico` ou `ambos`; o comercial lista `comercial` ou `ambos`. Só entram os ativos.

3. Dentro do combobox, um item **"+ Cadastrar novo responsável"** que abre um diálogo rápido (nome + tipo), salva e já deixa selecionado — sem sair da tela do projeto.

---

## Requisito 4 — Filtros por responsável

Na listagem de projetos, adicionar filtros por **responsável técnico** e por **responsável comercial**, combináveis com os filtros que já existem hoje (não substitua nenhum).

Detalhes:

- Cada filtro é um select de múltipla escolha alimentado pela tabela `responsaveis`
- Os filtros ativos aparecem como chips removíveis, com um "Limpar filtros"
- Se a listagem de orçamentos também tiver responsável, aplique o mesmo filtro lá
- Aproveite e adicione o filtro por **dias sem atualização** (ex.: "mais de 15 dias parados"), já que o dado do Requisito 2 passa a existir

---

## Entrega

Ao terminar:

1. `npx tsc --noEmit` sem erros
2. Me mostre o SQL das migrations para eu aplicar no Supabase (elas **não** rodam sozinhas — o módulo de EPIs já quebrou uma vez por causa disso)
3. Commit na branch `orcamentos-notas-responsaveis` e push, **sem merge na main**
4. Liste o que ficou de fora ou precisa de decisão

---

## Pendências — Natalia precisa definir

Coisas que ficaram em aberto e valem confirmar antes ou durante a implementação:

- [ ] Quais são exatamente todos os status de orçamento hoje? (a spec assume que "Em negociação" e "Aguardando retorno" existem com esses nomes)
- [ ] As faixas de cor do contador de dias (7 / 15) estão boas?
- [ ] Nota antiga pode ser editada ou apagada, ou o histórico é imutável?
- [ ] Quem pode cadastrar responsáveis — só administrador, ou o comercial também?
- [ ] Responsável técnico e comercial ficam só no projeto, ou também no orçamento?
- [ ] "e mais coisas" — o resto da lista da Natalia entra aqui
