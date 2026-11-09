import { useEffect, useState, type FormEvent } from 'react';
import { navigate } from '../../hooks/useRoute';
import { supabase } from '../../lib/supabase';
import { createBoard, listBoards, type BoardSummary } from '../../services/boardApi';

export function HomePage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listBoards()
      .then(setBoards)
      .catch(() => setError('Impossible de charger vos tableaux. Vérifiez votre connexion.'));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      navigate(`/b/${await createBoard(name.trim() || 'Sans titre')}`);
    } catch {
      setError("La création du tableau a échoué. Réessayez.");
      setCreating(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto p-4">
      <div className="mx-auto mt-12 max-w-xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Mes tableaux</h1>
          <button
            type="button"
            onClick={() => void supabase.auth.signOut()}
            className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-surface"
          >
            Se déconnecter
          </button>
        </header>

        <form onSubmit={(event) => void submit(event)} className="mt-6 flex gap-2">
          <input
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nom du nouveau tableau"
            aria-label="Nom du nouveau tableau"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3"
          />
          <button
            type="submit"
            disabled={creating}
            className="h-10 rounded-lg bg-accent px-4 font-medium text-white disabled:opacity-60"
          >
            Créer
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-[#b3261e]">
            {error}
          </p>
        )}

        <ul className="mt-6 space-y-2">
          {boards?.map((board) => (
            <li key={board.id}>
              <a
                href={`/b/${board.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/b/${board.id}`);
                }}
                className="flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3 hover:shadow-panel"
              >
                <span className="font-medium">{board.name || 'Sans titre'}</span>
                <span className="text-sm text-ink-soft">
                  {new Date(board.updated_at).toLocaleDateString('fr-FR')}
                </span>
              </a>
            </li>
          ))}
        </ul>
        {boards?.length === 0 && (
          <p className="mt-6 text-ink-soft">Aucun tableau pour l'instant. Créez le premier.</p>
        )}
      </div>
    </main>
  );
}
