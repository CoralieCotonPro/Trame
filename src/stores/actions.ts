import { fitCamera, screenToBoard, visibleBoardRect, zoomAt } from '../lib/camera';
import { cloneElement, createDiamond, createLine, createPostit, createText } from '../lib/elements';
import { attachedIds, lineFromPoints, sideAnchor } from '../lib/line';
import { snapPoint } from '../lib/snap';
import { boundsOf, recentCentroid, sortByZ } from '../lib/geometry';
import { displayRect, lineEnds } from '../lib/layout';
import { matchesFilters, shownElements, valuesOf } from '../lib/tags';
import type { BoardElement, ElementPatch, LineElement, Point, Side } from '../types/board';
import { useBoardStore } from './boardStore';
import { useTagStore } from './tagStore';
import { useUiStore } from './uiStore';

const board = () => useBoardStore.getState();
const ui = () => useUiStore.getState();
const PASTE_OFFSET = 24;

let clipboard: BoardElement[] = [];
let pasteCount = 0;

function allElements(): BoardElement[] {
  return Object.values(board().elements);
}

/** Éléments non masqués par les filtres : les seuls que l'on peut atteindre. */
export function visibleElements(): BoardElement[] {
  const { filters, selectedIds } = ui();
  return shownElements(allElements(), filters, selectedIds);
}

export function selectedElements(): BoardElement[] {
  const { elements } = board();
  return sortByZ([...ui().selectedIds].flatMap((id) => elements[id] ?? []));
}

/** Retire de la sélection ce que les filtres viennent de masquer. */
function pruneSelection() {
  const { editingId, selectedIds, filters } = ui();
  const { elements } = board();
  const kept = [...selectedIds].filter((id) => {
    const element = elements[id];
    return element && (id === editingId || matchesFilters(element, filters));
  });
  if (kept.length !== selectedIds.size) ui().select(kept);
}

function topZ(): number {
  return allElements().reduce((max, element) => Math.max(max, element.zIndex), 0);
}

function viewportCenter(): Point {
  const { camera, viewport } = ui();
  return screenToBoard(camera, { x: viewport.width / 2, y: viewport.height / 2 });
}

/** Évite d'empiler exactement deux éléments créés au même endroit. */
/** Position libre, alignée sur la grille si l'aimantation est active. */
function freeSpot(position: Point): Point {
  const taken = allElements();
  const spot = ui().snapToGrid ? snapPoint(position) : { ...position };
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
  // Sous un filtre, le nouveau post-it reprend les valeurs filtrées pour rester visible.
  const tags = Object.fromEntries(
    Object.entries(ui().filters).flatMap(([categoryId, [first]]) =>
      first ? [[categoryId, first]] : [],
    ),
  );
  const element = createPostit(center, topZ() + 1, tags);
  const spot = freeSpot({ x: center.x - element.width / 2, y: center.y - element.height / 2 });
  insertAndEdit({ ...element, ...spot });
}

export function addText() {
  const center = ui().cursor ?? viewportCenter();
  const element = createText(center, topZ() + 1);
  insertAndEdit({ ...element, ...freeSpot({ x: center.x - element.width / 2, y: center.y }) });
}

export function addDiamond() {
  const center = ui().cursor ?? viewportCenter();
  const element = createDiamond(center, topZ() + 1);
  const spot = freeSpot({ x: center.x - element.width / 2, y: center.y - element.height / 2 });
  insertAndEdit({ ...element, ...spot });
}

/** Sur un trait, on modifie le texte écrit en son milieu. */
export function startEditing(id: string) {
  if (!board().elements[id]) return;
  ui().set({ selectedIds: new Set([id]), editingId: id, contextMenu: null });
}

export function addLine(from: Point, to: Point) {
  const { start, ...rect } = lineFromPoints(from, to);
  const element = createLine(rect, start, topZ() + 1);
  board().addElements([element]);
  ui().select([element.id]);
}

/** Élément auquel une flèche peut s'accrocher. */
export function canConnect(element: BoardElement | undefined): boolean {
  return element !== undefined && element.type !== 'line';
}

/**
 * Flèche tirée depuis un côté d'un élément, dans le sens du geste : elle finit sur
 * `target` s'il y en a un, sinon au point `to`, laissé libre.
 */
export function addConnector(
  sourceId: string,
  sourceSide: Side,
  target: { id: string; side: Side } | null,
  to: Point,
) {
  const source = board().elements[sourceId];
  const targetElement = target ? board().elements[target.id] : undefined;
  if (!source) return;
  const from = sideAnchor(displayRect(source), sourceSide);
  const end = target && targetElement ? sideAnchor(displayRect(targetElement), target.side) : to;
  const { start, ...rect } = lineFromPoints(from, end);
  const line = createLine(rect, start, topZ() + 1);
  const element: LineElement = {
    ...line,
    style: {
      ...line.style,
      arrow: 'end',
      route: 'elbow',
      from: sourceId,
      fromSide: sourceSide,
      to: target && targetElement ? target.id : '',
      toSide: target && targetElement ? target.side : '',
    },
  };
  board().addElements([element]);
  ui().select([element.id]);
}

