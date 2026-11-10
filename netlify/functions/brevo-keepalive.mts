/**
 * Une fois par mois, garde actives les deux clés Brevo, qui expirent après 90 jours sans usage :
 * - la clé SMTP (utilisée par Supabase) : demande un lien de connexion pour TRAME_KEEPALIVE_EMAIL ;
 * - la clé API (widget « Une idée ? ») : lit les statistiques d'envoi, sans envoyer d'e-mail.
 * Un échec apparaît dans les journaux des fonctions Netlify.
 */

async function keepSmtpKeyAlive(): Promise<string | null> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.TRAME_KEEPALIVE_EMAIL;
  if (!url || !key || !email) return 'variable manquante (Supabase ou TRAME_KEEPALIVE_EMAIL)';

  const response = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    // Le compte doit déjà exister : cet appel n'en crée jamais.
    body: JSON.stringify({ email, create_user: false }),
  });
  return response.ok ? null : `lien refusé (${response.status}) ${await response.text()}`;
}

async function keepApiKeyAlive(): Promise<string | null> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return 'variable manquante (BREVO_API_KEY)';
  const response = await fetch('https://api.brevo.com/v3/smtp/statistics/aggregatedReport?days=30', {
    headers: { 'api-key': apiKey, accept: 'application/json' },
  });
  return response.ok ? null : `clé API refusée (${response.status}) ${await response.text()}`;
}

export default async function keepBrevoKeysAlive(): Promise<Response> {
  const failures = (await Promise.all([keepSmtpKeyAlive(), keepApiKeyAlive()])).filter(Boolean);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`brevo-keepalive : ${failure}`);
    return new Response('échec', { status: 502 });
  }
  console.log('brevo-keepalive : clés SMTP et API maintenues actives.');
  return new Response('ok');
}

export const config = { schedule: '@monthly' };
