
ALTER VIEW public.vw_equipamentos_base    SET (security_invoker = true);
ALTER VIEW public.vw_equipamento_payback  SET (security_invoker = true);
ALTER VIEW public.vw_locacoes_detalhe     SET (security_invoker = true);
ALTER VIEW public.vw_destino_locacoes     SET (security_invoker = true);
ALTER VIEW public.vw_equipamentos_ociosos SET (security_invoker = true);

ALTER FUNCTION public.fn_fator_mensal(text) SET search_path = public;
ALTER FUNCTION public.fn_diaria_eq(numeric, text) SET search_path = public;
