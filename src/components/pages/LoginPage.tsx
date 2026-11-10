import { useState, type FormEvent } from 'react';
import { initialAuthError, supabase } from '../../lib/supabase';

type Step = 'email' | 'choose' | 'link-sent';

function linkErrorMessage(code: string | null): string | null {
  if (!code) return null;
  if (code === 'otp_expired') {
    return 'Ce lien de connexion a expiré ou a déjà servi : certaines messageries ouvrent les liens automatiquement. Connectez-vous avec votre mot de passe, ou demandez un nouveau lien.';
  }
  return 'La connexion par lien a échoué. Connectez-vous avec votre mot de passe, ou demandez un nouveau lien.';
}

const inputClass = 'mt-1.5 h-10 w-full rounded-lg border border-line px-3';
const primaryClass =
  'mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60';
const secondaryClass =
  'mt-3 h-10 w-full rounded-lg border border-accent font-medium text-accent disabled:opacity-60';

export function LoginPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(() => linkErrorMessage(initialAuthError));

  const goToChoice = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setStep('choose');
  };

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(
        signInError.status === 429
          ? 'Trop de tentatives. Patientez quelques minutes.'
          : 'Mot de passe incorrect, ou pas encore défini. Recevez plutôt un lien par e-mail ci-dessous.',
      );
    }
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      // Le premier lien crée le compte ; la base n'accepte que les adresses @beta.gouv.fr.
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (sendError) {
      setError(
        sendError.status === 429
          ? "Trop d'envois récents. Patientez quelques minutes avant de redemander un lien."
          : sendError.status === 403
            ? 'Seules les adresses @beta.gouv.fr peuvent créer un compte.'
            : "L'envoi a échoué. Vérifiez l'adresse et réessayez dans quelques instants.",
      );
      return;
    }
    setStep('link-sent');
  };

  const changeEmail = () => {
    setPassword('');
    setError(null);
    setStep('email');
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-panel border border-line bg-surface p-6 shadow-panel">
        <h1 className="text-xl font-bold">Trame</h1>

        {step === 'email' && (
          <form onSubmit={goToChoice} className="mt-3">
            <label htmlFor="email" className="block text-sm text-ink-soft">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
            <button type="submit" className={primaryClass}>
              Continuer
            </button>
          </form>
        )}

        {step === 'choose' && (
          <div className="mt-3">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
              <span className="min-w-0 truncate font-medium text-ink">{email.trim()}</span>
              <button
                type="button"
                onClick={changeEmail}
                className="underline-offset-2 hover:underline"
              >
                Modifier
              </button>
            </p>

            <form
              onSubmit={(event) => void signIn(event)}
              className="mt-4"
              aria-labelledby="with-password"
            >
              {/* Pour les gestionnaires de mots de passe : l'identifiant accompagne le mot de passe. */}
              <input type="email" autoComplete="username" value={email} readOnly hidden />
              <h2 id="with-password" className="font-medium">
                J'ai déjà un mot de passe
              </h2>
              <label htmlFor="password" className="mt-2 block text-sm text-ink-soft">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
              />
              <button type="submit" disabled={busy} className={primaryClass}>
                Se connecter
              </button>
            </form>

            <div className="mt-5 border-t border-line pt-4">
              <h2 className="font-medium">Première connexion ou mot de passe oublié</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Recevez un lien de connexion, puis choisissez votre mot de passe. Pour une adresse
                @beta.gouv.fr, le compte est créé automatiquement.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendLink()}
                className={secondaryClass}
              >
                Recevoir un lien par e-mail
              </button>
            </div>
          </div>
        )}

        {step === 'link-sent' && (
          <div className="mt-3">
            <p role="status" className="text-ink-soft">
              Un lien de connexion a été envoyé à <strong className="text-ink">{email.trim()}</strong>.
              Ouvrez-le, puis définissez un mot de passe depuis la page « Tableaux » : vous
              n'aurez plus besoin d'e-mail ensuite.
            </p>
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="mt-3 text-sm text-ink-soft underline-offset-2 hover:underline"
            >
              Revenir à la connexion
            </button>
          </div>
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
