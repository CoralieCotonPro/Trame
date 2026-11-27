import type { LineCorner, LineElement, LineRoute, Point, Rect, Side } from '../types/board';

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

/** Extrémités d'un trait et points de son tracé, coudes compris. */
export interface LineEnds {
  start: Point;
  end: Point;
  path: Point[];
}

/** Tracé effectif : choisi explicitement, sinon coudé dès qu'une extrémité est accrochée. */
export function lineRoute(line: LineElement): LineRoute {
  if (line.style.route === 'straight' || line.style.route === 'elbow') return line.style.route;
  return attachedIds(line).length > 0 ? 'elbow' : 'straight';
}

/**
 * Extrémités réelles d'un trait : une extrémité accrochée suit son élément, une extrémité
 * libre (ou dont l'élément a disparu) reste sur le rectangle englobant, décalé de `offset`.
 */
export function resolveLineEnds(
  line: LineElement,
  lookup: RectLookup,
  offset: Point = { x: 0, y: 0 },
): LineEnds {
  const free = lineEndpoints(line, line.style.start);
  const resolve = (id: string | undefined, side: Side | '' | undefined, fallback: Point) => {
    const rect = id && isSide(side) ? lookup(id) : null;
    return rect
      ? { point: sideAnchor(rect, side as Side), side: side as Side }
      : { point: { x: fallback.x + offset.x, y: fallback.y + offset.y }, side: null };
  };
  const start = resolve(line.style.from, line.style.fromSide, free.start);
  const end = resolve(line.style.to, line.style.toSide, free.end);
  const path =
    lineRoute(line) === 'elbow'
      ? elbowRoute(start.point, start.side, end.point, end.side)
      : [start.point, end.point];
  return { start: start.point, end: end.point, path };
}

/** Longueur du premier et du dernier segment d'un tracé coudé : la flèche sort bien du côté. */
const ELBOW_STUB = 24;

/** Côté par lequel on quitte `from` pour aller vers `to`, quand rien ne l'impose. */
function sideToward(from: Point, to: Point): Side {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}

function simplify(points: Point[]): Point[] {
  const unique = points.filter(
    (point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y,
  );
  const kept: Point[] = [];
  for (const point of unique) {
    const a = kept.at(-2);
    const b = kept.at(-1);
    if (a && b && (b.x - a.x) * (point.y - a.y) === (b.y - a.y) * (point.x - a.x)) kept.pop();
    kept.push(point);
  }
  return kept;
}

/**
 * Tracé à angles droits : on sort perpendiculairement au côté de départ, on arrive
 * perpendiculairement au côté d'arrivée. Deux côtés alignés face à face donnent un trait droit.
 */
export function elbowRoute(
  start: Point,
  startSide: Side | null,
  end: Point,
  endSide: Side | null,
): Point[] {
  const ds = NORMALS[startSide ?? sideToward(start, end)];
  const de = NORMALS[endSide ?? sideToward(end, start)];
  const a = { x: start.x + ds.x * ELBOW_STUB, y: start.y + ds.y * ELBOW_STUB };
  const b = { x: end.x + de.x * ELBOW_STUB, y: end.y + de.y * ELBOW_STUB };
  const startHorizontal = ds.x !== 0;
  const endHorizontal = de.x !== 0;
  let middle: Point[];

  if (startHorizontal && endHorizontal) {
    if (ds.x === -de.x && (b.x - a.x) * ds.x >= 0) {
      const x = (a.x + b.x) / 2;
      middle = [{ x, y: a.y }, { x, y: b.y }];
    } else if (ds.x === de.x) {
      const x = ds.x > 0 ? Math.max(a.x, b.x) : Math.min(a.x, b.x);
      middle = [{ x, y: a.y }, { x, y: b.y }];
    } else {
      const y = (a.y + b.y) / 2;
      middle = [{ x: a.x, y }, { x: b.x, y }];
    }
  } else if (!startHorizontal && !endHorizontal) {
    if (ds.y === -de.y && (b.y - a.y) * ds.y >= 0) {
      const y = (a.y + b.y) / 2;
      middle = [{ x: a.x, y }, { x: b.x, y }];
    } else if (ds.y === de.y) {
      const y = ds.y > 0 ? Math.max(a.y, b.y) : Math.min(a.y, b.y);
      middle = [{ x: a.x, y }, { x: b.x, y }];
    } else {
      const x = (a.x + b.x) / 2;
      middle = [{ x, y: a.y }, { x, y: b.y }];
    }
  } else if (startHorizontal) {
    const corner = { x: b.x, y: a.y };
    const direct = (corner.x - a.x) * ds.x >= 0 && (b.y - corner.y) * -de.y >= 0;
    middle = [direct ? corner : { x: a.x, y: b.y }];
  } else {
    const corner = { x: a.x, y: b.y };
    const direct = (corner.y - a.y) * ds.y >= 0 && (b.x - corner.x) * -de.x >= 0;
    middle = [direct ? corner : { x: b.x, y: a.y }];
  }
  return simplify([start, a, ...middle, b, end]);
}

export function pathLength(path: Point[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  return total;
}

/** Point situé à mi-longueur du tracé : c'est là que s'écrit le texte. */
export function pathMidpoint(path: Point[]): Point {
  let remaining = pathLength(path) / 2;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length >= remaining && length > 0) {
      const t = remaining / length;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= length;
  }
  return path[0] ?? { x: 0, y: 0 };
}

export function distanceToPath(point: Point, path: Point[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, path[i - 1]!, path[i]!));
  }
  return best;
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
