-- ============================================================
-- Carga inicial Secullum → Portal — Etapa 0
-- ------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
--
-- A conciliação de 27/08/2026 mostrou o desenho invertido do que o
-- plano supunha:
--
--     ativos na Secullum:  20        nos dois lados:   1
--     só na Secullum:      19        só no Portal:     0
--
-- Dezenove pessoas batem ponto todo dia e não existem no cadastro do
-- Portal. Antes de o Portal poder ser dono do cadastro e empurrar
-- admissões para a Secullum, é preciso uma carga UMA ÚNICA VEZ no
-- sentido contrário.
--
-- Duas coisas tornam essa carga segura, e as duas são fatos medidos,
-- não suposições: "só no Portal" é ZERO — então não há ninguém para
-- duplicar na volta; e importar para o Portal não cria cadastro na
-- Secullum — então não consome licença do plano (30 pessoas, 20 em
-- uso).
--
-- O QUE ELA ACRESCENTA
--   1. As duas colunas que faltam em `funcionarios` para guardar o
--      vínculo com a Secullum sem perder informação (`secullum_id`,
--      `horario_numero`).
--   2. A marca de origem em `projetos` e `rh_cargos`, para o RH saber
--      depois quais obras e cargos nasceram da carga e precisam de
--      revisão.
--   3. A permissão mínima para o RH registrar a carga em
--      `secullum_sync` — e SÓ a carga.
--
-- IDEMPOTENTE. Roda duas vezes sem efeito colateral.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) O vínculo com a Secullum em `funcionarios`
-- ------------------------------------------------------------
-- Ficam na própria tabela de colaboradores, e não numa tabela de
-- De/Para à parte, por um motivo prático: `secullum_funcionarios` é
-- espelho, reescrito pelo job a cada madrugada. Vínculo que o RH criou
-- na mão não pode morar em tabela que um job trunca.
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS secullum_id    integer,
  ADD COLUMN IF NOT EXISTS horario_numero integer;

COMMENT ON COLUMN public.funcionarios.secullum_id IS
  'Id do funcionário no Ponto Web. Preenchido pela carga inicial e pelo envio de admissão. NULL = colaborador que nunca existiu lá.';
COMMENT ON COLUMN public.funcionarios.horario_numero IS
  'Número do horário da Secullum (a escala). Na conta da GRD só 2 e 6 estão ativos — HE 60% e HE 70% no sábado.';

-- Um id da Secullum não pode apontar para dois colaboradores: seria a
-- mesma pessoa em duplicata, que é exatamente o que a carga existe
-- para evitar.
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_secullum_id
  ON public.funcionarios (secullum_id) WHERE secullum_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2) Marca de origem em obras e cargos
-- ------------------------------------------------------------
-- A carga cria a obra ou o cargo que não existir no Portal — senão 19
-- pessoas entrariam sem lotação nenhuma, e o dashboard da Etapa 2
-- nasceria cego. Mas obra criada por importação não é obra cadastrada
-- pela Engenharia: não tem cliente, contrato, prazo nem orçamento.
--
-- Esta coluna é o que separa as duas. É ela que permite ao RH filtrar
-- depois "o que a carga inventou" e completar o cadastro de verdade,
-- em vez de descobrir meses adiante uma obra fantasma no relatório.
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS origem_secullum boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.projetos.origem_secullum IS
  'true = obra criada pela carga inicial a partir do departamento da Secullum. Cadastro incompleto de propósito; precisa de revisão do RH e da Engenharia.';

ALTER TABLE public.rh_cargos
  ADD COLUMN IF NOT EXISTS origem_secullum boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.rh_cargos.origem_secullum IS
  'true = cargo criado pela carga inicial a partir da função da Secullum. Sem CBO, sem NR exigida, sem EPI padrão — a regra 8 (aptidão para alocação) não vale nada até o RH completar.';

CREATE INDEX IF NOT EXISTS idx_projetos_origem_secullum
  ON public.projetos (origem_secullum) WHERE origem_secullum;
CREATE INDEX IF NOT EXISTS idx_rh_cargos_origem_secullum
  ON public.rh_cargos (origem_secullum) WHERE origem_secullum;

-- ------------------------------------------------------------
-- 3) A carga no diário `secullum_sync`
-- ------------------------------------------------------------
-- Todo o resto que escreve em `secullum_sync` é job, entrando pela
-- chave de serviço. A carga inicial é a única exceção: quem dispara é
-- uma pessoa do RH, logada, clicando num botão. Ela precisa registrar
-- o que fez.
--
-- A permissão abaixo é a menor possível para isso:
--   - só INSERT, nunca UPDATE nem DELETE — diário não se reescreve;
--   - só `tipo = 'carga_inicial'` — um token de RH vazado continua sem
--     conseguir forjar um "sync de batidas concluído com sucesso", que
--     é o que esconderia ponto faltando;
--   - só quem `rh_pode_editar()` — Diretoria e RH/DP.
DO $blk$
BEGIN
  IF to_regclass('public.secullum_sync') IS NULL THEN
    RAISE NOTICE 'secullum_sync ainda não existe: rode 20260829100000_secullum_cache.sql antes. Nada a fazer aqui.';
    RETURN;
  END IF;

  -- O CHECK nasceu inline na criação da tabela, então o nome é o
  -- automático do Postgres.
  ALTER TABLE public.secullum_sync DROP CONSTRAINT IF EXISTS secullum_sync_tipo_check;
  ALTER TABLE public.secullum_sync
    ADD CONSTRAINT secullum_sync_tipo_check
    CHECK (tipo IN ('funcionarios', 'batidas', 'totais', 'catalogos', 'carga_inicial'));

  GRANT INSERT ON public.secullum_sync TO authenticated;

  DROP POLICY IF EXISTS "secullum_sync carga inicial" ON public.secullum_sync;
  CREATE POLICY "secullum_sync carga inicial" ON public.secullum_sync
    FOR INSERT TO authenticated
    WITH CHECK (public.rh_pode_editar() AND tipo = 'carga_inicial');
END;
$blk$;

COMMIT;
