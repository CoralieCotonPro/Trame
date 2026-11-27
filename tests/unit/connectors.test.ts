import { buildBoardFile, parseBoardFile, withFreshIds } from '../../src/lib/boardFile';
import { createDiamond, createLine, createPostit } from '../../src/lib/elements';
import { hitTest } from '../../src/lib/geometry';
import { elbowRoute, nearestSide, pathMidpoint, resolveLineEnds, sideAnchor } from '../../src/lib/line';
import { shownElements } from '../../src/lib/tags';
import { deleteSelection } from '../../src/stores/actions';
import { useBoardStore } from '../../src/stores/boardStore';
import { useUiStore } from '../../src/stores/uiStore';
import type { LineElement, Rect } from '../../src/types/board';

const card: Rect = { x: 100, y: 100, width: 200, height: 100 };

function connector(from: string, to: string): LineElement {
  const line = createLine({ x: 0, y: 0, width: 50, height: 50 }, 'tl', 5);
  return { ...line, style: { ...line.style, arrow: 'end', from, fromSide: 'right', to, toSide: 'left' } };
}

describe('accroches', () => {
  test('une flèche s’accroche au milieu d’un côté', () => {
    expect(sideAnchor(card, 'top')).toEqual({ x: 200, y: 100 });
    expect(sideAnchor(card, 'right')).toEqual({ x: 300, y: 150 });
    expect(sideAnchor(card, 'bottom')).toEqual({ x: 200, y: 200 });
    expect(sideAnchor(card, 'left')).toEqual({ x: 100, y: 150 });
    expect(sideAnchor(card, 'right', 10)).toEqual({ x: 310, y: 150 });
  });

  test('le côté d’arrivée est celui qui fait face au départ', () => {
    expect(nearestSide(card, { x: 0, y: 150 })).toBe('left');
    expect(nearestSide(card, { x: 200, y: 600 })).toBe('bottom');
    expect(nearestSide(card, { x: 900, y: 120 })).toBe('right');
  });

  test('une extrémité accrochée suit son élément, une extrémité libre reste en place', () => {
    const line = connector('a', '');
    const lookup = (id: string) => (id === 'a' ? card : null);
    expect(resolveLineEnds(line, lookup)).toMatchObject({ start: { x: 300, y: 150 }, end: { x: 50, y: 50 } });
    const moved = { ...card, x: 400 };
    expect(resolveLineEnds(line, (id) => (id === 'a' ? moved : null)).start).toEqual({ x: 600, y: 150 });
  });

  test('si l’élément accroché a disparu, l’extrémité reprend sa dernière position', () => {
    const line = connector('disparu', 'aussi');
    expect(resolveLineEnds(line, () => null)).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 50, y: 50 } });
  });

  test('un losange ne se saisit que dans sa forme', () => {
    const diamond = { ...createDiamond({ x: 0, y: 0 }, 1), width: 200, height: 100 };
    const rect = () => ({ x: 0, y: 0, width: 200, height: 100 });
    expect(hitTest([diamond], { x: 100, y: 50 }, rect)?.id).toBe(diamond.id);
    expect(hitTest([diamond], { x: 10, y: 10 }, rect)).toBeNull();
  });
});

