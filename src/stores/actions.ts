import { fitCamera, screenToBoard, visibleBoardRect, zoomAt } from '../lib/camera';
import { cloneElement, createPostit, createText } from '../lib/elements';
import { boundsOf, sortByZ } from '../lib/geometry';
import { displayRect } from '../lib/layout';
import type { BoardElement, ElementPatch, Point } from '../types/board';
import { useBoardStore } from './boardStore';
import { useUiStore } from './uiStore';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();
const PASTE_OFFSET = 24;

let clipboard: BoardElement[] = [];
let pasteCount = 0;

function allElements(): BoardElement[] {
  return Object.values(board().elements);
}

export function selectedElements(): BoardElement[] {
  const { elements } = board();
  return sortByZ([...ui().selectedIds].flatMap((id) => elements[id] ?? []));
}

function topZ(): number {
  return allElements().reduce((max, element) => Math.max(max, element.zIndex), 0);
}

function viewportCenter(): Point {
  const { camera, viewport } = ui();
  return screenToBoard(camera, { x: viewport.width / 2, y: viewport.height / 2 });
}

/** Évite d'empiler exactement deux éléments créés au même endroit. */
function freeSpot(position: Point): Point {
  const taken = allElements();
  const spot = { ...position };
  while (taken.some((element) => element.x === spot.x && element.y === spot.y)) {
    spot.x += PASTE_OFFSET;
    spot.y += PASTE_OFFSET;
  }
  return spot;
}

function insertAndEdit(element: BoardElement) {
  board().addElements([element]);
  ui().set({ selectedIds: new Set([element.id]), editingId: element.id, contextMenu: null });
}

/** Sans position, l'élément apparaît sous le curseur, ou au centre de la vue. */
export function addPostit(at?: Point) {
  const center = at ?? ui().cursor ?? viewportCenter();
  const element = createPostit(center, topZ() + 1);
  const spot = freeSpot({ x: center.x - element.width / 2, y: center.y - element.height / 2 });
  insertAndEdit({ ...element, ...spot });
}

export function addText() {
  const center = ui().cursor ?? viewportCenter();
  const element = createText(center, topZ() + 1);
  insertAndEdit({ ...element, ...freeSpot({ x: center.x - element.width / 2, y: center.y }) });
}

export function startEditing(id: string) {
  ui().set({ selectedIds: new Set([id]), editingId: id, contextMenu: null });
}

export function finishEditing(id: string, patch: ElementPatch | null) {
  ui().set({ editingId: null });
  const element = board().elements[id];
  if (!element || !patch?.content) return;

  const changed = Object.entries(patch.content).some(
    ([key, value]) => (element.content as Record<string, string>)[key] !== value,
  );
  if (changed) board().patchElements({ [id]: patch });

  const edited = board().elements[id];
  if (edited?.type === 'text' && !edited.content.text.trim()) {
    deleteElements([id]);
  }
}

function deleteElements(ids: string[]) {
  board().removeElements(ids);
  const selectedIds = new Set(ui().selectedIds);
  ids.forEach((id) => selectedIds.delete(id));
  ui().set({ selectedIds });
}

export function deleteSelection() {
  deleteElements([...ui().selectedIds]);
  ui().set({ contextMenu: null });
}

function insertCopies(sources: BoardElement[], offset: Point) {
  let zIndex = topZ();
  const copies = sortByZ(sources).map((source) => cloneElement(source, offset, (zIndex += 1)));
  board().addElements(copies);
  ui().select(copies.map((copy) => copy.id));
  ui().set({ contextMenu: null });
}

export function duplicateSelection() {
  insertCopies(selectedElements(), { x: PASTE_OFFSET, y: PASTE_OFFSET });
}

export function copySelection() {
  clipboard = selectedElements().map((element) => structuredClone(element));
  pasteCount = 0;
  ui().set({ contextMenu: null });
}

export function paste() {
  if (clipboard.length === 0) return;
  pasteCount += 1;
  const distance = PASTE_OFFSET * pasteCount;
  insertCopies(clipboard, { x: distance, y: distance });
}

export function selectAll() {
  ui().select(allElements().map((element) => element.id));
}

function reorder(position: 'front' | 'back') {
  const selection = selectedElements();
  const all = allElements();
  const patches: Record<string, ElementPatch> = {};
  if (position === 'front') {
    let zIndex = topZ();
    selection.forEach((element) => (patches[element.id] = { zIndex: (zIndex += 1) }));
  } else {
    let zIndex = Math.min(...all.map((element) => element.zIndex));
    [...selection].reverse().forEach((element) => (patches[element.id] = { zIndex: (zIndex -= 1) }));
  }
  board().patchElements(patches);
  ui().set({ contextMenu: null });
}

export const bringToFront = () => reorder('front');
export const sendToBack = () => reorder('back');

export function moveSelection(delta: Point) {
  const patches: Record<string, ElementPatch> = {};
  for (const element of selectedElements()) {
    patches[element.id] = { x: element.x + delta.x, y: element.y + delta.y };
  }
  board().patchElements(patches);
}

export function patchSelection(patch: ElementPatch) {
  const patches: Record<string, ElementPatch> = {};
  for (const element of selectedElements()) patches[element.id] = patch;
  board().patchElements(patches);
}

function keepExisting(ids: string[]) {
  ui().set({ editingId: null });
  ui().select(ids);
}

export const undo = () => keepExisting(board().undo());
export const redo = () => keepExisting(board().redo());

function setCamera(next: (camera: ReturnType<typeof ui>['camera']) => typeof camera) {
  const camera = next(ui().camera);
  ui().set({ camera });
}

function viewportMiddle(): Point {
  const { viewport } = ui();
  return { x: viewport.width / 2, y: viewport.height / 2 };
}

export function zoomBy(factor: number) {
  setCamera((camera) => zoomAt(camera, viewportMiddle(), camera.zoom * factor));
}

export function resetZoom() {
  setCamera((camera) => zoomAt(camera, viewportMiddle(), 1));
}

export function fitToContent() {
  const bounds = boundsOf(allElements().map(displayRect));
  if (bounds) ui().set({ camera: fitCamera(bounds, ui().viewport) });
  else ui().set({ camera: { x: 0, y: 0, zoom: 1 } });
}

/** Amène un élément au centre de la vue s'il n'y est pas déjà visible. */
export function revealElement(element: BoardElement) {
  const { camera, viewport } = ui();
  const rect = displayRect(element);
  const view = visibleBoardRect(camera, viewport);
  const visible =
    rect.x >= view.x &&
    rect.y >= view.y &&
    rect.x + rect.width <= view.x + view.width &&
    rect.y + rect.height <= view.y + view.height;
  if (visible) return;
  ui().set({
    camera: {
      ...camera,
      x: viewport.width / 2 - (rect.x + rect.width / 2) * camera.zoom,
      y: viewport.height / 2 - (rect.y + rect.height / 2) * camera.zoom,
    },
  });
}
