import { createClient } from '@supabase/supabase-js';

// Mesmo projeto do client.ts — a URL fica hardcoded para o servidor nunca
// cair em outro banco caso a env não esteja carregada no build/runtime.
const supabaseUrl = 'https://fpuwyndpmcgwkuaqbcvm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseServer = createClient(supabaseUrl, supabaseKey);
export const supabase = supabaseServer;