/** Fige les extrémités accrochées d'un trait là où elles sont : il devient libre. */
export function detachedCopy(line: LineElement, keep: ReadonlySet<string> = new Set()): LineElement {
  const ends = lineEnds(line);
  const { start, ...rect } = lineFromPoints(ends.start, ends.end);
  const fromKept = Boolean(line.style.from && keep.has(line.style.from));
  const toKept = Boolean(line.style.to && keep.has(line.style.to));
  return {
    ...line,
    ...rect,
    style: {
      ...line.style,
      start,
      from: fromKept ? line.style.from : '',
      fromSide: fromKept ? line.style.fromSide : '',
      to: toKept ? line.style.to : '',
      toSide: toKept ? line.style.toSide : '',
    },
  };
}

export function finishEditing(id: string, patch: ElementPatch | null) {
  ui().set({ editingId: null });
  const element = board().elements[id];
  if (!element || !patch?.content) return;

  const changed = Object.entries(patch.content).some(
    ([key, value]) => ((element.content as Record<string, string>)[key] ?? '') !== value,
  );
  if (changed) board().patchElements({ [id]: patch });

  const edited = board().elements[id];
  if (edited?.type === 'text' && !edited.content.text.trim()) {
    deleteElements([id]);
  }
}

/** Les flèches accrochées à un élément supprimé partent avec lui (et reviennent avec Annuler). */
function deleteElements(ids: string[]) {
  const removed = new Set(ids);
  for (const element of allElements()) {
    if (element.type === 'line' && attachedIds(element).some((id) => removed.has(id))) {
      ids = [...ids, element.id];
    }
  }
  board().removeElements([...new Set(ids)]);
  const selectedIds = new Set(ui().selectedIds);
  ids.forEach((id) => selectedIds.delete(id));
  ui().set({ selectedIds });
}

export function deleteSelection() {
  deleteElements([...ui().selectedIds]);
  ui().set({ contextMenu: null });
}

/**
 * Une flèche copiée avec les deux éléments qu'elle relie relie leurs copies ; sinon,
 * l'extrémité dont l'élément n'est pas copié devient libre, à sa place actuelle.
 */
function insertCopies(sources: BoardElement[], offset: Point) {
  let zIndex = topZ();
  const copiedIds = new Set(sources.map((source) => source.id));
  const prepared = sources.map((source) =>
    source.type === 'line' ? detachedCopy(source, copiedIds) : source,
  );
  const copies = sortByZ(prepared).map((source) => cloneElement(source, offset, (zIndex += 1)));
  const newIds = new Map(sortByZ(prepared).map((source, index) => [source.id, copies[index]!.id]));
  for (const copy of copies) {
    if (copy.type !== 'line') continue;
    copy.style = {
      ...copy.style,
      from: copy.style.from ? (newIds.get(copy.style.from) ?? '') : copy.style.from,
      to: copy.style.to ? (newIds.get(copy.style.to) ?? '') : copy.style.to,
    };
  }
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
  ui().select(visibleElements().map((element) => element.id));
}

export function setTagOnSelection(categoryId: string, valueId: string | null) {
  const patches: Record<string, ElementPatch> = {};
  for (const element of selectedElements()) {
    if (element.type === 'postit') patches[element.id] = { tags: { [categoryId]: valueId } };
  }
  board().patchElements(patches);
}

export function openTagPicker(x: number, y: number, focusCategoryId: string | null = null) {
  ui().set({ tagPicker: { x, y, focusCategoryId }, contextMenu: null });
}

export function toggleFilter(categoryId: string, valueId: string) {
  const current = ui().filters[categoryId] ?? [];
  const next = current.includes(valueId)
    ? current.filter((id) => id !== valueId)
    : [...current, valueId];
  ui().set({ filters: { ...ui().filters, [categoryId]: next } });
  pruneSelection();
}

export function resetFilters() {
  ui().set({ filters: {} });
}

export function tagUsageCount(valueIds: string[]): number {
  return allElements().filter(
    (element) =>
      element.type === 'postit' && Object.values(element.tags).some((id) => valueIds.includes(id)),
  ).length;
}

function forgetValues(valueIds: string[]) {
  board().purgeTags(new Set(valueIds));
  const filters = Object.fromEntries(
    Object.entries(ui().filters).map(([categoryId, ids]) => [
      categoryId,
      ids.filter((id) => !valueIds.includes(id)),
    ]),
  );
  ui().set({ filters });
}

export function deleteTagValue(valueId: string) {
  forgetValues([valueId]);
  useTagStore.getState().removeValue(valueId);
}

export function deleteTagCategory(categoryId: string) {
  const { values, removeCategory } = useTagStore.getState();
  forgetValues(valuesOf(values, categoryId).map((value) => value.id));
  const filters = { ...ui().filters };
  delete filters[categoryId];
  ui().set({ filters });
  removeCategory(categoryId);
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
  pruneSelection();
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
  const bounds = boundsOf(visibleElements().map(displayRect));
  if (bounds) ui().set({ camera: fitCamera(bounds, ui().viewport) });
  else ui().set({ camera: { x: 0, y: 0, zoom: 1 } });
}

/** À l'ouverture : à 100 %, sur la zone où l'on a travaillé en dernier. */
export function focusRecentWork() {
  const elements = visibleElements();
  const postits = elements.filter((element) => element.type === 'postit');
  const center = recentCentroid(postits.length > 0 ? postits : elements, displayRect);
  if (!center) return;
  const { viewport } = ui();
  ui().set({
    camera: { zoom: 1, x: viewport.width / 2 - center.x, y: viewport.height / 2 - center.y },
  });
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
