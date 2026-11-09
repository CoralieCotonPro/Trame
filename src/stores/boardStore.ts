import { create } from 'zustand';
import type { BoardElement, ElementPatch } from '../types/board';

const HISTORY_LIMIT = 200;

/** Une modification et son inverse : `null` signifie que l'élément n'existe pas. */
export interface ElementChange {
  id: string;
  before: BoardElement | null;
  after: BoardElement | null;
}

type Elements = Record<string, BoardElement>;

interface BoardState {
  name: string;
  elements: Elements;
  past: ElementChange[][];
  future: ElementChange[][];
  rename: (name: string) => void;
  addElements: (elements: BoardElement[]) => void;
  patchElements: (patches: Record<string, ElementPatch>) => void;
  removeElements: (ids: string[]) => void;
  purgeTags: (valueIds: Set<string>) => void;
  undo: () => string[];
  redo: () => string[];
}

function withChanges(elements: Elements, changes: ElementChange[], side: 'before' | 'after') {
  const next = { ...elements };
  for (const change of changes) {
    const value = change[side];
    if (value) next[change.id] = value;
    else delete next[change.id];
  }
  return next;
}

function mergedTags(current: Record<string, string>, changes: Record<string, string | null>) {
  const next = { ...current };
  for (const [categoryId, valueId] of Object.entries(changes)) {
    if (valueId) next[categoryId] = valueId;
    else delete next[categoryId];
  }
  return next;
}

function patched(element: BoardElement, { tags, ...patch }: ElementPatch): BoardElement {
  return {
    ...element,
    ...patch,
    content: { ...element.content, ...patch.content },
    style: { ...element.style, ...patch.style },
    ...(element.type === 'postit' && tags ? { tags: mergedTags(element.tags, tags) } : {}),
    updatedAt: new Date().toISOString(),
  } as BoardElement;
}

export const useBoardStore = create<BoardState>((set, get) => {
  const commit = (changes: ElementChange[]) => {
    if (changes.length === 0) return;
    set((state) => ({
      elements: withChanges(state.elements, changes, 'after'),
      past: [...state.past, changes].slice(-HISTORY_LIMIT),
      future: [],
    }));
  };

  return {
    name: 'Sans titre',
    elements: {},
    past: [],
    future: [],

    rename: (name) => set({ name }),

    addElements: (elements) =>
      commit(elements.map((after) => ({ id: after.id, before: null, after }))),

    patchElements: (patches) => {
      const { elements } = get();
      commit(
        Object.entries(patches).flatMap(([id, patch]) => {
          const before = elements[id];
          return before ? [{ id, before, after: patched(before, patch) }] : [];
        }),
      );
    },

    removeElements: (ids) => {
      const { elements } = get();
      commit(
        ids.flatMap((id) => {
          const before = elements[id];
          return before ? [{ id, before, after: null }] : [];
        }),
      );
    },

    // Hors historique : la suppression d'un tag du catalogue ne s'annule pas.
    // Une annulation peut donc ramener un identifiant disparu, que resolveTags ignore.
    purgeTags: (valueIds) =>
      set((state) => {
        const elements = { ...state.elements };
        for (const element of Object.values(state.elements)) {
          if (element.type !== 'postit') continue;
          const kept = Object.entries(element.tags).filter(([, id]) => !valueIds.has(id));
          if (kept.length !== Object.keys(element.tags).length) {
            elements[element.id] = { ...element, tags: Object.fromEntries(kept) };
          }
        }
        return { elements };
      }),

    undo: () => {
      const changes = get().past.at(-1);
      if (!changes) return [];
      set((state) => ({
        elements: withChanges(state.elements, changes, 'before'),
        past: state.past.slice(0, -1),
        future: [...state.future, changes],
      }));
      return changes.filter((change) => change.before).map((change) => change.id);
    },

    redo: () => {
      const changes = get().future.at(-1);
      if (!changes) return [];
      set((state) => ({
        elements: withChanges(state.elements, changes, 'after'),
        past: [...state.past, changes],
        future: state.future.slice(0, -1),
      }));
      return changes.filter((change) => change.after).map((change) => change.id);
    },
  };
});
