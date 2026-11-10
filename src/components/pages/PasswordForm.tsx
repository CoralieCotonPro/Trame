import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';

const MIN_LENGTH = 10;

/** Permet de se connecter ensuite sans e-mail, y compris sur téléphone. */
export function PasswordForm({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < MIN_LENGTH) {
      setMessage({ ok: false, text: `Choisissez au moins ${MIN_LENGTH} caractères.` });
      return;
    }
    if (password !== confirmation) {
      setMessage({ ok: false, text: 'Les deux mots de passe ne sont pas identiques.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: 'L’enregistrement a échoué. Réessayez.' });
      return;
    }
    setPassword('');
    setConfirmation('');
    setMessage({ ok: true, text: 'Mot de passe enregistré. Vous pouvez vous connecter avec.' });
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label="Définir mon mot de passe"
      className="mt-6 rounded-lg border border-line bg-surface p-4"
    >
      <h2 className="font-semibold">Définir mon mot de passe</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Pour vous connecter ensuite sans e-mail, y compris sur téléphone. {MIN_LENGTH} caractères
        au minimum.
      </p>
      <label htmlFor="new-password" className="mt-3 block text-sm text-ink-soft">
        Nouveau mot de passe
      </label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-line px-3"
      />
      <label htmlFor="confirm-password" className="mt-3 block text-sm text-ink-soft">
        Confirmer le mot de passe
      </label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-line px-3"
      />
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-lg bg-accent px-4 font-medium text-white disabled:opacity-60"
        >
          Enregistrer le mot de passe
        </button>
        <button type="button" onClick={onDone} className="h-10 rounded-lg px-3 hover:bg-paper">
          Fermer
        </button>
      </div>
      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`mt-3 text-sm ${message.ok ? 'text-ink' : 'text-danger'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
