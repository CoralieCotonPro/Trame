import { useState, type FormEvent } from 'react';
import { initialAuthError, supabase } from '../../lib/supabase';

type Status = 'idle' | 'busy' | 'link-sent';

function linkErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === 'otp_expired') {
    return 'Ce lien de connexion a expiré ou a déjà servi : certaines messageries ouvrent les liens automatiquement. Connectez-vous avec votre mot de passe, ou demandez un nouveau lien.';
  }
  return 'La connexion par lien a échoué. Connectez-vous avec votre mot de passe, ou demandez un nouveau lien.';
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(() => linkErrorMessage(initialAuthError));

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('busy');
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setStatus('idle');
    if (signInError) {
      setError(
        signInError.status === 429
          ? 'Trop de tentatives. Patientez quelques minutes.'
          : 'Adresse ou mot de passe incorrect. Pas encore de mot de passe ? Recevez un lien par e-mail.',
      );
    }
  };

  const sendLink = async () => {
    if (!email.trim()) {
      setError('Indiquez d’abord votre adresse e-mail.');
      return;
    }
    setStatus('busy');
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Le premier lien crée le compte ; la base n'accepte que les adresses @beta.gouv.fr.
      options: { emailRedirectTo: window.location.origin },
    });
    if (sendError) {
      setStatus('idle');
      setError(
        sendError.status === 429
          ? "Trop d'envois récents. Patientez quelques minutes avant de redemander un lien."
          : sendError.status === 403
            ? 'Seules les adresses @beta.gouv.fr peuvent créer un compte.'
            : "L'envoi a échoué. Vérifiez l'adresse et réessayez dans quelques instants.",
      );
      return;
    }
    setStatus('link-sent');
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-panel border border-line bg-surface p-6 shadow-panel">
        <h1 className="text-xl font-bold">Trame</h1>

        {status === 'link-sent' ? (
          <div className="mt-3">
            <p role="status" className="text-ink-soft">
              Un lien de connexion a été envoyé à <strong className="text-ink">{email}</strong>.
              Ouvrez-le, puis définissez un mot de passe depuis la page « Tableaux » : vous
              n'aurez plus besoin d'e-mail ensuite.
            </p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-3 text-sm text-ink-soft underline-offset-2 hover:underline"
            >
              Revenir à la connexion
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={(event) => void signIn(event)} className="mt-3">
              <label htmlFor="email" className="block text-sm text-ink-soft">
                Adresse e-mail
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
              <label htmlFor="password" className="mt-3 block text-sm text-ink-soft">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-lg border border-line px-3"
              />
              <button
                type="submit"
                disabled={status === 'busy'}
                className="mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60"
              >
                Se connecter
              </button>
            </form>

            <div className="mt-5 border-t border-line pt-4">
              <p className="text-sm text-ink-soft">
                Première visite, ou mot de passe oublié ? Recevez un lien de connexion. Le compte
                est créé automatiquement pour une adresse @beta.gouv.fr.
              </p>
              <button
                type="button"
                disabled={status === 'busy'}
                onClick={() => void sendLink()}
                className="mt-2 h-10 w-full rounded-lg border border-accent font-medium text-accent disabled:opacity-60"
              >
                Recevoir un lien par e-mail
              </button>
            </div>
          </>
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