describe('coudes', () => {
  const horizontal = (path: { x: number; y: number }[]) =>
    path.every((p, i) => i === 0 || p.x === path[i - 1]!.x || p.y === path[i - 1]!.y);

  test('deux côtés alignés face à face donnent un trait droit', () => {
    expect(elbowRoute({ x: 0, y: 0 }, 'right', { x: 200, y: 0 }, 'left')).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
  });

  test('deux côtés décalés donnent un tracé à angles droits, qui sort et arrive perpendiculairement', () => {
    const path = elbowRoute({ x: 0, y: 0 }, 'right', { x: 300, y: 200 }, 'left');
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 200 },
      { x: 300, y: 200 },
    ]);
    expect(horizontal(path)).toBe(true);
  });

  test('de la droite vers le haut : un seul coude', () => {
    expect(elbowRoute({ x: 0, y: 0 }, 'right', { x: 300, y: 200 }, 'top')).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 300, y: 200 },
    ]);
  });

  test('vers une carte située en arrière, le tracé la contourne sans revenir sur lui-même', () => {
    const path = elbowRoute({ x: 300, y: 0 }, 'right', { x: 0, y: 200 }, 'left');
    expect(horizontal(path)).toBe(true);
    expect(path[1]).toEqual({ x: 324, y: 0 });
    expect(path.at(-2)).toEqual({ x: -24, y: 200 });
  });

  test('une flèche accrochée est coudée par défaut, sauf si on choisit le tracé droit', () => {
    const line = connector('a', 'b');
    const lookup = (id: string) => (id === 'a' ? card : { x: 500, y: 300, width: 100, height: 100 });
    expect(resolveLineEnds(line, lookup).path.length).toBeGreaterThan(2);
    const straight = { ...line, style: { ...line.style, route: 'straight' as const } };
    expect(resolveLineEnds(straight, lookup).path).toHaveLength(2);
  });

  test('le texte se place à mi-longueur du tracé', () => {
    expect(pathMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual({ x: 100, y: 0 });
  });
});

describe('filtres', () => {
  test('une flèche vers un post-it masqué est masquée avec lui', () => {
    const shown = { ...createPostit({ x: 0, y: 0 }, 1), tags: { c: 'v1' } };
    const hidden = { ...createPostit({ x: 0, y: 0 }, 2), tags: { c: 'v2' } };
    const line = connector(shown.id, hidden.id);
    const visible = shownElements([shown, hidden, line], { c: ['v1'] }, new Set());
    expect(visible.map((element) => element.id)).toEqual([shown.id]);
  });
});

describe('suppression', () => {
  beforeEach(() => {
    useBoardStore.setState({ elements: {}, past: [], future: [] });
  });

  test('supprimer une carte supprime ses flèches, et Annuler les ramène', () => {
    const a = createPostit({ x: 0, y: 0 }, 1);
    const b = createPostit({ x: 400, y: 0 }, 2);
    const line = connector(a.id, b.id);
    useBoardStore.getState().addElements([a, b, line]);
    useUiStore.getState().select([a.id]);
    deleteSelection();
    expect(Object.keys(useBoardStore.getState().elements)).toEqual([b.id]);
    useBoardStore.getState().undo();
    expect(useBoardStore.getState().elements[line.id]).toBeDefined();
  });
});

describe('fichier', () => {
  test('losanges, accroches et texte des flèches passent par l’export et l’import', () => {
    const a = createPostit({ x: 0, y: 0 }, 1);
    const decision = { ...createDiamond({ x: 400, y: 0 }, 2), content: { text: 'Avis ?' } };
    const line = { ...connector(a.id, decision.id), content: { text: 'si oui' } };
    const file = buildBoardFile('T', [a, decision, line], [], []);
    const parsed = parseBoardFile(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.error);

    const fresh = withFreshIds(parsed.file);
    const [newA, newDecision, newLine] = fresh.elements;
    expect(newDecision).toMatchObject({ type: 'diamond', content: { text: 'Avis ?' } });
    expect(newLine).toMatchObject({
      type: 'line',
      content: { text: 'si oui' },
      style: { from: newA?.id, fromSide: 'right', to: newDecision?.id, toSide: 'left' },
    });
    expect(newA?.id).not.toBe(a.id);
  });

  test('une accroche vers un élément absent du fichier devient libre', () => {
    const line = connector('inconnu', 'inconnu-2');
    const parsed = parseBoardFile(JSON.stringify(buildBoardFile('T', [line], [], [])));
    expect(parsed.ok && parsed.file.elements[0]?.type === 'line' && parsed.file.elements[0].style.from)
      .toBeFalsy();
  });

  test('un côté d’accroche inconnu est refusé', () => {
    const a = createPostit({ x: 0, y: 0 }, 1);
    const file = JSON.parse(JSON.stringify(buildBoardFile('T', [a, connector(a.id, a.id)], [], [])));
    file.elements[1].style.fromSide = 'dessus';
    expect(parseBoardFile(JSON.stringify(file)).ok).toBe(false);
  });
});
