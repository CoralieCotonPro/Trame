import { describe, expect, it } from 'vitest';
import { GRID_SPACING, handlePoint, snapDelta, snapValue } from '../../src/lib/snap';

describe('aimantation à la grille', () => {
  it('arrondit au pas de grille le plus proche', () => {
    expect(GRID_SPACING).toBe(24);
    expect(snapValue(11)).toBe(0);
    expect(snapValue(13)).toBe(24);
    expect(snapValue(-13)).toBe(-24);
  });

  it('corrige un déplacement pour que le point d’ancrage tombe sur la grille', () => {
    expect(snapDelta({ x: 10, y: 5 }, { x: 40, y: 0 })).toEqual({ x: 38, y: -5 });
  });

  it('situe la poignée de redimensionnement', () => {
    const rect = { x: 0, y: 0, width: 100, height: 50 };
    expect(handlePoint(rect, 'se')).toEqual({ x: 100, y: 50 });
    expect(handlePoint(rect, 'nw')).toEqual({ x: 0, y: 0 });
    expect(handlePoint(rect, 'w')).toEqual({ x: 0, y: 50 });
    expect(handlePoint(rect, 'e')).toEqual({ x: 100, y: 50 });
  });
});
