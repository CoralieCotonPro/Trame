import { Copy, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  createShareLink,
  listActiveLinks,
  listMembers,
  removeMember,
  revokeShareLink,
  setMemberRole,
  type Member,
  type ShareLink,
  type ShareRole,
} from '../../services/shareApi';
import { useUiStore } from '../../stores/uiStore';
import { IconButton } from '../toolbar/IconButton';

const ROLE_LABEL: Record<ShareRole, string> = { editor: 'Édition', viewer: 'Lecture seule' };
const EXPIRATIONS = [1, 7, 30, 90];
const selectClass = 'h-9 rounded-md border border-line bg-surface px-2 text-sm';

function ShareContent({ boardId }: { boardId: string }) {
  const setUi = useUiStore((state) => state.set);
  const ref = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<ShareRole>('editor');
  const [days, setDays] = useState(7);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const close = () => setUi({ shareOpen: false });

  const reload = useCallback(async () => {
    const [nextLinks, nextMembers] = await Promise.all([
      listActiveLinks(boardId),
      listMembers(boardId),
    ]);
    setLinks(nextLinks);
    setMembers(nextMembers);
  }, [boardId]);

  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      setError(null);
      try {
        await action();
        await reload();
      } catch {
        setError("L'opération a échoué. Réessayez.");
      }
    },
    [reload],
  );

  useEffect(() => {
    ref.current?.focus();
    let active = true;
    Promise.all([listActiveLinks(boardId), listMembers(boardId)])
      .then(([nextLinks, nextMembers]) => {
        if (!active) return;
        setLinks(nextLinks);
        setMembers(nextMembers);
      })
      .catch(() => setError('Impossible de charger les droits. Réessayez.'));
    return () => {
      active = false;
    };
  }, [boardId]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Partager le tableau"
        tabIndex={-1}
        data-shortcuts-off
        onKeyDown={onKeyDown}
        className="flex max-h-full w-full max-w-lg flex-col rounded-panel bg-surface shadow-panel outline-none"
      >
        <header className="flex items-center justify-between py-2 pr-2 pl-5">
          <h2 className="text-lg font-semibold">Partager le tableau</h2>
          <IconButton icon={X} label="Fermer" tooltipSide="bottom" onClick={close} />
        </header>

        <div className="space-y-5 overflow-y-auto px-5 pb-5">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Droits du lien"
                value={role}
                onChange={(event) => setRole(event.target.value as ShareRole)}
                className={selectClass}
              >
                <option value="editor">{ROLE_LABEL.editor}</option>
                <option value="viewer">{ROLE_LABEL.viewer}</option>
              </select>
              <select
                aria-label="Durée de validité"
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
                className={selectClass}
              >
                {EXPIRATIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} jour{value > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  void run(async () => {
                    setUrl(await createShareLink(boardId, role, days));
                    setCopied(false);
                  })
                }
                className="h-9 rounded-md bg-accent px-3 text-sm font-medium text-white"
              >
                Créer un lien
              </button>
            </div>
            {url && (
              <div>
                <div className="flex items-center gap-1">
                  <input
                    readOnly
                    value={url}
                    aria-label="Lien de partage"
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-9 min-w-0 flex-1 rounded-md border border-line bg-paper px-2 text-sm"
                  />
                  <IconButton
                    icon={Copy}
                    label={copied ? 'Copié' : 'Copier le lien'}
                    tooltipSide="top"
                    onClick={() => {
                      void navigator.clipboard.writeText(url).then(() => setCopied(true));
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Copiez ce lien maintenant : il ne sera plus affiché ensuite.
                  {copied && ' Lien copié.'}
                </p>
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </section>

          <section aria-label="Liens actifs">
            <h3 className="mb-1.5 text-sm font-semibold">Liens actifs</h3>
            {links.length === 0 && <p className="text-sm text-ink-soft">Aucun lien actif.</p>}
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {ROLE_LABEL[link.role]}
                    {link.expires_at &&
                      ` · expire le ${new Date(link.expires_at).toLocaleDateString('fr-FR')}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void run(() => revokeShareLink(link.id))}
                    className="rounded-md px-2 py-1 font-medium text-danger hover:bg-paper"
                  >
                    Révoquer
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Personnes">
            <h3 className="mb-1.5 text-sm font-semibold">Personnes</h3>
            <ul className="space-y-1">
              {members.map((member) => (
                <li key={member.user_id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    {member.role === 'owner' ? 'Vous (propriétaire)' : member.display_name || 'Invité'}
                  </span>
                  {member.role !== 'owner' && (
                    <div className="flex items-center gap-1">
                      <select
                        aria-label={`Droits de ${member.display_name || 'Invité'}`}
                        value={member.role}
                        onChange={(event) =>
                          void run(() =>
                            setMemberRole(boardId, member.user_id, event.target.value as ShareRole),
                          )
                        }
                        className={selectClass}
                      >
                        <option value="editor">{ROLE_LABEL.editor}</option>
                        <option value="viewer">{ROLE_LABEL.viewer}</option>
                      </select>
                      <IconButton
                        icon={Trash2}
                        label={`Retirer ${member.display_name || 'Invité'}`}
                        tooltipSide="top"
                        onClick={() => void run(() => removeMember(boardId, member.user_id))}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ShareDialog({ boardId }: { boardId: string }) {
  const open = useUiStore((state) => state.shareOpen);
  return open ? <ShareContent boardId={boardId} /> : null;
}
