/**
 * Une fois par mois, demande un lien de connexion pour TRAME_KEEPALIVE_EMAIL.
 * L'e-mail part par le SMTP Brevo : sa clé expire après 90 jours sans envoi.
 * Un échec apparaît dans les journaux des fonctions Netlify.
 */
export default async function keepSmtpAlive(): Promise<Response> {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.TRAME_KEEPALIVE_EMAIL;
  if (!url || !key || !email) {
    console.error('brevo-keepalive : variable manquante (Supabase ou TRAME_KEEPALIVE_EMAIL).');
    return new Response('configuration incomplète', { status: 500 });
  }

  const response = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    // Le compte doit déjà exister : cet appel n'en crée jamais.
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!response.ok) {
    console.error(`brevo-keepalive : envoi refusé (${response.status}) ${await response.text()}`);
    return new Response('échec', { status: 502 });
  }
  console.log('brevo-keepalive : lien envoyé, clé SMTP maintenue active.');
  return new Response('ok');
}

export const config = { schedule: '@monthly' };
