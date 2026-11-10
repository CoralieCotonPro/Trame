import type { Handle } from './geometry';
import type { Point, Rect } from '../types/board';

/** Pas de la grille du fond, en unités du tableau. */
export const GRID_SPACING = 24;

export const snapValue = (value: number) => Math.round(value / GRID_SPACING) * GRID_SPACING;

export const snapPoint = (point: Point): Point => ({ x: snapValue(point.x), y: snapValue(point.y) });

/** Déplacement corrigé pour que `anchor`, une fois déplacé, tombe sur la grille. */
export function snapDelta(anchor: Point, delta: Point): Point {
  return {
    x: snapValue(anchor.x + delta.x) - anchor.x,
    y: snapValue(anchor.y + delta.y) - anchor.y,
  };
}

/** Position de la poignée de redimensionnement : c'est elle qui s'aimante. */
export function handlePoint(rect: Rect, handle: Handle): Point {
  return {
    x: handle.includes('w') ? rect.x : rect.x + rect.width,
    y: handle.startsWith('n') ? rect.y : rect.y + rect.height,
  };
}
