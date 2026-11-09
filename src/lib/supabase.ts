import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

/** Clé publique uniquement : la protection des données repose sur la RLS. */
export const supabase = createClient(url ?? 'http://invalid.localhost', key ?? 'absente', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
