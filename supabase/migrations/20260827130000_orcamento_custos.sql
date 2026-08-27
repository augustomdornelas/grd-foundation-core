-- ============================================================
-- Lançamento de custos do orçamento, com diárias
-- ------------------------------------------------------------
-- Verificação pedida antes de criar: NÃO existe tabela de custos
-- ligada a `orcamentos`. A tabela `custos` que existe hoje é do
-- PROJETO (custos.projeto_id) — objeto diferente, momento diferente
-- do fluxo. Por isso esta é uma tabela nova, e não uma adaptação.
--
-- Ver o comentário no fim do arquivo sobre a migration
-- 20260819140000_custos_mao_de_obra.sql, que modela mão de obra em
-- `custos` com OUTRO vocabulário e nunca foi aplicada no banco.
--
-- subtotal e orcamentos.custo_total nunca são escritos pelo front:
-- o primeiro é coluna GERADA, o segundo é mantido por trigger, no
-- mesmo formato de tg_orcamento_ultima_nota().
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Tabela de lançamentos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orcamento_custos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id   uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  categoria      text NOT NULL DEFAULT 'MAO_DE_OBRA'
                 CHECK (categoria IN ('MAO_DE_OBRA', 'MATERIAL', 'EQUIPAMENTO', 'SERVICO', 'OUTRO')),
  descricao      text NOT NULL,
  unidade        text NOT NULL DEFAULT 'diária',
  quantidade     numeric(12,3) NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  valor_unitario numeric(14,2) NOT NULL DEFAULT 0 CHECK (valor_unitario >= 0),
  subtotal       numeric(14,2) GENERATED ALWAYS AS (round(quantidade * valor_unitario, 2)) STORED,
  observacao     text,
  ordem          int NOT NULL DEFAULT 0,
  -- Sem FK, mesma razão de orcamento_notas.autor_id: uma FK para
  -- profiles derrubaria o lançamento de quem ainda não tem perfil.
  autor_id       uuid,
  autor_nome     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.orcamento_custos IS
  'Custos lançados no orçamento. Não confundir com public.custos, que é do projeto.';
COMMENT ON COLUMN public.orcamento_custos.quantidade IS
  'Em MAO_DE_OBRA é o número de diárias (pessoa-dia). numeric(12,3) aceita fração: 2.5 = duas diárias e meia.';
COMMENT ON COLUMN public.orcamento_custos.valor_unitario IS
  'Em MAO_DE_OBRA é o valor de UMA diária.';
COMMENT ON COLUMN public.orcamento_custos.subtotal IS
  'Coluna GERADA (quantidade × valor_unitario). O front nunca escreve aqui — é o que garante que a conta não depende do JavaScript.';

CREATE INDEX IF NOT EXISTS idx_orcamento_custos_ordem
  ON public.orcamento_custos (orcamento_id, ordem);

DROP TRIGGER IF EXISTS trg_orcamento_custos_updated ON public.orcamento_custos;
CREATE TRIGGER trg_orcamento_custos_updated
  BEFORE UPDATE ON public.orcamento_custos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- ------------------------------------------------------------
-- 2) Permissões
-- ------------------------------------------------------------
-- DELETE liberado, ao contrário de orcamento_notas: custo é lançamento
-- operacional e linha errada precisa poder sair. Nota é histórico.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamento_custos TO authenticated;
GRANT ALL ON public.orcamento_custos TO service_role;

ALTER TABLE public.orcamento_custos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orcamento_custos select" ON public.orcamento_custos;
DROP POLICY IF EXISTS "orcamento_custos write"  ON public.orcamento_custos;

CREATE POLICY "orcamento_custos select" ON public.orcamento_custos
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "orcamento_custos write" ON public.orcamento_custos
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ------------------------------------------------------------
-- 3) Total denormalizado no orçamento
-- ------------------------------------------------------------
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS custo_total numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orcamentos.custo_total IS
  'sum(orcamento_custos.subtotal) do orçamento, mantido por trigger. Nunca escrito pelo front.';

CREATE OR REPLACE FUNCTION public.tg_orcamento_custo_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo  uuid;
  v_velho uuid;
