import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { navigate } from '../../hooks/useRoute';
import {
  filterBoards,
  isProjectId,
  listCreators,
  projectName,
  PROJECTS,
  readFilters,
  writeFilters,
  type BoardFilters,
  type ProjectId,
} from '../../lib/projects';
import { supabase } from '../../lib/supabase';
import { createBoard, deleteBoard, listBoards, type BoardSummary } from '../../services/boardApi';
import { FeedbackWidget } from '../feedback/FeedbackWidget';
import { IconButton } from '../toolbar/IconButton';
import { PasswordForm } from './PasswordForm';

const selectClass = 'h-10 rounded-lg border border-line bg-surface px-2 text-sm';

interface BoardRowProps {
  board: BoardSummary;
  isMine: boolean;
  onDeleted: () => void;
  onError: () => void;
}

function BoardRow({ board, isMine, onDeleted, onError }: BoardRowProps) {
  const [confirming, setConfirming] = useState(false);
  const title = board.name || 'Sans titre';
  const creator = isMine ? 'vous' : board.owner_email;

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
          <span className="min-w-0">
            <span className="block truncate font-medium">{title}</span>
            {creator && (
              <span className="block truncate text-sm text-ink-soft">Créé par {creator}</span>
            )}
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1 text-sm text-ink-soft">
            <span className="rounded border border-line px-1.5 text-xs font-medium text-ink">
              {projectName(board.project_id)}
            </span>
            {new Date(board.updated_at).toLocaleDateString('fr-FR')}
          </span>
        </a>
        {isMine && (
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
  const [project, setProject] = useState<ProjectId | ''>('');
  const [filters, setFilters] = useState<BoardFilters>(() => readFilters(window.location.search));
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    listBoards()
      .then(setBoards)
      .catch(() => setError('Impossible de charger les tableaux. Vérifiez votre connexion.'));
  }, []);

  const updateFilters = (next: BoardFilters) => {
    setFilters(next);
    window.history.replaceState(null, '', `/${writeFilters(next)}`);
  };

  const creators = useMemo(
    () => listCreators(boards ?? []).filter((creator) => creator.id !== userId),
    [boards, userId],
  );
  const visible = useMemo(() => filterBoards(boards ?? [], filters), [boards, filters]);
  const filtering = filters.project !== null || filters.creator !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!project) return;
    setCreating(true);
    setError(null);
    try {
      navigate(`/b/${await createBoard(name.trim() || 'Sans titre', project)}`);
    } catch {
      setError('La création du tableau a échoué. Réessayez.');
      setCreating(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto p-4">
      <div className="mx-auto mt-12 max-w-xl">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tableaux</h1>
          <div className="flex gap-1">
            {!isGuest && (
              <button
                type="button"
                onClick={() => setPasswordOpen(true)}
                className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-surface"
              >
                Mot de passe
              </button>
            )}
            <button
              type="button"
              onClick={() => void supabase.auth.signOut()}
              className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-surface"
            >
              Se déconnecter
            </button>
          </div>
        </header>

        {passwordOpen && <PasswordForm onDone={() => setPasswordOpen(false)} />}

        {!isGuest && (
          <form onSubmit={(event) => void submit(event)} className="mt-6 flex flex-wrap gap-2">
            <input
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Nom du nouveau tableau"
              aria-label="Nom du nouveau tableau"
              className="h-10 min-w-0 flex-1 basis-48 rounded-lg border border-line bg-surface px-3"
            />
            <select
              value={project}
              required
              aria-label="Projet du nouveau tableau"
              onChange={(event) => setProject(isProjectId(event.target.value) ? event.target.value : '')}
              className={selectClass}
            >
              <option value="" disabled>
                Projet…
              </option>
              {PROJECTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating || !project}
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

        {boards && boards.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2" role="group" aria-label="Filtres">
            <select
              value={filters.project ?? ''}
              aria-label="Filtrer par projet"
              onChange={(event) =>
                updateFilters({
                  ...filters,
                  project: isProjectId(event.target.value) ? event.target.value : null,
                })
              }
              className={selectClass}
            >
              <option value="">Tous les projets</option>
              {PROJECTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {!isGuest && (
              <select
                value={filters.creator ?? ''}
                aria-label="Filtrer par créateur"
                onChange={(event) => updateFilters({ ...filters, creator: event.target.value || null })}
                className={`${selectClass} min-w-0 max-w-xs flex-1`}
              >
                <option value="">Tous les créateurs</option>
                <option value={userId}>Moi</option>
                {creators.map((creator) => (
                  <option key={creator.id} value={creator.id}>
                    {creator.email}
                  </option>
                ))}
              </select>
            )}
            {filtering && (
              <button
                type="button"
                onClick={() => updateFilters({ project: null, creator: null })}
                className="rounded-md px-2 py-1 text-sm text-ink-soft hover:bg-surface"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {visible.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              isMine={board.owner_id === userId}
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
        {boards && boards.length > 0 && visible.length === 0 && (
          <p className="mt-6 text-ink-soft">Aucun tableau ne correspond à ces filtres.</p>
        )}
      </div>
      <FeedbackWidget className="fixed right-4 bottom-4" />
    </main>
  );
}
