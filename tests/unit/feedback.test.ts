import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import feedback from '../../netlify/functions/feedback.mjs';

const ENV = {
  VITE_SUPABASE_URL: 'https://projet.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'cle-publique',
  BREVO_API_KEY: 'cle-brevo',
  TRAME_FEEDBACK_EMAIL: 'equipe@beta.gouv.fr',
};

const post = (body: unknown, token: string | null = 'jeton') =>
  new Request('https://trame.test/.netlify/functions/feedback', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });

let user: Record<string, unknown> | null;
let brevo: { status: number; sent: Record<string, unknown>[] };

beforeEach(() => {
  Object.assign(process.env, ENV);
  user = { email: 'prenom.nom@beta.gouv.fr', is_anonymous: false };
  brevo = { status: 201, sent: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/auth/v1/user')) {
        const ok = (init.headers as Record<string, string>).authorization === 'Bearer jeton' && user;
        return new Response(JSON.stringify(user), { status: ok ? 200 : 401 });
      }
      brevo.sent.push(JSON.parse(init.body as string));
      expect((init.headers as Record<string, string>)['api-key']).toBe('cle-brevo');
      return new Response('{}', { status: brevo.status });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('fonction feedback', () => {
  it('envoie l’idée par e-mail, avec l’auteur en adresse de réponse', async () => {
    const response = await feedback(post({ message: '  Un mode sombre  ', board: 'Atelier', page: 'https://trame.test/b/1' }));
    expect(response.status).toBe(200);
    expect(brevo.sent).toHaveLength(1);
    const mail = brevo.sent[0] as { to: { email: string }[]; replyTo: { email: string }; textContent: string; subject: string };
    expect(mail.to).toEqual([{ email: 'equipe@beta.gouv.fr' }]);
    expect(mail.replyTo).toEqual({ email: 'prenom.nom@beta.gouv.fr' });
    expect(mail.subject).toContain('prenom.nom@beta.gouv.fr');
    expect(mail.textContent).toBe(
      'Nouvelle idée envoyée par prenom.nom@beta.gouv.fr\nTableau : Atelier\nPage : https://trame.test/b/1\n\nUn mode sombre',
    );
  });

  it('refuse une personne non connectée ou un jeton invalide', async () => {
    expect((await feedback(post({ message: 'Spam' }, null))).status).toBe(401);
    expect((await feedback(post({ message: 'Spam' }, 'faux'))).status).toBe(401);
    expect(brevo.sent).toHaveLength(0);
  });

  it('refuse un message vide et tronque un message trop long', async () => {
    expect((await feedback(post({ message: '   ' }))).status).toBe(400);
    await feedback(post({ message: 'a'.repeat(5000) }));
    expect((brevo.sent[0] as { textContent: string }).textContent).toMatch(/\n\na{3000}$/);
  });

  it('un invité n’a pas d’adresse de réponse', async () => {
    user = { is_anonymous: true };
    await feedback(post({ message: 'Idée' }));
    expect(brevo.sent[0]).not.toHaveProperty('replyTo');
    expect((brevo.sent[0] as { textContent: string }).textContent).toContain('un invité');
  });

  it('signale un refus de Brevo et une configuration incomplète', async () => {
    brevo.status = 401;
    expect((await feedback(post({ message: 'Idée' }))).status).toBe(502);
    delete process.env.BREVO_API_KEY;
    expect((await feedback(post({ message: 'Idée' }))).status).toBe(500);
  });
});
