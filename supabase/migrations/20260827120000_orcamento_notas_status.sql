-- ============================================================
-- Requisito 1 e 2 — nota obrigatória na mudança de status
--                   e contador de dias sem nota
-- ------------------------------------------------------------
-- ATENÇÃO: `orcamento_notas` JÁ EXISTE e já está em uso pelo
-- drawer de detalhes do Comercial. Esta migration ALTERA a
-- tabela existente — não cria do zero.
--
-- Também substitui o trigger `trg_orcamentos_status_nota`, que
-- hoje grava sozinho uma nota automática "DE → PARA" a cada
-- mudança de status. Com a nota passando a ser obrigatória e
-- escrita pela pessoa, o trigger geraria uma segunda nota
-- duplicada em todo salvamento.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================


-- ------------------------------------------------------------
-- 0. Função de updated_at
-- ------------------------------------------------------------
-- A migration 20260804222650 já referencia public.tg_set_updated_at(),
-- mas a coluna updated_at que ela declara NÃO existe no banco real —
-- sinal de que aquela migration não rodou inteira. Criada aqui de
-- forma defensiva para não depender disso.
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


-- ------------------------------------------------------------
-- 1. Colunas novas em orcamento_notas
-- ------------------------------------------------------------
-- autor_id fica SEM foreign key de propósito: uma FK para profiles
-- faria a gravação da nota falhar para qualquer usuário autenticado
-- que ainda não tenha linha em profiles — e, como a nota e o status
-- gravam na mesma transação, isso derrubaria a mudança de status
-- junto. autor_nome é a cópia que sustenta o histórico.
ALTER TABLE public.orcamento_notas
  ADD COLUMN IF NOT EXISTS status_anterior text,
  ADD COLUMN IF NOT EXISTS status_novo     text,
  ADD COLUMN IF NOT EXISTS autor_id        uuid,
  ADD COLUMN IF NOT EXISTS autor_nome      text,
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.orcamento_notas.status_anterior IS
  'Status antes da mudança. NULL quando é nota avulsa (tipo = NOTA).';
COMMENT ON COLUMN public.orcamento_notas.status_novo IS
  'Status depois da mudança. NULL quando é nota avulsa (tipo = NOTA).';
COMMENT ON COLUMN public.orcamento_notas.autor_nome IS
  'Nome desnormalizado: o histórico continua legível se o usuário for removido.';

-- Preenche autor_nome nas notas antigas, que só têm o texto `autor`.
UPDATE public.orcamento_notas
   SET autor_nome = autor
 WHERE autor_nome IS NULL
   AND coalesce(autor, '') <> '';

DROP TRIGGER IF EXISTS trg_orcamento_notas_updated ON public.orcamento_notas;
CREATE TRIGGER trg_orcamento_notas_updated
  BEFORE UPDATE ON public.orcamento_notas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Índice que o Requisito 1 pede já existe como idx_orcamento_notas_orcamento
-- (orcamento_id, created_at DESC), criado em 20260804222650.
CREATE INDEX IF NOT EXISTS idx_orcamento_notas_orcamento
  ON public.orcamento_notas (orcamento_id, created_at DESC);


-- ------------------------------------------------------------
-- 2. Contador de dias — coluna denormalizada
-- ------------------------------------------------------------
-- A data da última nota precisa estar disponível para TODOS os
-- orçamentos de uma vez (badge em cada linha da tabela + filtro por
-- dias parados). Uma coluna mantida por trigger evita N consultas e
-- mantém o `update ... returning *` do store funcionando como hoje.
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS ultima_nota_em timestamptz;

COMMENT ON COLUMN public.orcamentos.ultima_nota_em IS
  'max(orcamento_notas.created_at) do orçamento, mantido por trigger. NULL = nunca teve nota; o contador então parte de created_at.';

CREATE OR REPLACE FUNCTION public.tg_orcamento_ultima_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orcamento uuid := coalesce(NEW.orcamento_id, OLD.orcamento_id);
BEGIN
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

