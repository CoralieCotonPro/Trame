import type { BoardElement, Point, Rect } from '../types/board';

export type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'w' | 'e';

export function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function boundsOf(rects: Rect[]): Rect | null {
  const [first, ...others] = rects;
  if (!first) return null;
  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;
  for (const rect of others) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Du plus bas au plus haut ; l'identifiant départage les égalités. */
export function sortByZ<T extends Pick<BoardElement, 'id' | 'zIndex'>>(elements: T[]): T[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id));
}

/** Élément le plus haut sous le point donné. */
export function hitTest(
  elements: BoardElement[],
  point: Point,
  getRect: (element: BoardElement) => Rect,
): BoardElement | null {
  const sorted = sortByZ(elements);
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const element = sorted[i] as BoardElement;
    if (containsPoint(getRect(element), point)) return element;
  }
  return null;
}

export function handlesFor(type: BoardElement['type']): Handle[] {
  return type === 'postit' ? ['nw', 'ne', 'sw', 'se'] : ['w', 'e'];
}

export function handlePosition(rect: Rect, handle: Handle): Point {
  const x = handle.includes('w') ? rect.x : rect.x + rect.width;
  if (handle === 'w' || handle === 'e') return { x, y: rect.y + rect.height / 2 };
  return { x, y: handle.startsWith('n') ? rect.y : rect.y + rect.height };
}

/** Applique un déplacement de poignée en gardant fixe le bord ou le coin opposé. */
export function resizeRect(
  start: Rect,
  handle: Handle,
  delta: Point,
  min: { width: number; height: number },
): Rect {
  let { x, y, width, height } = start;

  if (handle.includes('e')) width = Math.max(min.width, start.width + delta.x);
  if (handle.includes('w')) {
    width = Math.max(min.width, start.width - delta.x);
    x = start.x + start.width - width;
  }
  if (handle.includes('s')) height = Math.max(min.height, start.height + delta.y);
  if (handle.includes('n')) {
    height = Math.max(min.height, start.height - delta.y);
    y = start.y + start.height - height;
  }
  return { x, y, width, height };
}
