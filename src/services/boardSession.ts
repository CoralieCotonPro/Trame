import { displayRect } from '../lib/layout';
import { cloneElement } from '../lib/elements';
import { diffCatalog, diffElements, replayOps, type BoardSnapshot, type PatchOp } from '../lib/ops';
import { fitToContent } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useSyncStore } from '../stores/syncStore';
import { useTagStore } from '../stores/tagStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardElement } from '../types/board';
import { loadBoard } from './boardApi';
import { outboxStorage } from './outboxStorage';
import { SyncEngine } from './syncEngine';

const CONFLICT_NOTICE =
  'Ce texte a été modifié ailleurs entre-temps. Votre version est conservée dans une copie juste à côté.';
const REJECTED_NOTICE =
  "Une modification a été refusée par le serveur. Le tableau a été rechargé depuis la dernière version enregistrée.";

let engine: SyncEngine | null = null;
let unsubscribers: (() => void)[] = [];
/** Vrai pendant que l'état vient du serveur : rien à renvoyer. */
let applyingServerState = false;
let needsRefresh = false;
let openGeneration = 0;

function withoutTracking(update: () => void) {
  applyingServerState = true;
  try {
    update();
  } finally {
    applyingServerState = false;
  }
}

function hydrate(snapshot: BoardSnapshot) {
  withoutTracking(() => {
    useBoardStore.setState({
      name: snapshot.name,
      elements: snapshot.elements,
      past: [],
      future: [],
    });
    useTagStore.setState({ categories: snapshot.categories, values: snapshot.values });
    useUiStore.getState().set({
      selectedIds: new Set(),
      editingId: null,
      filters: {},
      filtersOpen: false,
      tagPicker: null,
      contextMenu: null,
      tagManagerOpen: false,
    });
  });
}

function startTracking() {
  unsubscribers = [
    useBoardStore.subscribe((state, previous) => {
      if (applyingServerState || !engine) return;
      if (state.name !== previous.name) {
        engine.add([{ id: crypto.randomUUID(), kind: 'board.rename', name: state.name }]);
      }
      if (state.elements !== previous.elements) {
        const known = new Set(useTagStore.getState().values.map((value) => value.id));
        engine.add(diffElements(previous.elements, state.elements, known));
      }
    }),
    useTagStore.subscribe((state, previous) => {
      if (applyingServerState || !engine) return;
      engine.add(diffCatalog(previous, state));
    }),
  ];
}

function handleConflict(op: PatchOp, serverContent: Record<string, string>) {
  const { elements, addElements } = useBoardStore.getState();
  const current = elements[op.element_id];
  if (!current) return;

  // Le texte du serveur reprend sa place ; le nôtre part dans une copie, envoyée normalement.
  const mine = { ...current.content, ...op.content };
  const zIndex = Math.max(...Object.values(elements).map((element) => element.zIndex)) + 1;
  const copy = {
    ...cloneElement(current, { x: 24, y: displayRect(current).height + 24 }, zIndex),
    content: mine,
  } as BoardElement;

  withoutTracking(() => {
    useBoardStore.setState((state) => ({
      elements: {
        ...state.elements,
        [current.id]: { ...current, content: serverContent } as BoardElement,
      },
    }));
  });
  addElements([copy]);
  useSyncStore.getState().set({ notice: CONFLICT_NOTICE });
}

function handleMissing(elementId: string) {
  withoutTracking(() => {
    useBoardStore.setState((state) => {
      const elements = { ...state.elements };
      delete elements[elementId];
      return { elements };
    });
  });
}

async function refreshFromServer(boardId: string, contentRevisions: Map<string, number>) {
  const loaded = await loadBoard(boardId);
  if (!loaded) return;
  loaded.contentRevisions.forEach((revision, id) => contentRevisions.set(id, revision));
  hydrate(loaded.snapshot);
}

/** Ouvre un tableau : état serveur + modifications locales pas encore confirmées. */
export async function openBoard(boardId: string, userId: string): Promise<'ready' | 'not-found'> {
  closeBoard();
  const generation = openGeneration;
  const loaded = await loadBoard(boardId);
  if (!loaded) return 'not-found';

  const storageKey = `${userId}:${boardId}`;
  const pending = await outboxStorage.read(storageKey);
  // Une ouverture plus récente, ou une fermeture, a eu lieu pendant le chargement.
  if (generation !== openGeneration) return 'ready';

  hydrate(replayOps(loaded.snapshot, pending));
  useSyncStore.getState().set({ state: 'saved', pending: 0, notice: null });

  const { contentRevisions } = loaded;
  const current = new SyncEngine(boardId, storageKey, pending, contentRevisions, {
    onConflict: handleConflict,
    onMissing: handleMissing,
    onRejected: () => {
      needsRefresh = true;
      useSyncStore.getState().set({ notice: REJECTED_NOTICE });
      queueMicrotask(() => {
        if (needsRefresh && engine === current && current.isIdle()) {
          needsRefresh = false;
          void refreshFromServer(boardId, contentRevisions);
        }
      });
    },
  });
  engine = current;
  startTracking();
  return 'ready';
}

export function closeBoard() {
  openGeneration += 1;
  engine?.stop();
  engine = null;
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  needsRefresh = false;
}

export function revealContent() {
  fitToContent();
}
