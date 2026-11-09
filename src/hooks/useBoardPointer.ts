import { useEffect, type RefObject } from 'react';
import { screenToBoard, zoomAt } from '../lib/camera';
import {
  handlePosition,
  handlesFor,
  hitTest,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  type Handle,
} from '../lib/geometry';
import { contentHeight, displayRect, MIN_POSTIT, MIN_TEXT_WIDTH } from '../lib/layout';
import { addPostit, moveSelection, startEditing } from '../stores/actions';
import { useBoardStore } from '../stores/boardStore';
import { useUiStore } from '../stores/uiStore';
import type { BoardElement, Point, Rect } from '../types/board';

const DRAG_THRESHOLD = 3;
const HANDLE_HIT_RADIUS = 10;

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
  e: 'ew-resize',
};

type Gesture =
  | { kind: 'pan'; start: Point; last: Point; moved: boolean }
  | { kind: 'drag'; start: Point; origin: Point; moved: boolean; collapseTo: string | null }
  | { kind: 'resize'; element: BoardElement; rect: Rect; handle: Handle; start: Point }
  | { kind: 'marquee'; start: Point; base: Set<string>; moved: boolean; additive: boolean };

const ui = () => useUiStore.getState();
const elements = () => Object.values(useBoardStore.getState().elements);

function singleSelected(): BoardElement | null {
  const { selectedIds, editingId } = ui();
  if (selectedIds.size !== 1 || editingId) return null;
  const [id] = selectedIds;
  return useBoardStore.getState().elements[id as string] ?? null;
}

function handleAt(point: Point): { element: BoardElement; handle: Handle } | null {
  const element = singleSelected();
  if (!element) return null;
  const rect = displayRect(element);
  const radius = HANDLE_HIT_RADIUS / ui().camera.zoom;
  for (const handle of handlesFor(element.type)) {
    const position = handlePosition(rect, handle);
    if (Math.abs(point.x - position.x) <= radius && Math.abs(point.y - position.y) <= radius) {
      return { element, handle };
    }
  }
  return null;
}

function previewResize(element: BoardElement, rect: Rect, handle: Handle, delta: Point): Rect {
  if (element.type === 'text') {
    const next = resizeRect(rect, handle, delta, { width: MIN_TEXT_WIDTH, height: 0 });
    return { ...next, height: rect.height };
  }
  const min = { ...MIN_POSTIT };
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
    const elementAt = (point: Point) => hitTest(elements(), point, displayRect);

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
      const resize = handleAt(point);
      if (resize) {
        gesture = { kind: 'resize', ...resize, rect: displayRect(resize.element), start: point };
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
        const collapseTo = !event.shiftKey && selectedIds.has(hit.id) ? hit.id : null;
        gesture = { kind: 'drag', start: screen, origin: point, moved: false, collapseTo };
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
      const hit = tool === 'select' && !spaceHeld ? handleAt(point) : null;
      if (hit) container.style.cursor = CURSORS[hit.handle];
      else if (tool === 'hand' || spaceHeld) container.style.cursor = 'grab';
      else container.style.cursor = elementAt(point) ? 'move' : 'default';
    };

    const onPointerMove = (event: PointerEvent) => {
      const screen = localPoint(event);
      const point = boardPoint(event);
      ui().set({ cursor: point });

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
          ui().set({ dragDelta: { x: point.x - gesture.origin.x, y: point.y - gesture.origin.y } });
          break;
        }
        case 'resize': {
          const delta = { x: point.x - gesture.start.x, y: point.y - gesture.start.y };
          const rect = previewResize(gesture.element, gesture.rect, gesture.handle, delta);
          ui().set({ resizePreview: { id: gesture.element.id, rect } });
          break;
        }
        case 'marquee':
          gesture.moved = true;
          updateMarquee(gesture.start, point, gesture.base);
          break;
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
          ui().set({ dragDelta: null });
          if (delta && (delta.x !== 0 || delta.y !== 0)) moveSelection(delta);
          else if (!finished.moved && finished.collapseTo) ui().select([finished.collapseTo]);
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
      }
      updateHoverCursor(boardPoint(event));
    };

    const onPointerLeave = () => {
      if (!gesture) ui().set({ cursor: null });
    };

    const onDoubleClick = (event: MouseEvent) => {
      if (ui().tool !== 'select' || ui().spaceHeld) return;
      const point = boardPoint(event);
      const hit = elementAt(point);
      if (hit) startEditing(hit.id);
      else if (ui().doubleClickCreates) addPostit(point);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
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
