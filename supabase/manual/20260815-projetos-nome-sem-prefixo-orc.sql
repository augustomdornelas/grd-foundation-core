-- ============================================================
-- Limpeza do prefixo "ORC ... - " no nome dos projetos
-- Rodar no SQL Editor do Supabase (projeto grupo-grd)
-- ============================================================
--
-- POR QUE
--
-- O card e o cabeçalho do projeto passaram a mostrar o número do
-- orçamento vindo da relação `projetos.orcamento_id -> orcamentos.numero`
-- (antes mostravam o UUID do projeto). Com o número em linha própria, o
-- prefixo dentro de `projetos.nome` só repete a informação e corta o
-- nome real na exibição:
--
--   "ORC 084_2026 - SERVIÇOS DE APOIO..."  ->  "SERVIÇOS DE APOIO..."
--
-- O prefixo NÃO era montado pelo código: `garantirProjetoDeOrcamento`
-- copia `orcamentos.obra` para `projetos.nome`, e a obra já chega com
-- ele. A criação agora tira o prefixo (ver `nomeDaObra` em
-- src/lib/projeto-auto.ts); este arquivo cuida do que já foi gravado.
--
-- Pode rodar mais de uma vez: só altera linhas que ainda têm o prefixo.
-- ============================================================

-- 1. PRÉVIA — confira o resultado antes de gravar.
select
  p.id,
  o.numero as numero_orcamento,
  p.nome   as nome_atual,
  btrim(regexp_replace(p.nome, '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]\s*', '', 'i')) as nome_novo
from projetos p
join orcamentos o on o.id = p.orcamento_id
where p.nome ~* '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]'
order by o.numero;

-- 2. UPDATE — só em projetos com orçamento vinculado, porque é neles
--    que a tela mostra o número em linha própria. Projeto sem
--    `orcamento_id` fica como está: apagar o prefixo ali perderia o
--    único lugar onde o número aparece.
update projetos p
set nome = btrim(regexp_replace(p.nome, '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]\s*', '', 'i'))
from orcamentos o
where o.id = p.orcamento_id
  and p.nome ~* '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]'
  -- guarda contra nome que é só o número ("ORC 084_2026"): sem isso o
  -- projeto ficaria sem nome nenhum.
  and btrim(regexp_replace(p.nome, '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]\s*', '', 'i')) <> '';

-- 3. OPCIONAL — a mesma limpeza em `orcamentos.obra`, se quiser o texto
--    da obra limpo também na tela do Comercial (onde o número já aparece
--    em coluna própria). Não é necessário para os projetos.
--
-- update orcamentos
-- set obra = btrim(regexp_replace(obra, '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]\s*', '', 'i'))
-- where obra ~* '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]'
--   and btrim(regexp_replace(obra, '^\s*ORC[\s._/-]*[\w._/-]*\s*[-–—:]\s*', '', 'i')) <> '';
