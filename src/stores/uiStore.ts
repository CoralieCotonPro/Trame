import { create } from 'zustand';
import type { BoardFile } from '../lib/boardFile';
import type { Camera, LineElement, Point, Rect, Side, TagFilters } from '../types/board';

export type Tool = 'select' | 'hand' | 'line';

export interface ContextMenuState {
  x: number;
  y: number;
}

/** État propre à cette fenêtre : il n'est jamais destiné à être sauvegardé. */
interface UiState {
  tool: Tool;
  camera: Camera;
  viewport: { width: number; height: number };
  selectedIds: ReadonlySet<string>;
  editingId: string | null;
  gridVisible: boolean;
  /** Les éléments déplacés, redimensionnés ou créés s'alignent sur la grille. */
  snapToGrid: boolean;
  doubleClickCreates: boolean;
  spaceHeld: boolean;
  cursor: Point | null;
  dragDelta: Point | null;
  /** Aperçu d'un redimensionnement, ou d'une extrémité de trait déplacée (`style`). */
  resizePreview: { id: string; rect: Rect; style?: Partial<LineElement['style']> } | null;
  /** Trait en cours de tracé ; `arrow` pour une flèche tirée depuis un élément. */
  lineDraft: { from: Point; to: Point; arrow?: boolean; path?: Point[] } | null;
  /** Élément survolé : ses poignées de flèche apparaissent. */
  hoverId: string | null;
  /** Élément et côté où s'accrochera la flèche en cours. */
  connectTarget: { id: string; side: Side } | null;
  /** Mots sélectionnés dans un texte, à transformer en lien. */
  linkRequest: { elementId: string; field: string; value: string; start: number; end: number } | null;
  marquee: Rect | null;
  contextMenu: ContextMenuState | null;
  tagPicker: (ContextMenuState & { focusCategoryId: string | null }) | null;
  tagManagerOpen: boolean;
  filtersOpen: boolean;
  filters: TagFilters;
  role: 'owner' | 'editor' | 'viewer';
  accessLost: boolean;
  shareOpen: boolean;
  exporting: boolean;
  importFile: BoardFile | null;
  set: (partial: Partial<Omit<UiState, 'set' | 'select'>>) => void;
  select: (ids: Iterable<string>) => void;
}

export const useUiStore = create<UiState>((set) => ({
  tool: 'select',
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { width: 0, height: 0 },
  selectedIds: new Set(),
  editingId: null,
  gridVisible: true,
  snapToGrid: true,
  doubleClickCreates: true,
  spaceHeld: false,
  cursor: null,
  dragDelta: null,
  resizePreview: null,
  lineDraft: null,
  hoverId: null,
  connectTarget: null,
  linkRequest: null,
  marquee: null,
  contextMenu: null,
  tagPicker: null,
  tagManagerOpen: false,
  filtersOpen: false,
  filters: {},
  role: 'owner',
  accessLost: false,
  shareOpen: false,
  exporting: false,
  importFile: null,
  set,
  select: (ids) => set({ selectedIds: new Set(ids) }),
}));
