
-- Equipamentos
CREATE TABLE IF NOT EXISTS public.equipamentos (
  id text PRIMARY KEY,
  nome text NOT NULL,
  codigo text NOT NULL,
  categoria text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  custo_periodo numeric NOT NULL DEFAULT 0,
  unidade_periodo text NOT NULL DEFAULT 'dia',
  status text NOT NULL DEFAULT 'Disponível',
  local_base text NOT NULL DEFAULT '',
  local_atual text NOT NULL DEFAULT '',
  responsavel_atual text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos TO authenticated;
GRANT SELECT ON public.equipamentos TO anon;
GRANT ALL ON public.equipamentos TO service_role;
ALTER TABLE public.equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read equipamentos" ON public.equipamentos FOR SELECT USING (true);
CREATE POLICY "public write equipamentos" ON public.equipamentos FOR ALL USING (true) WITH CHECK (true);

-- Empréstimos
CREATE TABLE IF NOT EXISTS public.emprestimos (
  id text PRIMARY KEY,
  equipamento_id text NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  destino text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  data_inicio date NOT NULL,
  data_devolucao_prevista date NOT NULL,
  data_devolucao_real date,
  custo_periodo numeric NOT NULL DEFAULT 0,
  unidade text NOT NULL DEFAULT 'dia',
  observacoes text,
  custo_total numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimos TO authenticated;
GRANT SELECT ON public.emprestimos TO anon;
GRANT ALL ON public.emprestimos TO service_role;
ALTER TABLE public.emprestimos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read emprestimos" ON public.emprestimos FOR SELECT USING (true);
CREATE POLICY "public write emprestimos" ON public.emprestimos FOR ALL USING (true) WITH CHECK (true);

-- Manutenções (novo modelo completo)
CREATE TABLE IF NOT EXISTS public.manutencoes (
  id text PRIMARY KEY,
  equipamento_id text NOT NULL REFERENCES public.equipamentos(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'Preventiva',
  data date NOT NULL,
  data_fim_prevista date,
  data_fim date,
  descricao text NOT NULL DEFAULT '',
  oficina text NOT NULL DEFAULT '',
  custo_pecas numeric NOT NULL DEFAULT 0,
  custo_mao_obra numeric NOT NULL DEFAULT 0,
  custo numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Aberta',
  observacoes text,
  aberta boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencoes TO authenticated;
GRANT SELECT ON public.manutencoes TO anon;
GRANT ALL ON public.manutencoes TO service_role;
ALTER TABLE public.manutencoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read manutencoes" ON public.manutencoes FOR SELECT USING (true);
CREATE POLICY "public write manutencoes" ON public.manutencoes FOR ALL USING (true) WITH CHECK (true);
