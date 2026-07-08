import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://fpuwyndpmcgwkuaqbcvm.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdXd5bmRwbWNnd2t1YXFiY3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjI1NzEsImV4cCI6MjA5OTA5ODU3MX0.3WXC6A7Xq54tigOMg25gcjoJNj_uzbQFahraeCUPFJE';

export const supabase = createClient(supabaseUrl, supabaseKey);