BEGIN
  -- TG_OP explícito em vez de coalesce(NEW.x, OLD.x): em trigger de
  -- DELETE não existe NEW, e em INSERT não existe OLD. Ler o lado que
  -- não existe é justamente o caminho que o DELETE percorre aqui — e
  -- excluir lançamento é operação de todo dia nesta tela.
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_novo  := NEW.orcamento_id; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_velho := OLD.orcamento_id; END IF;

  -- Os dois lados são recalculados porque um UPDATE pode mover o
  -- lançamento de um orçamento para outro; sem isso o de origem
  -- ficaria com o total antigo.
  IF v_novo IS NOT NULL THEN
    UPDATE public.orcamentos o
       SET custo_total = coalesce(
             (SELECT sum(c.subtotal) FROM public.orcamento_custos c WHERE c.orcamento_id = v_novo), 0)
     WHERE o.id = v_novo;
  END IF;

  IF v_velho IS NOT NULL AND v_velho IS DISTINCT FROM v_novo THEN
    UPDATE public.orcamentos o
       SET custo_total = coalesce(
             (SELECT sum(c.subtotal) FROM public.orcamento_custos c WHERE c.orcamento_id = v_velho), 0)
     WHERE o.id = v_velho;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_custos_total ON public.orcamento_custos;
CREATE TRIGGER trg_orcamento_custos_total
  AFTER INSERT OR UPDATE OR DELETE ON public.orcamento_custos
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_custo_total();


-- ------------------------------------------------------------
-- 4) Backfill
-- ------------------------------------------------------------
-- IS DISTINCT FROM evita reescrever linha que já está certa quando a
-- migration roda de novo.
UPDATE public.orcamentos o
   SET custo_total = coalesce(t.soma, 0)
  FROM (
    SELECT orcamento_id, sum(subtotal) AS soma
      FROM public.orcamento_custos
     GROUP BY orcamento_id
  ) t
 WHERE t.orcamento_id = o.id
   AND o.custo_total IS DISTINCT FROM coalesce(t.soma, 0);

-- ------------------------------------------------------------
-- 5) Correção na trigger de ultima_nota_em
-- ------------------------------------------------------------
-- Escrita na migration 20260827120000 e já aplicada, ela usa
-- coalesce(NEW.orcamento_id, OLD.orcamento_id) — o mesmo padrão que o
-- item 3 acima abandonou. Em trigger de DELETE não existe NEW, e o
-- DELETE dela É percorrido: apagar um orçamento cascateia para
-- orcamento_notas e dispara esta função uma vez por nota.
--
-- Substituída pela versão com TG_OP, que é correta nos dois
-- comportamentos possíveis do PL/pgSQL. Só troca o corpo da função; a
-- trigger que a chama continua a mesma.
CREATE OR REPLACE FUNCTION public.tg_orcamento_ultima_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_orcamento := OLD.orcamento_id;
  ELSE
    v_orcamento := NEW.orcamento_id;
  END IF;

  UPDATE public.orcamentos o
     SET ultima_nota_em = (
           SELECT max(n.created_at)
             FROM public.orcamento_notas n
            WHERE n.orcamento_id = v_orcamento
         )
   WHERE o.id = v_orcamento;
  RETURN NULL;
END;
$$;

COMMIT;


-- ============================================================
-- NOTA PARA QUEM FOR MEXER AQUI DEPOIS
-- ------------------------------------------------------------
-- A migration 20260819140000_custos_mao_de_obra.sql está commitada no
-- repositório mas NÃO foi aplicada neste banco (conferido: a tabela
-- `funcoes` não existe e `custos` não tem funcao/valor_diaria/
-- quantidade_diarias). Ela modela mão de obra no CUSTO DO PROJETO com
-- outro vocabulário — funcao / valor_diaria / quantidade_diarias, mais
-- um cadastro de funções.
--
-- Aqui a mesma ideia aparece como descricao / valor_unitario /
-- quantidade, porque este arquivo segue a especificação recebida e
-- porque a tabela é genérica (serve material e equipamento também).
--
-- Se um dia aquela migration for aplicada, o app passa a ter dois
-- vocabulários para "diária". Vale decidir antes qual dos dois vence.
-- ============================================================
