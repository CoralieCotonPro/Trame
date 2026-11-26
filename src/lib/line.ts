import type { LineCorner, LineElement, Point, Rect, Side } from '../types/board';

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

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

const NORMALS: Record<Side, Point> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

/** Milieu d'un côté : c'est là que s'accroche une flèche (et la pointe d'un losange). */
export function sideAnchor(rect: Rect, side: Side, outward = 0): Point {
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const normal = NORMALS[side];
  return {
    x: center.x + normal.x * (rect.width / 2 + outward),
    y: center.y + normal.y * (rect.height / 2 + outward),
  };
}

/** Côté dont le milieu est le plus proche du point : celui qui fait face à l'autre extrémité. */
export function nearestSide(rect: Rect, point: Point): Side {
  let best: Side = 'top';
  let bestDistance = Infinity;
  for (const side of SIDES) {
    const anchor = sideAnchor(rect, side);
    const distance = Math.hypot(anchor.x - point.x, anchor.y - point.y);
    if (distance < bestDistance) {
      best = side;
      bestDistance = distance;
    }
  }
  return best;
}

export function isSide(value: unknown): value is Side {
  return typeof value === 'string' && (SIDES as string[]).includes(value);
}

/** Rectangle d'un élément par son identifiant, ou `null` s'il n'existe pas (ou plus). */
export type RectLookup = (id: string) => Rect | null;

/** Éléments auxquels un trait est accroché. */
export function attachedIds(line: LineElement): string[] {
  return [line.style.from, line.style.to].filter((id): id is string => Boolean(id));
}

/**
 * Extrémités réelles d'un trait : une extrémité accrochée suit son élément, une extrémité
 * libre (ou dont l'élément a disparu) reste sur le rectangle englobant, décalé de `offset`.
 */
export function resolveLineEnds(
  line: LineElement,
  lookup: RectLookup,
  offset: Point = { x: 0, y: 0 },
): { start: Point; end: Point } {
  const free = lineEndpoints(line, line.style.start);
  const resolve = (id: string | undefined, side: Side | '' | undefined, fallback: Point) => {
    const rect = id && isSide(side) ? lookup(id) : null;
    return rect ? sideAnchor(rect, side as Side) : { x: fallback.x + offset.x, y: fallback.y + offset.y };
  };
  return {
    start: resolve(line.style.from, line.style.fromSide, free.start),
    end: resolve(line.style.to, line.style.toSide, free.end),
  };
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
