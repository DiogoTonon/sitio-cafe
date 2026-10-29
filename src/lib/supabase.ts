import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !chave) {
  throw new Error('Faltam as configurações do Supabase no arquivo .env.local')
}

export const supabase = createClient(url, chave)