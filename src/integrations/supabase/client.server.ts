import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://fpuwyndpmcgwkuaqbcvm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdXd5bmRwbWNnd2t1YXFiY3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjI1NzEsImV4cCI6MjA5OTA5ODU3MX0.3WXC6A7Xq54tigOMg25gcjoJNj_uzbQFahraeCUPFJE';

export const supabaseServer = createClient(supabaseUrl, supabaseKey);
export const supabase = supabaseServer;