DROP TRIGGER IF EXISTS trg_orcamento_notas_ultima ON public.orcamento_notas;
CREATE TRIGGER trg_orcamento_notas_ultima
  AFTER INSERT OR UPDATE OF created_at OR DELETE ON public.orcamento_notas
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_ultima_nota();

-- Backfill dos orçamentos que já têm notas.
UPDATE public.orcamentos o
   SET ultima_nota_em = n.ultima
  FROM (
    SELECT orcamento_id, max(created_at) AS ultima
      FROM public.orcamento_notas
     GROUP BY orcamento_id
  ) n
 WHERE n.orcamento_id = o.id
   AND o.ultima_nota_em IS DISTINCT FROM n.ultima;


-- ------------------------------------------------------------
-- 3. Mudança de status + nota, na mesma transação
-- ------------------------------------------------------------
-- Remove o trigger que gerava a nota automática. A partir daqui a
-- nota é sempre a que a pessoa escreveu, e a função abaixo é o
-- ÚNICO caminho para mudar status.
DROP TRIGGER IF EXISTS trg_orcamentos_status_nota ON public.orcamentos;
DROP FUNCTION IF EXISTS public.tg_orcamento_status_nota();

-- SECURITY INVOKER: a função roda com as permissões de quem chamou,
-- então a RLS de orcamentos e orcamento_notas continua valendo.
CREATE OR REPLACE FUNCTION public.orcamento_mudar_status(
  p_orcamento_id uuid,
  p_status_novo  text,
  p_texto        text,
  p_autor_id     uuid DEFAULT NULL,
  p_autor_nome   text DEFAULT NULL
)
RETURNS public.orcamentos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_anterior text;
  v_row      public.orcamentos;
BEGIN
  -- Mesma regra do botão desabilitado no front, repetida aqui porque
  -- o front não é fronteira de confiança: 5 caracteres sem contar
  -- espaços.
  IF length(regexp_replace(coalesce(p_texto, ''), '\s', '', 'g')) < 5 THEN
    RAISE EXCEPTION 'A nota precisa de pelo menos 5 caracteres.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT status INTO v_anterior
    FROM public.orcamentos
   WHERE id = p_orcamento_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado.'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- A nota entra primeiro: se esta linha falhar (RLS, constraint),
  -- a transação inteira aborta e o status não muda.
  INSERT INTO public.orcamento_notas
    (orcamento_id, texto, tipo, status_anterior, status_novo, autor_id, autor_nome, autor)
  VALUES
    (p_orcamento_id, p_texto, 'STATUS', v_anterior, p_status_novo,
     p_autor_id, p_autor_nome, coalesce(p_autor_nome, ''));

  UPDATE public.orcamentos
     SET status             = p_status_novo,
         ultima_atualizacao = now()
   WHERE id = p_orcamento_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_mudar_status(uuid, text, text, uuid, text)
  TO authenticated;


-- ------------------------------------------------------------
-- 4. RLS — autor edita a própria nota
-- ------------------------------------------------------------
-- MUDANÇA DE PERMISSÃO em tabela existente. A política atual
-- ("authenticated write orcamento_notas", FOR ALL) deixa QUALQUER
-- usuário autenticado editar e apagar QUALQUER nota, inclusive as
-- dos outros. Ela é substituída por políticas separadas:
--   SELECT  — qualquer autenticado (igual a hoje)
--   INSERT  — qualquer autenticado (igual a hoje)
--   UPDATE  — só o autor, e só na primeira hora
--   DELETE  — ninguém (histórico não se apaga)
-- Notas antigas têm autor_id NULL e, por isso, não são editáveis.
DROP POLICY IF EXISTS "authenticated write orcamento_notas" ON public.orcamento_notas;
DROP POLICY IF EXISTS "authenticated read orcamento_notas"  ON public.orcamento_notas;

CREATE POLICY "orcamento_notas select" ON public.orcamento_notas
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "orcamento_notas insert" ON public.orcamento_notas
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "orcamento_notas update autor" ON public.orcamento_notas
  FOR UPDATE TO authenticated
  USING (autor_id = auth.uid() AND created_at > now() - interval '1 hour')
  WITH CHECK (autor_id = auth.uid());
