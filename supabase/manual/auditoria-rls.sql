-- ============================================================
-- Auditoria de RLS e permissões — SÓ LEITURA, não corrige nada
-- ------------------------------------------------------------
-- Cole no SQL Editor do Supabase. Devolve quatro listas:
--
--   1. Tabelas: RLS ligada? anon lê/escreve? authenticated lê/escreve?
--      quantas policies? alguma aberta (USING true)?
--   2. As policies abertas, uma a uma, com a expressão.
--   3. Views: quais rodam com privilégio do dono (ignoram RLS) e
--      estão liberadas para anon.
--   4. Funções SECURITY DEFINER executáveis por anon.
--
-- Por que isto não pode ser feito de fora: com a chave anônima só dá
-- para ver o que vaza HOJE. Tabela vazia com GRANT e sem RLS responde
-- exatamente como tabela protegida — as duas devolvem lista vazia. A
-- diferença aparece no dia em que a tabela recebe a primeira linha, e
-- aí já é tarde. Só o catálogo do Postgres separa as duas.
-- ============================================================

-- ------------------------------------------------------------
-- 1) O quadro geral, ordenado por risco
-- ------------------------------------------------------------
SELECT
  CASE
    WHEN NOT c.relrowsecurity AND has_table_privilege('anon', c.oid, 'SELECT')
      THEN '1 CRITICO'
    WHEN EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname
         AND p.cmd = 'SELECT' AND coalesce(p.qual, 'true') = 'true'
         AND ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))
    ) THEN '1 CRITICO'
    WHEN has_table_privilege('anon', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'UPDATE')
      OR has_table_privilege('anon', c.oid, 'DELETE')
      THEN '2 ESCRITA ANONIMA'
    WHEN NOT c.relrowsecurity THEN '3 SEM RLS'
    WHEN has_table_privilege('anon', c.oid, 'SELECT') THEN '4 GRANT ANON SOBRANDO'
    WHEN EXISTS (
      SELECT 1 FROM pg_policies p
       WHERE p.schemaname = 'public' AND p.tablename = c.relname
         AND coalesce(p.qual, 'true') = 'true'
    ) THEN '5 POLICY ABERTA P/ LOGADO'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname
    ) THEN '6 RLS SEM POLICY (nega tudo)'
    ELSE '7 ok'
  END                                                        AS risco,
  c.relname                                                  AS tabela,
  c.relrowsecurity                                           AS rls_ligada,
  has_table_privilege('anon', c.oid, 'SELECT')               AS anon_le,
  (has_table_privilege('anon', c.oid, 'INSERT')
   OR has_table_privilege('anon', c.oid, 'UPDATE')
   OR has_table_privilege('anon', c.oid, 'DELETE'))          AS anon_escreve,
  has_table_privilege('authenticated', c.oid, 'SELECT')      AS logado_le,
  (has_table_privilege('authenticated', c.oid, 'INSERT')
   OR has_table_privilege('authenticated', c.oid, 'UPDATE')
   OR has_table_privilege('authenticated', c.oid, 'DELETE')) AS logado_escreve,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
      AND coalesce(p.qual, 'true') = 'true')                   AS policies_abertas,
  (SELECT reltuples::bigint FROM pg_class x WHERE x.oid = c.oid) AS linhas_aprox
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY risco, c.relname;


-- ------------------------------------------------------------
-- 2) As policies abertas, com a expressão inteira
-- ------------------------------------------------------------
-- `qual` é o USING; `with_check` é o WITH CHECK. Quando o USING é
-- literalmente `true`, a policy não filtra nada — o que ela faz é
-- liberar a tabela para todo mundo que o `roles` alcançar.
SELECT
  p.tablename                                AS tabela,
  p.policyname                               AS policy,
  p.cmd                                      AS comando,
  p.permissive                               AS permissiva,
  array_to_string(p.roles, ', ')             AS papeis,
  coalesce(p.qual, '(sem USING)')            AS using_expr,
  coalesce(p.with_check, '(sem WITH CHECK)') AS with_check_expr,
  CASE
    WHEN ('anon' = ANY (p.roles) OR 'public' = ANY (p.roles))
     AND coalesce(p.qual, 'true') = 'true' THEN 'ABERTA PARA ANONIMO'
    WHEN coalesce(p.qual, 'true') = 'true'  THEN 'aberta para qualquer logado'
    ELSE 'filtrada'
  END AS veredito
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (coalesce(p.qual, 'true') = 'true' OR 'anon' = ANY (p.roles) OR 'public' = ANY (p.roles))
ORDER BY veredito, p.tablename, p.policyname;


-- ------------------------------------------------------------
-- 3) Views — o ponto cego
-- ------------------------------------------------------------
-- View criada sem `security_invoker = true` roda com o privilégio do
-- DONO, e o dono ignora RLS. Uma view assim liberada para `anon`
-- entrega o conteúdo da tabela por baixo mesmo com a RLS impecável.
--
-- Uma é assim de propósito: vw_rh_vagas_publicas, que alimenta o site
-- e por isso filtra na própria consulta (só vaga publicada, e sem
-- faixa salarial quando confidencial). Qualquer OUTRA nesta lista com
-- anon_le = true precisa ser olhada.
SELECT
  c.relname AS view,
  CASE
    WHEN c.reloptions::text LIKE '%security_invoker=true%'
      OR c.reloptions::text LIKE '%security_invoker=on%'
    THEN 'invoker (respeita a RLS de quem consulta)'
    ELSE 'DEFINER (ignora RLS das tabelas de baixo)'
  END                                          AS modo,
  has_table_privilege('anon', c.oid, 'SELECT')          AS anon_le,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS logado_le
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY
  (has_table_privilege('anon', c.oid, 'SELECT')
   AND NOT (c.reloptions::text LIKE '%security_invoker=true%')) DESC,
  c.relname;


-- ------------------------------------------------------------
-- 4) Funções SECURITY DEFINER ao alcance do anônimo
-- ------------------------------------------------------------
-- Função DEFINER roda com o poder de quem a criou. Executável por
-- `anon`, ela é uma porta aberta na internet — e só deve estar aí se
-- alguém decidiu isso de propósito.
--
-- Uma é assim de propósito: rh_inscricao_publica, que é o formulário
-- de vagas do site. Qualquer outra precisa de justificativa.
SELECT
  p.proname                                              AS funcao,
  pg_get_function_identity_arguments(p.oid)              AS argumentos,
  p.prosecdef                                            AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE')       AS anon_executa,
  pg_get_userbyid(p.proowner)                            AS dono
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;
