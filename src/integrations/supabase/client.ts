import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fpuwyndpmcgwkuaqbcvm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * `createClient` lança "supabaseKey is required" quando a chave falta, e
 * esta chamada roda no import do módulo. Como este arquivo entra no chunk
 * do site público (PortfolioGallery importa daqui), a exceção derrubaria
 * o bundle inteiro antes de a página hidratar — site em branco, portal
 * morto, e nenhuma pista além de um erro no console.
 *
 * O build já falha quando a chave não existe (ver vite.config.ts). Esta
 * guarda é a segunda linha: sem chave o site continua de pé e só as
 * chamadas ao banco falham, com o motivo no console.
 */
if (!supabaseKey) {
  console.error(
    "[supabase] VITE_SUPABASE_ANON_KEY ausente no build. " +
    "Cadastre a variável no painel da hospedagem e refaça o deploy: " +
    "as telas que leem do banco não vão funcionar.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey ?? "chave-ausente");
