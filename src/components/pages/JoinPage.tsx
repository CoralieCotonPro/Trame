import { useState, type FormEvent } from 'react';
import { navigate } from '../../hooks/useRoute';
import { storedDisplayName, storeDisplayName } from '../../lib/identity';
import { supabase } from '../../lib/supabase';
import { redeemShareLink } from '../../services/shareApi';

/** Page d'arrivée d'un lien de partage : un prénom suffit, sans création de compte. */
export function JoinPage({ hasSession }: { hasSession: boolean }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const [name, setName] = useState(storedDisplayName);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : 'Ce lien est incomplet. Demandez-en un nouveau.',
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setJoining(true);
    setError(null);
    try {
      if (!hasSession) {
        const { error: authError } = await supabase.auth.signInAnonymously();
        if (authError) throw authError;
      }
      const boardId = await redeemShareLink(token, name);
      storeDisplayName(name.trim());
      navigate(`/b/${boardId}`);
    } catch {
      setError("Ce lien n'est plus valide. Demandez-en un nouveau à la personne qui l'a partagé.");
      setJoining(false);
    }
  };

  return (
    <main className="flex h-full items-center justify-center p-4">
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full max-w-sm rounded-panel border border-line bg-surface p-6 shadow-panel"
      >
        <h1 className="text-xl font-bold">Rejoindre le tableau</h1>
        <label htmlFor="name" className="mt-3 block text-sm text-ink-soft">
          Votre prénom ou pseudonyme
        </label>
        <input
          id="name"
          required
          maxLength={40}
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1.5 h-10 w-full rounded-lg border border-line px-3"
        />
        <button
          type="submit"
          disabled={joining || !token}
          className="mt-3 h-10 w-full rounded-lg bg-accent font-medium text-white disabled:opacity-60"
        >
          {joining ? 'Connexion…' : 'Rejoindre'}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
