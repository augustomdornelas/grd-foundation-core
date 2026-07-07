## Diagnóstico

Depois que a Previsão de Entrada foi conectada aos stores (`orcamentos-store`, `medicoes-comercial-store`), dois bugs derrubaram a aplicação inteira:

### 1. Loop infinito → "Maximum update depth exceeded" (bloco `PrevisaoEntradaResumo` no `/app`)
Os hooks `useOrcamentos(s => s.filter(...))` e `useAprovadosResumo()` passam um selector que retorna **um array novo a cada chamada** (`.filter(...)` / `.map(...)`). Como o `useSyncExternalStore` usa `() => selector(state)` como `getSnapshot`, cada leitura devolve uma referência diferente → React acredita que a store mudou → re-renderiza → novo array → loop.

### 2. Hydration mismatch (`10d` vs `9d` no bloco Equipamentos, seeds de datas)
O `seed()` de orçamentos/medições usa `new Date()` **no momento em que o módulo é importado**. Isso acontece tanto no SSR quanto no cliente, em instantes diferentes, produzindo datas divergentes. Como o `/app` consome esses stores diretamente (sem o gate `mounted` que o `/previsao` já tem), o HTML do servidor e o do cliente ficam diferentes.

## Correções

### A. Tornar os stores estáveis para `useSyncExternalStore`
Em `src/lib/orcamentos-store.ts` e `src/lib/medicoes-comercial-store.ts`:

- Trocar a implementação dos hooks para **sempre inscrever no state raiz** (referência estável, só muda quando `emit()` roda) e aplicar o selector fora, no componente, via `useMemo`:
  ```ts
  export function useOrcamentos<T>(selector: (s: Orcamento[]) => T): T {
    const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return useMemo(() => selector(state), [state, selector]);
  }
  ```
  onde `getSnapshot = () => state` e `getServerSnapshot = () => SSR_EMPTY` (array vazio congelado).
- Mesma mudança em `useMedicoes`.
- `useAprovadosResumo` passa a computar via `useMemo` sobre as duas fontes.

Isso elimina o loop sem exigir mudanças nos componentes que já chamam `useOrcamentos(s => s.filter(...))`.

### B. Evitar hydration mismatch das datas dos seeds
Retornar `[]` no `getServerSnapshot` faz o SSR renderizar com estado vazio e o cliente hidratar com o mesmo vazio, depois `useSyncExternalStore` re-renderiza com o state real do cliente. É o padrão oficial para stores que dependem de `localStorage`/hora atual e resolve o mismatch de `10d/9d` no `/app` sem precisar espalhar flags `mounted` pelos blocos.

Como consequência positiva: o gate `mounted` do `/app/previsao` pode continuar como está (não vou mexer), e o `/app` deixa de crashar.

### C. Nada mais muda
- Não mexo em `PrevisaoEntrada.tsx`, `app.comercial.tsx`, sidebar, rotas, seeds ou visual.
- Não mexo em Supabase/auth.

## Arquivos afetados
- `src/lib/orcamentos-store.ts` — reescrever apenas o hook `useOrcamentos` + adicionar `getServerSnapshot`.
- `src/lib/medicoes-comercial-store.ts` — mesma mudança em `useMedicoes` e ajuste do `useAprovadosResumo` para usar `useMemo`.

## Validação
- Abrir `/app` → sem "Maximum update depth" no console, sem tela de erro.
- Abrir `/app/previsao` → continua funcionando.
- Abrir `/app/comercial` → continua funcionando.
- Sem warning de hydration mismatch nos blocos que usam datas relativas.