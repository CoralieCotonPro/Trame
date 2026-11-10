import { useState, type FormEvent } from 'react';
import { initialAuthError, supabase } from '../../lib/supabase';

const PENDING_EMAIL_KEY = 'trame:pending-email';

/** Sur téléphone, l'onglet peut être rechargé pendant qu'on va lire ses e-mails. */
function readPendingEmail(): string {
  try {
    return sessionStorage.getItem(PENDING_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

function storePendingEmail(email: string | null) {
  try {
    if (email) sessionStorage.setItem(PENDING_EMAIL_KEY, email);
    else sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Confort seulement : l'adresse sera simplement redemandée.
  }
}

function linkErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === 'otp_expired') {
    return 'Ce lien de connexion a expiré ou a déjà servi. Demandez un code ci-dessous.';
  }
  return 'La connexion a échoué. Demandez un code ci-dessous.';
}

export function LoginPage() {
  const [pendingEmail, setPendingEmail] = useState(readPendingEmail);
  const [email, setEmail] = useState(pendingEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => linkErrorMessage(initialAuthError));

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (sendError) {
      setError(
        sendError.status === 429
          ? "Trop d'envois récents. Patientez un peu avant de redemander un code."
          : "L'envoi a échoué. Vérifiez l'adresse et réessayez dans quelques instants.",
      );
      return;
    }
    storePendingEmail(email.trim());
    setPendingEmail(email.trim());
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: pendingEmail,
      token: code.replace(/\s/g, ''),
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError('Code incorrect ou expiré. Vérifiez-le, ou demandez-en un nouveau.');
      return;
    }
    // La session ouverte, l'application affiche directement les tableaux.
    storePendingEmail(null);
  };

  const restart = () => {
    storePendingEmail(null);
    setPendingEmail('');
    setCode('');
    setError(null);
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-panel border border-line bg-surface p-6 shadow-panel">
        <h1 className="text-xl font-bold">Trame</h1>

        {pendingEmail ? (
          <form onSubmit={(event) => void verifyCode(event)} className="mt-3">
            <p role="status" className="text-ink-soft">
              Un code a été envoyé à <strong className="text-ink">{pendingEmail}</strong>.
            </p>
            <label htmlFor="code" className="mt-3 block text-sm text-ink-soft">
              Code reçu par e-mail
            </label>
            <input
              id="code"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,12}"
              maxLength={12}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-1.5 h-12 w-full rounded-lg border border-line px-3 text-center text-2xl tracking-widest"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Vérification…' : 'Se connecter'}
            </button>
            <button
              type="button"
              onClick={restart}
              className="mt-2 w-full text-sm text-ink-soft underline-offset-2 hover:underline"
            >
              Changer d'adresse ou recevoir un nouveau code
            </button>
          </form>
        ) : (
          <form onSubmit={(event) => void requestCode(event)} className="mt-3">
            <label htmlFor="email" className="block text-sm text-ink-soft">
              Votre adresse e-mail, pour recevoir un code de connexion
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-line px-3"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60"
            >
              {busy ? 'Envoi…' : 'Recevoir un code'}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}
