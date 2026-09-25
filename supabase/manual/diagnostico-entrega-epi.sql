-- ============================================================
-- Diagnóstico da entrega de EPIs — SÓ LEITURA, não altera nada
-- ------------------------------------------------------------
-- Cole no SQL Editor do Supabase. Uma única consulta, uma tabela de
-- resultado: cada linha é uma checagem, com o que se espera e o que o
-- banco tem hoje. Rode ANTES e DEPOIS da migration
-- 20260924100000_epis_entrega_permissoes_e_rpc.sql.
-- ============================================================
WITH tabelas(t) AS (
  VALUES ('funcionarios'), ('epis'), ('entregas_epi'), ('entrega_epi_itens'),
         ('compras_epi'), ('compra_epi_itens')
),
privs AS (
  SELECT t, r.papel, p.priv,
         CASE WHEN to_regclass('public.' || t) IS NULL THEN NULL
              ELSE has_table_privilege(r.papel, ('public.' || t)::regclass, p.priv) END AS tem
    FROM tabelas
   CROSS JOIN (VALUES ('anon'), ('authenticated')) r(papel)
   CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
)
SELECT 1 AS ordem, 'GRANT' AS tipo, t || ' / ' || papel AS objeto,
       CASE WHEN papel = 'anon' THEN 'nenhum'
            WHEN t = 'funcionarios' THEN 'SELECT, INSERT, UPDATE'
            ELSE 'SELECT, INSERT, UPDATE, DELETE' END AS esperado,
       coalesce(nullif(string_agg(priv, ', ' ORDER BY priv) FILTER (WHERE tem), ''), 'nenhum') AS atual
  FROM privs GROUP BY t, papel

UNION ALL
SELECT 2, 'RLS ligada', c.relname, 'true', c.relrowsecurity::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN (SELECT t FROM tabelas)

UNION ALL
SELECT 3, 'policy', tablename || ' -> ' || policyname,
       '', permissive || ' ' || cmd || ' ' || array_to_string(roles, ',') ||
       ' USING(' || coalesce(qual, '') || ') CHECK(' || coalesce(with_check, '') || ')'
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN (SELECT t FROM tabelas)

UNION ALL
SELECT 4, 'trigger', c.relname || ' -> ' || tg.tgname, '', p.proname ||
       CASE WHEN p.prosecdef THEN ' (SECURITY DEFINER)' ELSE ' (invoker)' END
  FROM pg_trigger tg
  JOIN pg_class c ON c.oid = tg.tgrelid
  JOIN pg_proc p ON p.oid = tg.tgfoid
 WHERE NOT tg.tgisinternal AND c.relname IN ('entregas_epi', 'entrega_epi_itens', 'funcionarios')

UNION ALL
SELECT 5, 'função', f.fn,
       CASE WHEN f.fn = 'epis_proximo_numero_termo(integer)' THEN 'existe; só service_role executa'
            ELSE 'existe; authenticated executa, anon não' END,
       CASE WHEN to_regprocedure('public.' || f.fn) IS NULL THEN 'NÃO EXISTE'
            ELSE 'existe; authenticated=' ||
                 has_function_privilege('authenticated', to_regprocedure('public.' || f.fn), 'EXECUTE') ||
                 ' anon=' || has_function_privilege('anon', to_regprocedure('public.' || f.fn), 'EXECUTE') END
  FROM (VALUES ('epis_registrar_entregas(uuid[],date,text,text,text,jsonb)'),
               ('epis_proximo_numero_termo(integer)'),
               ('epis_tem_modulo()'),
               ('epis_termo_aberto(text)')) f(fn)

UNION ALL
SELECT 6, 'bucket', 'termos-epi', 'existe, privado',
       coalesce((SELECT 'existe, ' || CASE WHEN public THEN 'PÚBLICO' ELSE 'privado' END
                   FROM storage.buckets WHERE id = 'termos-epi'), 'NÃO EXISTE')

UNION ALL
SELECT 7, 'policy storage', policyname, '', cmd || ' ' || array_to_string(roles, ',')
  FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'termos-epi%'

UNION ALL
SELECT 8, 'dados', 'numero_termo repetido', '0',
       (SELECT count(*)::text FROM (SELECT numero_termo FROM public.entregas_epi
          WHERE numero_termo <> '' GROUP BY 1 HAVING count(*) > 1) d)

UNION ALL
SELECT 9, 'dados', 'EPIs ativos com validade de uso = 0 (termo sai "sem validade")', 'só os que não vencem',
       (SELECT count(*) || ' de ' || (SELECT count(*) FROM public.epis WHERE ativo) || ': ' ||
               coalesce(string_agg(nome, '; ' ORDER BY nome), '')
          FROM public.epis WHERE ativo AND coalesce(validade_dias, 0) <= 0)

UNION ALL
SELECT 10, 'dados', 'funcionários com CPF / cargo / setor vazios', 'informativo — o termo sai com "—"',
       (SELECT 'total=' || count(*) ||
               ' sem CPF=' || count(*) FILTER (WHERE coalesce(btrim(cpf), '') = '') ||
               ' sem cargo=' || count(*) FILTER (WHERE coalesce(btrim(cargo), '') = '') ||
               ' sem setor=' || count(*) FILTER (WHERE coalesce(btrim(setor), '') = '') ||
               ' CPF inválido=' || count(*) FILTER (WHERE NOT public.rh_cpf_valido(cpf))
          FROM public.funcionarios)

ORDER BY 1, 3;
