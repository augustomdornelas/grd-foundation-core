-- ============================================================
-- Verificação do módulo de RH — só leitura, pode rodar quantas vezes
-- ------------------------------------------------------------
-- Cole no SQL Editor do Supabase DEPOIS de aplicar as migrations.
-- Cada linha do resultado é uma checagem: coluna `resultado` diz OK
-- ou FALHA, e `detalhe` diz o que está errado.
--
-- Por que isto existe: os critérios de aceite do módulo são coisas do
-- BANCO ("engenheiro não vê candidato de vaga que não é dele —
-- testado no banco, não só na tela"). Clicar em cada tela com cada
-- papel testa a tela; isto testa a regra.
--
-- O que ele NÃO substitui: entrar com cada perfil e usar o sistema.
-- Ele confirma que as travas existem, não que a experiência é boa.
-- ============================================================

WITH checagens AS (

  -- ---------- 1) As tabelas do módulo existem ----------
  SELECT
    '1. Tabelas do módulo criadas' AS checagem,
    CASE WHEN count(*) >= 20 THEN 'OK' ELSE 'FALHA' END AS resultado,
    count(*)::text || ' tabelas rh_* encontradas (esperado 20 ou mais)' AS detalhe
    FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'rh\_%'

  UNION ALL

  -- ---------- 2) RLS ligada em todas ----------
  SELECT
    '2. RLS ligada em todas as tabelas rh_*',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'nenhuma tabela sem RLS'
         ELSE 'sem RLS: ' || string_agg(c.relname, ', ') END
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname LIKE 'rh\_%' AND NOT c.relrowsecurity

  UNION ALL

  -- ---------- 3) Nada de RH aberto para `anon` ----------
  -- A única coisa que o site anônimo pode ler é vw_rh_vagas_publicas,
  -- que é view e não entra nesta conta.
  SELECT
    '3. Nenhuma tabela rh_* legível por anon',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'anon sem SELECT em tabela nenhuma do módulo'
         ELSE 'anon lê: ' || string_agg(c.relname, ', ') END
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname LIKE 'rh\_%'
     AND has_table_privilege('anon', c.oid, 'SELECT')

  UNION ALL

  -- ---------- 4) O vazamento antigo foi fechado ----------
  SELECT
    '4. funcionarios e epis fechados para anon',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'nome, CPF e RG não saem mais sem login'
         ELSE 'ainda aberto: ' || string_agg(c.relname, ', ') END
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('funcionarios', 'epis', 'entregas_epi', 'entrega_epi_itens')
     AND has_table_privilege('anon', c.oid, 'SELECT')

  UNION ALL

  -- ---------- 5) Dinheiro isolado ----------
  -- As quatro tabelas de valor têm de exigir Diretoria ou RH na
  -- leitura. A conferência é pela existência da policy que chama
  -- rh_ve_remuneracao().
  SELECT
    '5. Tabelas de dinheiro exigem rh_ve_remuneracao()',
    CASE WHEN count(*) = 4 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' de 4 com policy de leitura restrita '
      || '(rh_cargo_faixa, rh_vaga_faixa, rh_candidato_pretensao, rh_funcionario_remuneracao)'
    FROM pg_policies p
   WHERE p.schemaname = 'public'
     AND p.tablename IN ('rh_cargo_faixa', 'rh_vaga_faixa', 'rh_candidato_pretensao', 'rh_funcionario_remuneracao')
     AND p.cmd = 'SELECT'
     AND p.qual LIKE '%rh_ve_remuneracao%'

  UNION ALL

  -- ---------- 6) Histórico imutável ----------
  SELECT
    '6. Históricos sem UPDATE/DELETE para authenticated',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'os 4 históricos aceitam só SELECT e INSERT'
         ELSE 'permissão demais em: ' || string_agg(c.relname, ', ') END
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN ('rh_vaga_historico', 'rh_candidatura_historico',
                       'rh_admissao_historico', 'rh_funcionario_historico')
     AND (has_table_privilege('authenticated', c.oid, 'UPDATE')
       OR has_table_privilege('authenticated', c.oid, 'DELETE'))

  UNION ALL

  SELECT
    '7. Trigger de imutabilidade nos 4 históricos',
    CASE WHEN count(*) = 4 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' de 4 com a trigger que recusa UPDATE e DELETE'
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND t.tgname LIKE '%imutavel'
     AND c.relname IN ('rh_vaga_historico', 'rh_candidatura_historico',
                       'rh_admissao_historico', 'rh_funcionario_historico')

  UNION ALL

  -- ---------- 8) A nota obrigatória tem guarda ----------
  SELECT
    '8. Guardas de movimentação instaladas',
    CASE WHEN count(*) = 3 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' de 3 (vaga, candidatura, admissão) — sem elas, '
      || 'daria para mudar etapa por UPDATE direto, sem nota'
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE NOT t.tgisinternal
     AND c.relname IN ('rh_vagas', 'rh_candidaturas', 'rh_admissoes')
     AND t.tgname IN ('trg_rh_vagas_antes', 'trg_rh_candidaturas_guarda', 'trg_rh_admissoes_antes')

  UNION ALL

  SELECT
    '9. Nota com mínimo de 5 caracteres no banco',
    CASE WHEN count(*) = 4 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' de 4 históricos com CHECK na nota'
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
   WHERE con.contype = 'c'
     AND c.relname IN ('rh_vaga_historico', 'rh_candidatura_historico',
                       'rh_admissao_historico')
     AND pg_get_constraintdef(con.oid) LIKE '%char_length%nota%'

  UNION ALL

  -- ---------- 10) Funções de operação existem ----------
  SELECT
    '10. Funções de operação criadas',
    CASE WHEN count(*) >= 12 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' funções rh_* encontradas (esperado 12 ou mais)'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname LIKE 'rh\_%'

  UNION ALL

  -- ---------- 11) Buckets privados ----------
  SELECT
    '11. Buckets de RH são privados',
    CASE WHEN count(*) = 3 AND bool_and(NOT public) THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' de 3 buckets; públicos: '
      || coalesce(nullif(string_agg(id, ', ') FILTER (WHERE public), ''), 'nenhum')
    FROM storage.buckets
   WHERE id IN ('curriculos', 'documentos-rh', 'fotos-rh')

  UNION ALL

  -- ---------- 12) Catálogos semeados ----------
  SELECT
    '12. Etapas do funil semeadas',
    CASE WHEN count(*) >= 10 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' etapas (esperado 12)'
    FROM public.rh_funil_etapas

  UNION ALL

  SELECT
    '13. Tipos de documento semeados',
    CASE WHEN count(*) >= 20 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' tipos (esperado 25)'
    FROM public.rh_tipos_documento

  UNION ALL

  SELECT
    '14. NRs marcadas como bloqueio de alocação',
    CASE WHEN count(*) >= 5 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' documentos bloqueiam alocação: '
      || coalesce(string_agg(nome, ', ' ORDER BY ordem), 'nenhum')
    FROM public.rh_tipos_documento WHERE bloqueia_alocacao AND ativo

  UNION ALL

  SELECT
    '15. Cargos semeados com NR exigida',
    CASE WHEN count(*) >= 10 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' cargos com ao menos uma NR exigida'
    FROM public.rh_cargos WHERE array_length(nrs_exigidas, 1) > 0

  UNION ALL

  -- ---------- 16) Views de apoio ----------
  SELECT
    '16. Views de apoio criadas',
    CASE WHEN count(*) >= 5 THEN 'OK' ELSE 'FALHA' END,
    count(*)::text || ' views vw_rh_* (esperado 6 depois da Etapa 4)'
    FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'vw\_rh\_%'

  UNION ALL

  -- ---------- 17) A view do candidato não vaza nada ----------
  SELECT
    '17. View do candidato sem score/parecer/motivo',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'nenhuma coluna interna exposta ao candidato'
         ELSE 'EXPÕE: ' || string_agg(column_name, ', ') END
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'vw_rh_minhas_candidaturas'
     AND (column_name LIKE '%score%' OR column_name LIKE '%parecer%'
       OR column_name LIKE '%motivo%' OR column_name LIKE '%salari%')

  UNION ALL

  -- ---------- 18) Vaga publicada saiu da aprovação ----------
  SELECT
    '18. Nenhuma vaga no site sem ter sido aprovada',
    CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHA' END,
    CASE WHEN count(*) = 0 THEN 'todas as publicadas passaram por aprovação'
         ELSE count(*)::text || ' vaga(s) publicada(s) sem aprovador registrado' END
    FROM public.rh_vagas
   WHERE publicada_site AND aprovador_id IS NULL

  UNION ALL

  -- ---------- 19) Vínculo usuário-obra ----------
  -- Não é erro estar vazio no primeiro dia, mas enquanto estiver,
  -- nenhum engenheiro vê nada de RH — e é melhor saber disso agora
  -- que descobrir pelo chamado dele.
  SELECT
    '19. Engenheiros vinculados a obras',
    CASE WHEN count(*) > 0 THEN 'OK' ELSE 'ATENÇÃO' END,
    CASE WHEN count(*) > 0
         THEN count(*)::text || ' vínculo(s) usuário-obra cadastrado(s)'
         ELSE 'nenhum vínculo em rh_usuario_projetos: nenhum engenheiro enxerga vaga nem equipe' END
    FROM public.rh_usuario_projetos WHERE ativo

  UNION ALL

  -- ---------- 20) Perfis reclassificados ----------
  SELECT
    '20. Contas com perfil de RH ou Diretoria',
    CASE WHEN count(*) > 0 THEN 'OK' ELSE 'ATENÇÃO' END,
    CASE WHEN count(*) > 0
         THEN count(*)::text || ' conta(s) com perfil Diretoria ou RH'
         ELSE 'ninguém com perfil Diretoria ou RH: só o Administrador abre o módulo' END
    FROM public.profiles
   WHERE lower(btrim(perfil)) IN ('diretoria', 'rh')
)
SELECT
  checagem,
  resultado,
  detalhe
  FROM checagens
 ORDER BY
   CASE resultado WHEN 'FALHA' THEN 1 WHEN 'ATENÇÃO' THEN 2 ELSE 3 END,
   checagem;
