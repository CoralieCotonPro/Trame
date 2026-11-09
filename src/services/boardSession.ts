import { clientId, colorFor } from '../lib/identity';
import { displayRect } from '../lib/layout';
import { cloneElement } from '../lib/elements';
import {
  diffCatalog,
  diffElements,
  replayOps,
  type BoardSnapshot,
  type Op,
  type PatchOp,
} from '../lib/ops';
import { fitToContent } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useSyncStore } from '../stores/syncStore';
import { useTagStore } from '../stores/tagStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardElement, TagCategory, TagValue } from '../types/board';
import {
  elementFromRow,
  loadBoard,
  loadRealtimeKey,
  loadRole,
  type BoardRole,
  type ElementRow,
} from './boardApi';
import {
  clearRemoteDrag,
  connect,
  disconnect,
  setEditing,
  type DbChange,
} from './collaboration';
import { outboxStorage } from './outboxStorage';
import { SyncEngine } from './syncEngine';

const CONFLICT_NOTICE =
  'Ce texte a été modifié ailleurs entre-temps. Votre version est conservée dans une copie juste à côté.';
const REJECTED_NOTICE =
  'Une modification a été refusée par le serveur. Le tableau a été rechargé depuis la dernière version enregistrée.';
const DELETED_WHILE_EDITING = 'Cet élément vient d’être supprimé par un autre participant.';

interface OpenSession {
  boardId: string;
  userId: string;
  engine: SyncEngine;
  contentRevisions: Map<string, number>;
  revisions: Map<string, number>;
  realtimeKey: string;
  identity: { name: string; color: string };
}

let session: OpenSession | null = null;
let unsubscribers: (() => void)[] = [];
/** Vrai pendant que l'état vient du serveur : rien à renvoyer. */
let applyingServerState = false;
let needsRefresh = false;
let openGeneration = 0;

const ui = () => useUiStore.getState();

function withoutTracking(update: () => void) {
  applyingServerState = true;
  try {
    update();
  } finally {
    applyingServerState = false;
  }
}

function applySnapshot(snapshot: BoardSnapshot) {
  withoutTracking(() => {
    useBoardStore.setState({ name: snapshot.name, elements: snapshot.elements });
    useTagStore.setState({ categories: snapshot.categories, values: snapshot.values });
  });
}

function resetInterface(role: BoardRole) {
  ui().set({
    selectedIds: new Set(),
    editingId: null,
    filters: {},
    filtersOpen: false,
    tagPicker: null,
    contextMenu: null,
    tagManagerOpen: false,
    accessLost: false,
    role,
  });
  useBoardStore.setState({ past: [], future: [] });
}

