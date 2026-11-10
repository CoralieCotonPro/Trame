/**
 * Reçoit une idée d'amélioration depuis le widget et l'envoie par e-mail (API Brevo).
 * Seule une personne connectée à Trame peut écrire : son jeton Supabase est vérifié.
 *
 * Variables Netlify : VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, BREVO_API_KEY,
 * TRAME_FEEDBACK_EMAIL (destinataire, et expéditeur validé dans Brevo).
 */

export const MAX_MESSAGE_LENGTH = 3000;

interface SupabaseUser {
  email?: string;
  is_anonymous?: boolean;
}

const json = (status: number, body: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

async function currentUser(url: string, key: string, authorization: string) {
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, authorization },
  });
  return response.ok ? ((await response.json()) as SupabaseUser) : null;
}

export default async function feedback(request: Request): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Méthode non autorisée.' });

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const apiKey = process.env.BREVO_API_KEY;
  const to = process.env.TRAME_FEEDBACK_EMAIL;
  if (!url || !key || !apiKey || !to) {
    console.error('feedback : variable manquante.');
    return json(500, { error: 'Envoi non configuré.' });
  }

  const authorization = request.headers.get('authorization');
  const user = authorization?.startsWith('Bearer ')
    ? await currentUser(url, key, authorization)
    : null;
  if (!user) return json(401, { error: 'Connectez-vous pour envoyer un message.' });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const message = clip(body?.message, MAX_MESSAGE_LENGTH);
  if (!message) return json(400, { error: 'Le message est vide.' });
  const page = clip(body?.page, 300);
  const board = clip(body?.board, 200);

  const author = user.is_anonymous || !user.email ? 'un invité (session anonyme)' : user.email;
  const header = [`Nouvelle idée envoyée par ${author}`, board && `Tableau : ${board}`, page && `Page : ${page}`]
    .filter(Boolean)
    .join('\n');
  const text = `${header}\n\n${message}`;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Trame', email: to },
      to: [{ email: to }],
      // Répondre à l'e-mail écrit directement à la personne, si elle a un compte.
      ...(user.is_anonymous || !user.email ? {} : { replyTo: { email: user.email } }),
      subject: `Trame : une idée de ${user.is_anonymous ? 'un invité' : author}`,
      textContent: text,
    }),
  });
  if (!response.ok) {
    console.error(`feedback : Brevo a refusé l'envoi (${response.status}) ${await response.text()}`);
    return json(502, { error: "L'envoi a échoué." });
  }
  return json(200, { status: 'ok' });
}
