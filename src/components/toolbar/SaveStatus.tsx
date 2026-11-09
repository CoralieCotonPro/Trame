import { Check, CloudOff, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { useSyncStore, type SyncState } from '../../stores/syncStore';

const STATES: Record<SyncState, { label: string; icon: typeof Check; spin?: boolean }> = {
  saved: { label: 'Enregistré', icon: Check },
  saving: { label: 'Enregistrement…', icon: LoaderCircle, spin: true },
  offline: { label: 'Hors connexion', icon: CloudOff },
  error: { label: 'Erreur d’enregistrement', icon: TriangleAlert },
};

export function SaveStatus() {
  const state = useSyncStore((store) => store.state);
  const { label, icon: Icon, spin } = STATES[state];
  return (
    <span role="status" data-testid="save-status" className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-soft">
      <Icon size={15} aria-hidden="true" className={spin ? 'animate-spin' : undefined} />
      {label}
    </span>
  );
}

/** Message ponctuel : conflit de texte ou modification refusée. */
export function SyncNotice() {
  const notice = useSyncStore((store) => store.notice);
  const set = useSyncStore((store) => store.set);

  // Tant que l'on a des modifications non envoyées, quitter la page les laisse en attente.
  const pending = useSyncStore((store) => store.pending);
  useEffect(() => {
    if (pending === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  if (!notice) return null;
  return (
    <div
      role="alert"
      className="absolute bottom-20 left-1/2 z-30 flex max-w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-2 rounded-panel bg-ink py-2 pr-2 pl-4 text-sm text-white shadow-panel"
    >
      <span>{notice}</span>
      <button type="button" aria-label="Fermer le message" onClick={() => set({ notice: null })} className="shrink-0 p-0.5">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
