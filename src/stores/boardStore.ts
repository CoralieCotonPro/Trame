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

const SCALAR_KEYS = ['x', 'y', 'width', 'height', 'zIndex'] as const;
const RECORD_KEYS = ['content', 'style', 'tags'] as const;

/**
 * Applique seulement ce que cette action a changé : annuler son déplacement
 * ne doit pas effacer le texte qu'un collègue a modifié entre-temps.
 */
function mergeChange(current: BoardElement, from: BoardElement, to: BoardElement): BoardElement {
  const next = { ...current } as unknown as Record<string, unknown>;
  const source = from as unknown as Record<string, unknown>;
  const target = to as unknown as Record<string, unknown>;

  for (const key of SCALAR_KEYS) {
    if (source[key] !== target[key]) next[key] = target[key];
  }
  for (const key of RECORD_KEYS) {
    const before = (source[key] ?? {}) as Record<string, string>;
    const after = (target[key] ?? {}) as Record<string, string>;
    if (!(key in next)) continue;
    const merged = { ...(next[key] as Record<string, string>) };
    for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (before[field] === after[field]) continue;
      const value = after[field];
      if (value === undefined) delete merged[field];
      else merged[field] = value;
    }
    next[key] = merged;
  }
  return next as unknown as BoardElement;
}

function withChanges(elements: Elements, changes: ElementChange[], side: 'before' | 'after') {
  const next = { ...elements };
  for (const change of changes) {
    const target = change[side];
    const source = change[side === 'after' ? 'before' : 'after'];
    const current = next[change.id];
    if (!target) delete next[change.id];
    else if (!current || !source || current === source) next[change.id] = target;
    else next[change.id] = mergeChange(current, source, target);
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
