CREATE TABLE public.orcamento_notas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  texto text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'NOTA',
  autor text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamento_notas TO authenticated;
GRANT ALL ON public.orcamento_notas TO service_role;

ALTER TABLE public.orcamento_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read orcamento_notas" ON public.orcamento_notas
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated write orcamento_notas" ON public.orcamento_notas
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_orcamento_notas_updated
  BEFORE UPDATE ON public.orcamento_notas
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_orcamento_notas_orcamento ON public.orcamento_notas(orcamento_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tg_orcamento_status_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.orcamento_notas (orcamento_id, texto, tipo, autor)
    VALUES (NEW.id, 'ORÇAMENTO CRIADO COM STATUS ' || coalesce(NEW.status, ''), 'STATUS', coalesce(NEW.responsavel, ''));
  ELSIF coalesce(NEW.status,'') <> coalesce(OLD.status,'') THEN
    INSERT INTO public.orcamento_notas (orcamento_id, texto, tipo, autor)
    VALUES (NEW.id, coalesce(OLD.status,'—') || ' → ' || coalesce(NEW.status,''), 'STATUS', coalesce(NEW.responsavel, ''));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orcamentos_status_nota
  AFTER INSERT OR UPDATE OF status ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_status_nota();
