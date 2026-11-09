import { boardToScreen, fitCamera, MAX_ZOOM, MIN_ZOOM, screenToBoard, zoomAt } from '../../src/lib/camera';
import { boundsOf, hitTest, resizeRect } from '../../src/lib/geometry';
import { contrastRatio, INK, POSTIT_COLORS, TEXT_COLORS, TEXT_LEVELS } from '../../src/lib/palette';
import { createPostit } from '../../src/lib/elements';

describe('caméra', () => {
  const camera = { x: 120, y: -40, zoom: 1.5 };

  test('les conversions écran/tableau sont réciproques', () => {
    const point = { x: 321, y: 87 };
    const back = boardToScreen(camera, screenToBoard(camera, point));
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  test('le zoom garde immobile le point sous le curseur', () => {
    const cursor = { x: 400, y: 300 };
    const before = screenToBoard(camera, cursor);
    const after = screenToBoard(zoomAt(camera, cursor, 0.7), cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  test('le zoom reste entre 10 % et 400 %', () => {
    expect(zoomAt(camera, { x: 0, y: 0 }, 99).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(camera, { x: 0, y: 0 }, 0.001).zoom).toBe(MIN_ZOOM);
  });

  test("l'ajustement centre le contenu sans dépasser 100 %", () => {
    const viewport = { width: 1000, height: 800 };
    const fitted = fitCamera({ x: 100, y: 100, width: 200, height: 100 }, viewport);
    expect(fitted.zoom).toBe(1);
    expect(boardToScreen(fitted, { x: 200, y: 150 })).toEqual({ x: 500, y: 400 });
  });
});

describe('géométrie', () => {
  const start = { x: 100, y: 100, width: 200, height: 160 };
  const min = { width: 120, height: 80 };

  test('la poignée haut-gauche garde fixe le coin opposé', () => {
    const result = resizeRect(start, 'nw', { x: 30, y: 20 }, min);
    expect(result).toEqual({ x: 130, y: 120, width: 170, height: 140 });
  });

  test('la taille minimale est respectée sans déplacer le coin opposé', () => {
    const result = resizeRect(start, 'nw', { x: 500, y: 500 }, min);
    expect(result.width).toBe(120);
    expect(result.x + result.width).toBe(300);
    expect(result.y + result.height).toBe(260);
  });

  test("l'élément le plus haut est touché en premier", () => {
    const below = { ...createPostit({ x: 0, y: 0 }, 1) };
    const above = { ...createPostit({ x: 0, y: 0 }, 2) };
    const rect = () => ({ x: 0, y: 0, width: 100, height: 100 });
    expect(hitTest([above, below], { x: 10, y: 10 }, rect)?.id).toBe(above.id);
    expect(hitTest([above, below], { x: 500, y: 10 }, rect)).toBeNull();
  });

  test("l'emprise regroupe tous les rectangles", () => {
    expect(
      boundsOf([
        { x: 0, y: 10, width: 10, height: 10 },
        { x: 50, y: -5, width: 20, height: 5 },
      ]),
    ).toEqual({ x: 0, y: -5, width: 70, height: 25 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('palette', () => {
  test.each(POSTIT_COLORS.map((color) => [color.label, color.fill]))(
    'le texte reste lisible sur un post-it %s',
    (_label, fill) => {
      expect(contrastRatio(INK, fill)).toBeGreaterThanOrEqual(4.5);
    },
  );

  test.each(TEXT_COLORS.map((color) => [color.label, color.id]))(
    'la couleur de texte %s reste lisible sur le tableau',
    (_label, color) => {
      expect(contrastRatio(color, '#faf9f6')).toBeGreaterThanOrEqual(4.5);
    },
  );

  test('les niveaux de titre décroissent', () => {
    const { h1, h2, h3, body, small } = TEXT_LEVELS;
    expect([h1, h2, h3, body, small].map((level) => level.fontSize)).toEqual([36, 28, 22, 16, 13]);
  });
});
