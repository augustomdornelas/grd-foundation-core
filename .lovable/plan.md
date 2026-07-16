## Problema

O módulo Equipamentos falha ao carregar porque o Postgres nega acesso às tabelas antes mesmo da RLS ser avaliada. Os logs de rede mostram:

```
GET /rest/v1/equipamentos → 401
"permission denied for table equipamentos"
hint: "Grant the required privileges to the current role with: GRANT SELECT ON public.equipamentos TO anon;"
```

O mesmo ocorre em `emprestimos` e `manutencoes`. Uma consulta ao catálogo confirma que **nenhuma das cinco tabelas do módulo tem GRANT algum** para `anon`, `authenticated` ou `service_role`.

## Correção

Criar uma migration única que concede os privilégios necessários (as políticas de RLS já existentes continuam controlando o acesso linha a linha):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimos            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencoes            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_equipamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais_equipamentos     TO authenticated;

GRANT ALL ON public.equipamentos, public.emprestimos, public.manutencoes,
             public.categorias_equipamentos, public.locais_equipamentos
        TO service_role;
```

Sem grant para `anon` — o módulo é área logada.

## Verificação

- Recarregar `/app/equipamentos` e confirmar que as três requisições (`equipamentos`, `emprestimos`, `manutencoes`) voltam com status 200.
- Nenhuma outra alteração de código; store e componentes já estão corretos.
