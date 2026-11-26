import { useEffect, type RefObject } from 'react';
import { screenToBoard, zoomAt } from '../lib/camera';
import {
  elementHandles,
  hitTest,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  type Handle,
} from '../lib/geometry';
import {
  badgeAt,
  contentHeight,
  displayRect,
  lineEnds,
  lineTouches,
  linkAt,
  MIN_DIAMOND,
  MIN_POSTIT,
  MIN_TEXT_WIDTH,
} from '../lib/layout';
import { constrainAngle, lineFromPoints, nearestSide, SIDES, sideAnchor } from '../lib/line';
import { handlePoint, snapDelta, snapPoint } from '../lib/snap';
import {
  addConnector,
  addLine,
  addPostit,
  canConnect,
  moveSelection,
  openTagPicker,
  startEditing,
  visibleElements,
} from '../stores/actions';
import { endDrag, sendCursor, sendDrag } from '../services/collaboration';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardElement, LineElement, Point, Rect, Side } from '../types/board';

const DRAG_THRESHOLD = 3;
const HANDLE_HIT_RADIUS = 10;
const LINE_HIT_TOLERANCE = 6;
const MIN_LINE_LENGTH = 4;
/** Poignées de flèche : à cette distance du bord, en pixels d'écran. */
export const CONNECT_OFFSET = 18;
const CONNECT_HIT_RADIUS = 9;

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  e: 'ew-resize',
  start: 'crosshair',
  end: 'crosshair',
};

