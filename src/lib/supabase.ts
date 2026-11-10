import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

/** Erreur renvoyée dans l'adresse par un ancien lien de connexion (expiré ou déjà utilisé). */
function takeAuthError(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  const code = hash.get('error_code') ?? search.get('error_code');
  if (code) window.history.replaceState(null, '', window.location.pathname);
  return code;
}

export const initialAuthError = takeAuthError();

/** Clé publique uniquement : la protection des données repose sur la RLS. */
export const supabase = createClient(url ?? 'http://invalid.localhost', key ?? 'absente', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
