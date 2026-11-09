import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    setStatus(error ? 'error' : 'sent');
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-panel border border-line bg-surface p-6 shadow-panel">
        <h1 className="text-xl font-bold">Tableau blanc Envergo</h1>
        {status === 'sent' ? (
          <p role="status" className="mt-3 text-ink-soft">
            Un lien de connexion a été envoyé à <strong className="text-ink">{email}</strong>.
            Ouvrez-le pour accéder à vos tableaux.
          </p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-3">
            <label htmlFor="email" className="block text-sm text-ink-soft">
              Votre adresse e-mail, pour recevoir un lien de connexion
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
              disabled={status === 'sending'}
              className="mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60"
            >
              {status === 'sending' ? 'Envoi…' : 'Recevoir le lien'}
            </button>
            {status === 'error' && (
              <p role="alert" className="mt-2 text-sm text-[#b3261e]">
                L'envoi a échoué. Vérifiez l'adresse et réessayez dans quelques instants.
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
