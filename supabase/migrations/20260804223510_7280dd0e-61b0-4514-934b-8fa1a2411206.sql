ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS ultima_atualizacao date;

UPDATE public.orcamentos
SET ultima_atualizacao = COALESCE(data_emissao, created_at::date)
WHERE ultima_atualizacao IS NULL;

CREATE OR REPLACE FUNCTION public.tg_atualiza_ultima_atualizacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.ultima_atualizacao := CURRENT_DATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamentos_ultima_atualizacao ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_ultima_atualizacao
BEFORE UPDATE ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.tg_atualiza_ultima_atualizacao();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos TO authenticated;
GRANT ALL ON public.orcamentos TO service_role;
GRANT SELECT ON public.orcamentos TO anon;