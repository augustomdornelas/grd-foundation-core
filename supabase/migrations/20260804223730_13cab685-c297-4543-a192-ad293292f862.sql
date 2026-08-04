DROP TRIGGER IF EXISTS trg_orcamentos_ultima_atualizacao ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_ultima_atualizacao
BEFORE INSERT OR UPDATE ON public.orcamentos
FOR EACH ROW
EXECUTE FUNCTION public.tg_atualiza_ultima_atualizacao();