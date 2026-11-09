import type { Camera, Point, Rect } from '../types/board';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function screenToBoard(camera: Camera, point: Point): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom };
}

export function boardToScreen(camera: Camera, point: Point): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y };
}

/** Change le zoom en gardant immobile le point du tableau situé sous `anchor`. */
export function zoomAt(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom);
  const board = screenToBoard(camera, anchor);
  return { zoom, x: anchor.x - board.x * zoom, y: anchor.y - board.y * zoom };
}

/** Cadre `bounds` dans la vue, sans jamais agrandir au-delà de 100 %. */
export function fitCamera(
  bounds: Rect,
  viewport: { width: number; height: number },
  padding = 96,
): Camera {
  const zoom = clampZoom(
    Math.min(
      (viewport.width - padding * 2) / Math.max(bounds.width, 1),
      (viewport.height - padding * 2) / Math.max(bounds.height, 1),
      1,
    ),
  );
  return {
    zoom,
    x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: viewport.height / 2 - (bounds.y + bounds.height / 2) * zoom,
  };
}

export function visibleBoardRect(camera: Camera, viewport: { width: number; height: number }): Rect {
  return {
    x: -camera.x / camera.zoom,
    y: -camera.y / camera.zoom,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}