function startTracking() {
  let editing: string | null = null;
  unsubscribers = [
    useBoardStore.subscribe((state, previous) => {
      if (applyingServerState || !session || ui().role === 'viewer') return;
      if (state.name !== previous.name) {
        session.engine.add([{ id: crypto.randomUUID(), kind: 'board.rename', name: state.name }]);
      }
      if (state.elements !== previous.elements) {
        const known = new Set(useTagStore.getState().values.map((value) => value.id));
        session.engine.add(diffElements(previous.elements, state.elements, known));
      }
    }),
    useTagStore.subscribe((state, previous) => {
      if (applyingServerState || !session || ui().role === 'viewer') return;
      session.engine.add(diffCatalog(previous, state));
    }),
    useUiStore.subscribe((state) => {
      if (state.editingId === editing) return;
      const finished = editing;
      editing = state.editingId;
      setEditing(editing);
      if (editing) session?.engine.beginEdit(editing);
      // Après la prise en compte du texte validé, qui est synchrone.
      if (finished) queueMicrotask(() => session?.engine.endEdit(finished));
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

function removeLocally(elementId: string) {
  withoutTracking(() => {
    useBoardStore.setState((state) => {
      const elements = { ...state.elements };
      delete elements[elementId];
      return { elements };
    });
  });
  if (ui().selectedIds.has(elementId)) {
    const selectedIds = new Set(ui().selectedIds);
    selectedIds.delete(elementId);
    ui().set({ selectedIds });
  }
  if (ui().editingId === elementId) {
    ui().set({ editingId: null });
    useSyncStore.getState().set({ notice: DELETED_WHILE_EDITING });
  }
}

/** Dernière version du serveur, sur laquelle on réapplique nos modifications non confirmées. */
async function refreshFromServer() {
  const current = session;
  if (!current) return;
  let acknowledged: number;
  let loaded: Awaited<ReturnType<typeof loadBoard>>;
  do {
    acknowledged = current.engine.acknowledged;
    loaded = await loadBoard(current.boardId);
    if (session !== current) return;
  } while (acknowledged !== current.engine.acknowledged);
  if (!loaded) return;

  loaded.contentRevisions.forEach((value, id) => current.contentRevisions.set(id, value));
  loaded.revisions.forEach((value, id) => current.revisions.set(id, value));
  applySnapshot(replayOps(loaded.snapshot, current.engine.pending()));
}

function pendingFor(elementId: string): Op[] {
  return (session?.engine.pending() ?? []).filter(
    (op) =>
      (op.kind === 'element.patch' && op.element_id === elementId) ||
      (op.kind === 'element.delete' && op.element_id === elementId) ||
      (op.kind === 'element.create' && op.element.id === elementId),
  );
}

function applyElementRow(row: ElementRow) {
  if (!session) return;
  const seen = session.revisions.get(row.id);
  if (seen !== undefined && row.revision <= seen) return;
  session.revisions.set(row.id, row.revision);
  session.contentRevisions.set(row.id, row.content_revision);

  const existing = useBoardStore.getState().elements[row.id];
  const tags = existing?.type === 'postit' ? existing.tags : {};
  const { elements } = replayOps(
    { name: '', elements: { [row.id]: elementFromRow(row, tags) }, categories: [], values: [] },
    pendingFor(row.id),
  );
  const merged = elements[row.id];
  withoutTracking(() => {
    useBoardStore.setState((state) => {
      const next = { ...state.elements };
      if (merged) next[row.id] = merged;
      else delete next[row.id];
      return { elements: next };
    });
  });
  clearRemoteDrag(row.id);
}

function applyTagRow(change: DbChange) {
  const elementId = change.r.element_id as string;
  const categoryId = change.r.category_id as string;
  const valueId = change.r.tag_value_id as string;
  withoutTracking(() => {
    useBoardStore.setState((state) => {
      const element = state.elements[elementId];
      if (element?.type !== 'postit') return state;
      const tags = { ...element.tags };
      if (change.o === 'D') delete tags[categoryId];
      else tags[categoryId] = valueId;
      return { elements: { ...state.elements, [elementId]: { ...element, tags } } };
    });
  });
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return [...items.filter((entry) => entry.id !== item.id), item];
}

function applyCatalogRow(change: DbChange) {
  withoutTracking(() => {
    if (change.t === 'tag_categories') {
      const id = change.r.id as string;
      const category: TagCategory = {
        id,
        name: change.r.name as string,
        sortOrder: change.r.sort_order as number,
      };
      useTagStore.setState((state) =>
        change.o === 'D'
          ? {
              categories: state.categories.filter((item) => item.id !== id),
              values: state.values.filter((item) => item.categoryId !== id),
            }
          : { categories: upsertById(state.categories, category) },
      );
    } else {
      const id = change.r.id as string;
      const value: TagValue = {
        id,
        categoryId: change.r.category_id as string,
        label: change.r.label as string,
        color: change.r.color as string,
        sortOrder: change.r.sort_order as number,
      };
      useTagStore.setState((state) => ({
        values:
          change.o === 'D'
            ? state.values.filter((item) => item.id !== id)
            : upsertById(state.values, value),
      }));
      if (change.o === 'D') {
        const filters = Object.fromEntries(
          Object.entries(ui().filters).map(([key, ids]) => [key, ids.filter((item) => item !== id)]),
        );
        ui().set({ filters });
      }
    }
  });
}

function handleDbChange(change: DbChange) {
  if (!session || change.c === clientId) return;
  switch (change.t) {
    case 'elements':
      if (change.o === 'D') removeLocally(change.r.id as string);
      else applyElementRow(change.r as unknown as ElementRow);
      break;
    case 'element_tags':
      applyTagRow(change);
      break;
    case 'tag_categories':
    case 'tag_values':
      applyCatalogRow(change);
      break;
    case 'boards':
      if (change.o === 'D') loseAccess();
      else if (!session.engine.pending().some((op) => op.kind === 'board.rename')) {
        withoutTracking(() => useBoardStore.setState({ name: change.r.name as string }));
      }
      break;
  }
}

function loseAccess() {
  closeBoard();
  ui().set({ accessLost: true, editingId: null });
}

function connectRealtime(current: OpenSession) {
  void connect(current.boardId, current.realtimeKey, clientId, current.identity, {
    onDbChange: handleDbChange,
    onAccessChanged: () => void handleAccessChanged().catch(() => undefined),
    // Y compris à chaque reconnexion : rattrape ce qui a été manqué entre-temps.
    onSubscribed: () => void refreshFromServer().catch(() => undefined),
  });
}

async function handleAccessChanged() {
  const current = session;
  if (!current) return;
  const [role, realtimeKey] = await Promise.all([
    loadRole(current.boardId, current.userId),
    loadRealtimeKey(current.boardId),
  ]);
  if (session !== current) return;
  if (!role || !realtimeKey) {
    loseAccess();
    return;
  }
  ui().set(role === 'viewer' ? { role, editingId: null, tagManagerOpen: false } : { role });

  if (realtimeKey !== current.realtimeKey) {
    current.realtimeKey = realtimeKey;
    disconnect();
    connectRealtime(current);
  }
}

/** Ouvre un tableau : état serveur + modifications locales pas encore confirmées. */
export async function openBoard(
  boardId: string,
  user: { id: string; name: string },
): Promise<'ready' | 'not-found'> {
  closeBoard();
  const generation = openGeneration;
  const [loaded, role, realtimeKey] = await Promise.all([
    loadBoard(boardId),
    loadRole(boardId, user.id),
    loadRealtimeKey(boardId),
  ]);
  if (!loaded || !role || !realtimeKey) return 'not-found';

  const storageKey = `${user.id}:${boardId}`;
  const pending = await outboxStorage.read(storageKey);
  // Une ouverture plus récente, ou une fermeture, a eu lieu pendant le chargement.
  if (generation !== openGeneration) return 'ready';

  applySnapshot(replayOps(loaded.snapshot, pending));
  resetInterface(role);
  useSyncStore.getState().set({ state: 'saved', pending: 0, notice: null });

  const { contentRevisions, revisions } = loaded;
  const engine = new SyncEngine(boardId, storageKey, pending, contentRevisions, revisions, clientId, {
    onConflict: handleConflict,
    onMissing: removeLocally,
    onRejected: () => {
      needsRefresh = true;
      useSyncStore.getState().set({ notice: REJECTED_NOTICE });
      queueMicrotask(() => {
        if (needsRefresh && session?.engine === engine && engine.isIdle()) {
          needsRefresh = false;
          void refreshFromServer();
        }
      });
    },
  });
  session = {
    boardId,
    userId: user.id,
    engine,
    contentRevisions,
    revisions,
    realtimeKey,
    identity: { name: user.name, color: colorFor(user.id) },
  };
  startTracking();

  const onOnline = () => void refreshFromServer().catch(() => undefined);
  window.addEventListener('online', onOnline);
  unsubscribers.push(() => window.removeEventListener('online', onOnline));

  connectRealtime(session);
  return 'ready';
}

export function closeBoard() {
  openGeneration += 1;
  session?.engine.stop();
  session = null;
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  needsRefresh = false;
  disconnect();
}

export function revealContent() {
  fitToContent();
}
