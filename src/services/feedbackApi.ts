import { supabase } from '../lib/supabase';

export const FEEDBACK_MAX_LENGTH = 3000;

/** Envoie une idée d'amélioration à l'équipe. Lève une erreur au message lisible si l'envoi échoue. */
export async function sendFeedback(message: string, context: { board?: string }) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Connectez-vous pour envoyer un message.');

  const response = await fetch('/.netlify/functions/feedback', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message, page: window.location.href, board: context.board ?? '' }),
  }).catch(() => null);
  if (!response?.ok) {
    throw new Error("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
  }
}
