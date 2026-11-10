import type { LineCorner, Point, Rect } from '../types/board';

const OPPOSITE: Record<LineCorner, LineCorner> = { tl: 'br', br: 'tl', tr: 'bl', bl: 'tr' };

/**
 * Un trait est stocké comme son rectangle englobant plus le coin de départ : il profite
 * ainsi du déplacement, de la sélection et de la sauvegarde des autres éléments.
 */
export function lineEndpoints(rect: Rect, start: LineCorner): { start: Point; end: Point } {
  const corner = (c: LineCorner): Point => ({
    x: c[1] === 'l' ? rect.x : rect.x + rect.width,
    y: c[0] === 't' ? rect.y : rect.y + rect.height,
  });
  return { start: corner(start), end: corner(OPPOSITE[start]) };
}

/** Rectangle englobant d'un trait allant de `from` à `to`. Un trait vertical garde 1 de large. */
export function lineFromPoints(from: Point, to: Point): Rect & { start: LineCorner } {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(1, Math.abs(to.x - from.x)),
    height: Math.abs(to.y - from.y),
    start: `${from.y <= to.y ? 't' : 'b'}${from.x <= to.x ? 'l' : 'r'}` as LineCorner,
  };
}

/** Avec Shift : horizontal, vertical ou à 45°. */
export function constrainAngle(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: from.x + Math.round(Math.cos(angle) * length),
    y: from.y + Math.round(Math.sin(angle) * length),
  };
}

export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