/** Les liens s'ouvrent dans un nouvel onglet, sans accès à cette page. */
function openLink(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

type Gesture =
  | { kind: 'pan'; start: Point; last: Point; moved: boolean }
  | {
      kind: 'drag';
      start: Point;
      origin: Point;
      /** Coin de l'élément saisi : c'est lui qui s'aimante à la grille. */
      anchor: Point;
      moved: boolean;
      collapseTo: string | null;
      badge: { elementId: string; categoryId: string } | null;
      link: string | null;
    }
  | { kind: 'draw'; from: Point }
  | { kind: 'connect'; source: BoardElement; side: Side; from: Point }
  | {
      kind: 'endpoint';
      element: LineElement;
      fixed: Point;
      which: 'start' | 'end';
      /** Élément accroché à l'autre extrémité : on n'y accroche pas les deux bouts. */
      other: string;
    }
  | { kind: 'resize'; element: BoardElement; rect: Rect; handle: Handle; start: Point }
  | { kind: 'marquee'; start: Point; base: Set<string>; moved: boolean; additive: boolean };

const ui = () => useUiStore.getState();
const elements = visibleElements;

/** Alt (Option sur Mac) suspend l'aimantation le temps d'un geste. */
const snapping = (event: MouseEvent) => ui().snapToGrid && !event.altKey;

function singleSelected(): BoardElement | null {
  const { selectedIds, editingId } = ui();
  if (selectedIds.size !== 1 || editingId) return null;
  const [id] = selectedIds;
  return useBoardStore.getState().elements[id as string] ?? null;
}

function handleAt(point: Point): { element: BoardElement; handle: Handle } | null {
  const element = singleSelected();
  if (!element || ui().role === 'viewer') return null;
  const radius = HANDLE_HIT_RADIUS / ui().camera.zoom;
  const ends = element.type === 'line' ? lineEnds(element) : undefined;
  for (const { handle, point: position } of elementHandles(element, displayRect(element), ends)) {
    if (Math.abs(point.x - position.x) <= radius && Math.abs(point.y - position.y) <= radius) {
      return { element, handle };
    }
  }
  return null;
}

/** Éléments dont les poignées de flèche sont affichées : le sélectionné et le survolé. */
export function connectSources(): BoardElement[] {
  const { hoverId, role, tool } = ui();
  if (role === 'viewer' || tool !== 'select') return [];
  const { elements } = useBoardStore.getState();
  const candidates = [singleSelected(), hoverId ? elements[hoverId] : undefined];
  const unique = new Map<string, BoardElement>();
  for (const element of candidates) {
    if (element && canConnect(element)) unique.set(element.id, element);
  }
  return [...unique.values()];
}

/** Position des quatre poignées de flèche d'un élément, en dehors de ses bords. */
export function connectHandles(element: BoardElement, zoom: number) {
  const rect = displayRect(element);
  return SIDES.map((side) => ({ side, point: sideAnchor(rect, side, CONNECT_OFFSET / zoom) }));
}

function connectHandleAt(point: Point): { element: BoardElement; side: Side } | null {
  const { zoom } = ui().camera;
  const radius = CONNECT_HIT_RADIUS / zoom;
  for (const element of connectSources()) {
    for (const handle of connectHandles(element, zoom)) {
      if (Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= radius) {
        return { element, side: handle.side };
      }
    }
  }
  return null;
}

/** Entre le bord et les poignées, l'élément reste survolé : on peut aller les saisir. */
function keepsHover(point: Point): boolean {
  const { hoverId, camera } = ui();
  const element = hoverId ? useBoardStore.getState().elements[hoverId] : undefined;
  if (!element) return false;
  const margin = (CONNECT_OFFSET + CONNECT_HIT_RADIUS) / camera.zoom;
  const rect = displayRect(element);
  return (
    point.x >= rect.x - margin &&
    point.x <= rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y <= rect.y + rect.height + margin
  );
}

function previewResize(element: BoardElement, rect: Rect, handle: Handle, delta: Point): Rect {
  if (element.type === 'text') {
    const next = resizeRect(rect, handle, delta, { width: MIN_TEXT_WIDTH, height: 0 });
    return { ...next, height: rect.height };
  }
  const min = { ...(element.type === 'diamond' ? MIN_DIAMOND : MIN_POSTIT) };
  const { width } = resizeRect(rect, handle, delta, min);
  // À la largeur visée, la hauteur ne descend jamais sous celle du contenu.
  min.height = Math.max(min.height, contentHeight({ ...element, width }));
  return resizeRect(rect, handle, delta, min);
}

/** Traduit souris, trackpad et stylet en gestes sur le tableau. */
export function useBoardPointer(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let gesture: Gesture | null = null;

    const localPoint = (event: MouseEvent): Point => {
      const bounds = container.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const boardPoint = (event: MouseEvent) => screenToBoard(ui().camera, localPoint(event));
    const elementAt = (point: Point) =>
      hitTest(elements(), point, displayRect, LINE_HIT_TOLERANCE / ui().camera.zoom, lineTouches);

    /** Élément sous le point auquel une flèche peut s'accrocher, et le côté qui fait face à `from`. */
    const connectTargetAt = (point: Point, from: Point, excluded: string) => {
      const candidates = elements().filter(
        (element) => canConnect(element) && element.id !== excluded,
      );
      const target = hitTest(candidates, point, displayRect);
      if (!target) return null;
      const rect = displayRect(target);
      const side = nearestSide(rect, from);
      return { id: target.id, side, point: sideAnchor(rect, side) };
    };

    const setHover = (id: string | null) => {
      if (ui().hoverId !== id) ui().set({ hoverId: id });
    };

    const onPointerDown = (event: PointerEvent) => {
      ui().set({ contextMenu: null });
      if (event.button === 2) return;
      container.setPointerCapture(event.pointerId);
      container.focus({ preventScroll: true });

      const screen = localPoint(event);
      const { tool, spaceHeld, selectedIds } = ui();
      if (event.button === 1 || tool === 'hand' || spaceHeld) {
        gesture = { kind: 'pan', start: screen, last: screen, moved: false };
        return;
      }

      const point = boardPoint(event);
      if (tool === 'line' && event.button === 0) {
        gesture = { kind: 'draw', from: snapping(event) ? snapPoint(point) : point };
        return;
      }

      const resize = handleAt(point);
      if (resize?.element.type === 'line') {
        const line = resize.element;
        const ends = lineEnds(line);
        const which = resize.handle === 'start' ? 'start' : 'end';
        gesture = {
          kind: 'endpoint',
          element: line,
          which,
          fixed: which === 'start' ? ends.end : ends.start,
          other: (which === 'start' ? line.style.to : line.style.from) ?? '',
        };
        return;
      }
      if (resize) {
        gesture = { kind: 'resize', ...resize, rect: displayRect(resize.element), start: point };
        return;
      }

      const connect = connectHandleAt(point);
      if (connect) {
        const from = sideAnchor(displayRect(connect.element), connect.side);
        gesture = { kind: 'connect', source: connect.element, side: connect.side, from };
        ui().set({ hoverId: connect.element.id, lineDraft: { from, to: from, arrow: true } });
        return;
      }

      const hit = elementAt(point);
      if (hit) {
        if (event.shiftKey) {
          const next = new Set(selectedIds);
          if (next.has(hit.id)) next.delete(hit.id);
          else next.add(hit.id);
          ui().select(next);
          if (!next.has(hit.id)) return;
        } else if (!selectedIds.has(hit.id)) {
          ui().select([hit.id]);
        }
        const link = !event.shiftKey ? linkAt(hit, point) : null;
        if (ui().role === 'viewer') {
          if (link) openLink(link.href);
          return;
        }
        const collapseTo = !event.shiftKey && selectedIds.has(hit.id) ? hit.id : null;
        const badge = !event.shiftKey && hit.type === 'postit' ? badgeAt(hit, point) : null;
        gesture = {
          kind: 'drag',
          start: screen,
          origin: point,
          anchor: { x: displayRect(hit).x, y: displayRect(hit).y },
          moved: false,
          collapseTo,
          badge: badge && { elementId: hit.id, categoryId: badge.categoryId },
          link: link?.href ?? null,
        };
        return;
      }

      // Avec Shift, le rectangle complète la sélection au lieu de la remplacer.
      const base = new Set(event.shiftKey ? selectedIds : []);
      gesture = { kind: 'marquee', start: point, base, moved: false, additive: event.shiftKey };
    };

    const updateMarquee = (start: Point, point: Point, base: Set<string>) => {
      const marquee = rectFromPoints(start, point);
      const ids = new Set(base);
      for (const element of elements()) {
        if (rectsIntersect(marquee, displayRect(element))) ids.add(element.id);
      }
      ui().set({ marquee, selectedIds: ids });
    };

    const updateHoverCursor = (point: Point) => {
      const { tool, spaceHeld } = ui();
      const selecting = tool === 'select' && !spaceHeld;
      const hit = selecting ? handleAt(point) : null;
      const connect = selecting && !hit ? connectHandleAt(point) : null;
      if (!connect) {
        const hovered = selecting ? elementAt(point) : null;
        setHover(hovered && canConnect(hovered) ? hovered.id : keepsHover(point) ? ui().hoverId : null);
      }
      if (hit) container.style.cursor = CURSORS[hit.handle];
      else if (connect) container.style.cursor = 'crosshair';
      else if (tool === 'hand' || spaceHeld) container.style.cursor = 'grab';
      else if (tool === 'line') container.style.cursor = 'crosshair';
      else {
        const element = elementAt(point);
        const clickable =
          element && ((element.type === 'postit' && badgeAt(element, point)) || linkAt(element, point));
        container.style.cursor = clickable ? 'pointer' : element ? 'move' : 'default';
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const screen = localPoint(event);
      const point = boardPoint(event);
      ui().set({ cursor: point });
      sendCursor(point);

      if (!gesture) {
        updateHoverCursor(point);
        return;
      }

      switch (gesture.kind) {
        case 'pan': {
          const moved = Math.hypot(screen.x - gesture.start.x, screen.y - gesture.start.y);
          if (!gesture.moved && moved < DRAG_THRESHOLD) return;
          gesture.moved = true;
          container.style.cursor = 'grabbing';
          const { camera } = ui();
          ui().set({
            camera: {
              ...camera,
              x: camera.x + screen.x - gesture.last.x,
              y: camera.y + screen.y - gesture.last.y,
            },
          });
          gesture.last = screen;
          break;
        }
        case 'drag': {
          const moved = Math.hypot(screen.x - gesture.start.x, screen.y - gesture.start.y);
          if (!gesture.moved && moved < DRAG_THRESHOLD) return;
          gesture.moved = true;
          const raw = { x: point.x - gesture.origin.x, y: point.y - gesture.origin.y };
          const dragDelta = snapping(event) ? snapDelta(gesture.anchor, raw) : raw;
          ui().set({ dragDelta });
          sendDrag([...ui().selectedIds], dragDelta);
          break;
        }
        case 'resize': {
          const raw = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
          const delta = snapping(event)
            ? snapDelta(handlePoint(gesture.rect, gesture.handle), raw)
            : raw;
          const rect = previewResize(gesture.element, gesture.rect, gesture.handle, delta);
          ui().set({ resizePreview: { id: gesture.element.id, rect } });
          break;
        }
        case 'marquee':
          gesture.moved = true;
          updateMarquee(gesture.start, point, gesture.base);
          break;
        case 'draw': {
          const to = event.shiftKey
            ? constrainAngle(gesture.from, point)
            : snapping(event)
              ? snapPoint(point)
              : point;
          ui().set({ lineDraft: { from: gesture.from, to } });
          break;
        }
        case 'connect': {
          const target = connectTargetAt(point, gesture.from, gesture.source.id);
          ui().set({
            connectTarget: target && { id: target.id, side: target.side },
            lineDraft: { from: gesture.from, to: target?.point ?? point, arrow: true },
          });
          break;
        }
        case 'endpoint': {
          const target = connectTargetAt(point, gesture.fixed, gesture.other);
          const moving = target
            ? target.point
            : event.shiftKey
              ? constrainAngle(gesture.fixed, point)
              : snapping(event)
                ? snapPoint(point)
                : point;
          const { start, ...rect } =
            gesture.which === 'end'
              ? lineFromPoints(gesture.fixed, moving)
              : lineFromPoints(moving, gesture.fixed);
          const id = target?.id ?? '';
          const side: Side | '' = target?.side ?? '';
          const style =
            gesture.which === 'end'
              ? { start, to: id, toSide: side }
              : { start, from: id, fromSide: side };
          ui().set({
            resizePreview: { id: gesture.element.id, rect, style },
            connectTarget: target && { id: target.id, side: target.side },
          });
          break;
        }
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const finished = gesture;
      gesture = null;
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
      if (!finished) return;

      switch (finished.kind) {
        case 'pan':
          break;
        case 'drag': {
          const delta = ui().dragDelta;
          endDrag();
          ui().set({ dragDelta: null });
          if (delta && (delta.x !== 0 || delta.y !== 0)) moveSelection(delta);
          else if (!finished.moved && finished.link) openLink(finished.link);
          else if (!finished.moved && finished.badge) {
            ui().select([finished.badge.elementId]);
            openTagPicker(event.clientX, event.clientY, finished.badge.categoryId);
          } else if (!finished.moved && finished.collapseTo) ui().select([finished.collapseTo]);
          break;
        }
        case 'resize': {
          const preview = ui().resizePreview;
          ui().set({ resizePreview: null });
          if (preview) {
            useBoardStore.getState().patchElements({
              [preview.id]: {
                x: preview.rect.x,
                y: preview.rect.y,
                width: preview.rect.width,
                height: preview.rect.height,
              },
            });
          }
          break;
        }
        case 'marquee':
          ui().set({ marquee: null });
          if (!finished.moved && !finished.additive) ui().select([]);
          break;
        case 'draw': {
          const draft = ui().lineDraft;
          ui().set({ lineDraft: null, tool: 'select' });
          const length = draft ? Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) : 0;
          if (draft && length * ui().camera.zoom >= MIN_LINE_LENGTH) addLine(draft.from, draft.to);
          break;
        }
        case 'connect': {
          const draft = ui().lineDraft;
          const target = ui().connectTarget;
          ui().set({ lineDraft: null, connectTarget: null });
          const length = draft ? Math.hypot(draft.to.x - draft.from.x, draft.to.y - draft.from.y) : 0;
          if (draft && (target || length * ui().camera.zoom >= CONNECT_OFFSET * 2)) {
            addConnector(finished.source.id, finished.side, target, draft.to);
          }
          break;
        }
        case 'endpoint': {
          const preview = ui().resizePreview;
          ui().set({ resizePreview: null, connectTarget: null });
          if (preview?.style) {
            useBoardStore.getState().patchElements({
              [preview.id]: { ...preview.rect, style: preview.style },
            });
          }
          break;
        }
      }
      updateHoverCursor(boardPoint(event));
    };

    const onPointerLeave = () => {
      if (gesture) return;
      ui().set({ cursor: null, hoverId: null });
      sendCursor(null);
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (ui().tool !== 'select' || ui().spaceHeld || ui().role === 'viewer') return;
      const point = boardPoint(event);
      const hit = elementAt(point);
      if (hit) startEditing(hit.id);
      else if (ui().doubleClickCreates) addPostit(point);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      if (ui().role === 'viewer') return;
      const hit = elementAt(boardPoint(event));
      if (!hit) return;
      if (!ui().selectedIds.has(hit.id)) ui().select([hit.id]);
      ui().set({ contextMenu: { x: event.clientX, y: event.clientY } });
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { camera } = ui();
      const isPinch = event.ctrlKey || event.metaKey;
      const isMouseWheel =
        event.deltaMode !== 0 || (event.deltaX === 0 && Math.abs(event.deltaY) >= 100);

      if (isPinch || isMouseWheel) {
        const lines = event.deltaMode === 1 ? 33 : 1;
        const speed = isPinch && !isMouseWheel ? 0.01 : 0.0015;
        const factor = Math.exp(-event.deltaY * lines * speed);
        ui().set({ camera: zoomAt(camera, localPoint(event), camera.zoom * factor) });
      } else {
        ui().set({ camera: { ...camera, x: camera.x - event.deltaX, y: camera.y - event.deltaY } });
      }
    };

    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
    container.addEventListener('pointerleave', onPointerLeave);
    container.addEventListener('dblclick', onDoubleClick);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
      container.removeEventListener('pointerleave', onPointerLeave);
      container.removeEventListener('dblclick', onDoubleClick);
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('wheel', onWheel);
    };
  }, [containerRef]);
}
