import { Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { navigate } from '../../hooks/useRoute';
import { supabase } from '../../lib/supabase';
import { createBoard, deleteBoard, listBoards, type BoardSummary } from '../../services/boardApi';
import { IconButton } from '../toolbar/IconButton';

interface BoardRowProps {
  board: BoardSummary;
  canDelete: boolean;
  onDeleted: () => void;
  onError: () => void;
}

function BoardRow({ board, canDelete, onDeleted, onError }: BoardRowProps) {
  const [confirming, setConfirming] = useState(false);
  const title = board.name || 'Sans titre';

  const confirm = async () => {
    try {
      await deleteBoard(board.id);
      onDeleted();
    } catch {
      onError();
      setConfirming(false);
    }
  };

  return (
    <li className="rounded-lg border border-line bg-surface hover:shadow-panel">
      <div className="flex items-center gap-1 pr-1">
        <a
          href={`/b/${board.id}`}
          onClick={(event) => {
            event.preventDefault();
            navigate(`/b/${board.id}`);
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3"
        >
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 text-sm text-ink-soft">
            {new Date(board.updated_at).toLocaleDateString('fr-FR')}
          </span>
        </a>
        {canDelete && (
          <IconButton
            icon={Trash2}
            label={`Supprimer ${title}`}
            tooltipSide="top"
            onClick={() => setConfirming(true)}
          />
        )}
      </div>
      {confirming && (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-line p-3 text-sm">
          <span className="min-w-0 flex-1">
            Supprimer définitivement « {title} » et tout son contenu ?
          </span>
          <button
            type="button"
            onClick={() => void confirm()}
            className="rounded-md bg-danger px-2 py-1 font-medium text-white"
          >
            Confirmer la suppression
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md px-2 py-1 hover:bg-paper"
          >
            Annuler
          </button>
        </div>
      )}
    </li>
  );
}

export function HomePage({ userId, isGuest }: { userId: string; isGuest: boolean }) {
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
      setError('La création du tableau a échoué. Réessayez.');
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

        {!isGuest && (
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
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <ul className="mt-6 space-y-2">
          {boards?.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              canDelete={board.owner_id === userId}
              onDeleted={() => setBoards((list) => list?.filter((b) => b.id !== board.id) ?? null)}
              onError={() => setError('La suppression a échoué. Réessayez.')}
            />
          ))}
        </ul>
        {boards?.length === 0 && (
          <p className="mt-6 text-ink-soft">
            {isGuest ? 'Aucun tableau partagé pour le moment.' : "Aucun tableau pour l'instant. Créez le premier."}
          </p>
        )}
      </div>
    </main>
  );
}
