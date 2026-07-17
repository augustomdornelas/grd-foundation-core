
## Diagnóstico

Não consigo reproduzir o erro no navegador porque a sessão do sandbox está deslogada. Do lado do servidor:

- Tabela `orcamentos` tem 0 registros mas está com todas as colunas corretas e permissões OK.
- A rota `/app/comercial` **não define `errorComponent`** — se qualquer coisa lançar exceção dentro do componente, a UI cai no boundary genérico do TanStack mostrando "erro de carregamento" sem mensagem detalhada.
- No cálculo dos KPIs (`useMemo`), há divisões que quebram quando o dataset está vazio (`ticket = total/qtd`, `conv = aprovados/total`) e conversões numéricas sem coerção defensiva (`a + o.valor` com `valor` possivelmente `null` vindo do banco).

Ou seja, tem duas coisas a resolver: **(a)** mostrar a mensagem real do erro ao invés de tela de "erro de carregamento" e **(b)** blindar os cálculos para não estourarem com base vazia ou valores nulos.

## Plano

### 1. Adicionar `errorComponent` em `/app/comercial`
- Editar `src/routes/app.comercial.tsx` e passar `errorComponent` no `createFileRoute`, exibindo `error.message` + botão "Tentar novamente" que chama `router.invalidate()` + `reset()`.
- Assim, mesmo que a causa raiz seja outra, o usuário (e nós) vemos o erro exato no lugar do "erro de carregamento".

### 2. Blindar os cálculos do dashboard
Em `src/routes/app.comercial.tsx`, dentro do `useMemo` de métricas:
- Trocar todos os `a + o.valor` por `a + Number(o.valor ?? 0)`.
- Guardar divisões: `ticket = qtd ? total / qtd : 0`, `conv = total ? valorAprovado / total : 0`.
- No filtro por data (`dentro(o.data, range)` e `new Date(o.data)`), tratar `o.data` vazio/`null` sem lançar (`if (!o.data) return false`).

### 3. Blindar o `fromRow` da store
Em `src/lib/orcamentos-store.ts`, garantir que `valor`, `probabilidade` são sempre `number` finito (`Number.isFinite(x) ? x : 0`) — já quase está, só reforçar contra `NaN`.

### 4. Verificar depois do fix
Rodar Playwright já autenticado (se possível) ou pedir print do console ao usuário. Se após o `errorComponent` a página seguir mostrando erro, veremos a mensagem real e trato na sequência.

### Observação
Se o que você vê literalmente é uma tela em branco (não a mensagem "erro de carregamento") ou o texto do erro é diferente, me passe: **(a)** print da tela e **(b)** mensagem do console (F12 → Console). Com o `errorComponent` novo isso vai aparecer explicitamente na própria página.

---

Se aprovar, aplico as 3 alterações acima em um único passo.
