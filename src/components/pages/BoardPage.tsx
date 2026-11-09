import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../hooks/useRoute';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { closeBoard, openBoard, revealContent } from '../../services/boardSession';
import { useUiStore } from '../../stores/uiStore';
import { BoardCanvas } from '../board/BoardCanvas';
import { ElementEditor } from '../board/ElementEditor';
import { ElementsA11yList } from '../board/ElementsA11yList';
import { PropertiesPanel } from '../board/PropertiesPanel';
import { RemoteOverlay } from '../collaboration/RemoteOverlay';
import { ShareDialog } from '../collaboration/ShareDialog';
import { ContextMenu } from '../dialogs/ContextMenu';
import { FiltersPanel } from '../tags/FiltersPanel';
import { TagManager } from '../tags/TagManager';
import { TagPicker } from '../tags/TagPicker';
import { SyncNotice } from '../toolbar/SaveStatus';
import { Toolbar } from '../toolbar/Toolbar';
import { TopBar } from '../toolbar/TopBar';
import { ZoomBar } from '../toolbar/ZoomBar';

type LoadState = { boardId: string; status: 'ready' | 'not-found' | 'error' } | null;

function Message({ text }: { text: string }) {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
      <p>{text}</p>
      <button type="button" onClick={() => navigate('/')} className="font-medium text-accent">
        Retour à mes tableaux
      </button>
    </main>
  );
}

function LoadedBoard({ boardId }: { boardId: string }) {
  useKeyboardShortcuts();
  const hasViewport = useUiStore((state) => state.viewport.width > 0);
  const revealed = useRef(false);

  // Le cadrage initial attend que la taille de la zone soit connue.
  useEffect(() => {
    if (hasViewport && !revealed.current) {
      revealed.current = true;
      revealContent();
    }
  }, [hasViewport]);

  return (
    <main className="relative h-full w-full overflow-hidden">
      <BoardCanvas />
      <RemoteOverlay />
      <ElementEditor />
      <TopBar />
      <Toolbar />
      <ZoomBar />
      <PropertiesPanel />
      <ContextMenu />
      <FiltersPanel />
      <TagPicker />
      <TagManager />
      <ShareDialog boardId={boardId} />
      <SyncNotice />
      <ElementsA11yList />
    </main>
  );
}

export function BoardPage({
  boardId,
  user,
}: {
  boardId: string;
  user: { id: string; name: string };
}) {
  const [loaded, setLoaded] = useState<LoadState>(null);
  const accessLost = useUiStore((state) => state.accessLost);
  const { id: userId, name: userName } = user;

  useEffect(() => {
    useUiStore.getState().set({ accessLost: false });
    let cancelled = false;
    openBoard(boardId, { id: userId, name: userName })
      .then((status) => {
        if (!cancelled) setLoaded({ boardId, status });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ boardId, status: 'error' });
      });
    return () => {
      cancelled = true;
      closeBoard();
    };
  }, [boardId, userId, userName]);

  if (accessLost) return <Message text="Votre accès à ce tableau a été retiré." />;
  if (loaded?.boardId !== boardId) return <Message text="Chargement du tableau…" />;
  if (loaded.status === 'not-found') {
    return <Message text="Ce tableau n'existe pas, ou vous n'y avez pas accès." />;
  }
  if (loaded.status === 'error') {
    return <Message text="Impossible de charger ce tableau. Vérifiez votre connexion." />;
  }
  return <LoadedBoard boardId={boardId} />;
}
