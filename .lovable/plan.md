## Objetivo

No `/app`, mostrar todos os KPIs, gráficos e tabelas com **todos os dados**, sem filtro de ano/período.

## Mudanças em `src/routes/app.index.tsx`

1. **Remover UI de ano**
   - Excluir o estado `ano` / `anoAtual` / `setAno`, o `useMemo` `anosDisponiveis` e o bloco `<select>` de ano no header. Manter só o título "Painel inicial".

2. **Remover filtros por ano**
   - Excluir o helper `noAno` (não será mais usado).
   - `orcAno` → passa a ser `orcamentos` direto.
   - `medAno` → passa a ser `medicoes` direto.
   - `empAno` → passa a ser `emprestimos` direto.
   - `projConcluidosAno` → `projetos.filter(p => p.status === "CONCLUÍDO")`.
   - Atualizar todos os `useMemo` dependentes para as novas variáveis (`orcPorMes`, `orcPorStatus`, `previsaoVsFat`, `receitaEqPorMes`, `topClientes`, `acumulado`, `medAno` usos, etc.).

3. **KPIs — recalcular sem filtro**
   - `totalOrc = orcamentos.length`
   - `valorOrc = SUM(orcamentos.valor)`
   - `aprovados = orcamentos.filter(status === "APROVADO")`, `valorAprovado = SUM`
   - `taxaAprov = aprovados / totalOrc * 100`
   - `ticket = valorAprovado / aprovados.length`
   - `emNeg = orcamentos.filter(status === "EM NEGOCIAÇÃO")`
   - `projAndamento = projetos.filter(status === "EM ANDAMENTO")`
   - **Faturado**: usar `medicoes.filter(m => m.status === "RECEBIDA")` somando `valor` (conforme especificado pelo usuário; antes usava `data_recebimento`).
   - `saldoFaturar = max(0, valorAprovado − faturado)`
   - Equipamentos: sem alteração (já não filtram por ano) — `receitaEq` passa a somar todos os empréstimos.

4. **Rótulos**
   - Trocar "Orçamentos no ano" → "Total de orçamentos".
   - Trocar "Concluídos no ano" → "Projetos concluídos".
   - Trocar "Receita no ano" → "Receita de aluguel".

5. **Gráficos**
   - `orcPorMes`, `previsaoVsFat`, `receitaEqPorMes`, `acumulado`: agrupar por `YYYY-MM` (rótulo tipo `MMM/AA`) somando todos os anos em ordem cronológica, em vez do array fixo de 12 meses do ano selecionado. Isso preserva o histórico completo sem filtro.
   - `orcPorStatus`, `projPorStatus`, `eqPorStatus`, `topClientes`: já são agregações totais — só remover a dependência de `orcAno`/`aprovados` filtrados.

6. **Tabelas**
   - `ultimosOrc`, `projEmObra`, `eqManut`, `proxDevolucoes`: manter a lógica atual (não dependem de ano).

## Fora de escopo

- Nenhuma outra rota é alterada.
- Nenhuma mudança de schema, RLS ou stores.

## Verificação

- Build passa (`tsgo` roda no harness).
- `/app` abre sem o dropdown de ano, com números batendo com `SELECT count(*), sum(valor) FROM orcamentos` etc.
- Gráficos mensais mostram série completa histórica em ordem cronológica.