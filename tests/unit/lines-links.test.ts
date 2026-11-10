import { buildBoardFile, parseBoardFile } from '../../src/lib/boardFile';
import { createLine } from '../../src/lib/elements';
import { hitTest } from '../../src/lib/geometry';
import { constrainAngle, distanceToSegment, lineEndpoints, lineFromPoints } from '../../src/lib/line';
import { displayText, insertLink, normalizeUrl, parseLinks } from '../../src/lib/richText';

describe('traits', () => {
  test('un trait garde son sens de tracé dans les quatre directions', () => {
    for (const [from, to] of [
      [{ x: 0, y: 0 }, { x: 100, y: 50 }],
      [{ x: 100, y: 50 }, { x: 0, y: 0 }],
      [{ x: 100, y: 0 }, { x: 0, y: 50 }],
      [{ x: 0, y: 50 }, { x: 100, y: 0 }],
    ] as const) {
      const { start, ...rect } = lineFromPoints(from, to);
      expect(lineEndpoints(rect, start)).toEqual({ start: from, end: to });
    }
  });

  test('un trait vertical garde une largeur minimale', () => {
    const { width, height } = lineFromPoints({ x: 10, y: 0 }, { x: 10, y: 200 });
    expect(width).toBe(1);
    expect(height).toBe(200);
  });

  test('Shift aligne à l’horizontale, à la verticale ou à 45°', () => {
    expect(constrainAngle({ x: 0, y: 0 }, { x: 100, y: 8 })).toEqual({ x: 100, y: 0 });
    expect(constrainAngle({ x: 0, y: 0 }, { x: 6, y: -90 })).toEqual({ x: 0, y: -90 });
    const diagonal = constrainAngle({ x: 0, y: 0 }, { x: 100, y: 90 });
    expect(diagonal.x).toBe(diagonal.y);
  });

  test('distance d’un point à un segment', () => {
    expect(distanceToSegment({ x: 50, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(10);
    expect(distanceToSegment({ x: 130, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toBe(30);
  });

  test('un trait se saisit près de sa ligne, pas dans tout son rectangle', () => {
    const line = createLine({ x: 0, y: 0, width: 200, height: 200 }, 'tl', 1);
    const rect = (element: { x: number; y: number; width: number; height: number }) => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    });
    expect(hitTest([line], { x: 100, y: 104 }, rect, 6)?.id).toBe(line.id);
    expect(hitTest([line], { x: 180, y: 20 }, rect, 6)).toBeNull();
  });

  test('un trait passe par l’export et l’import', () => {
    const line = createLine({ x: 5, y: 6, width: 100, height: 0 }, 'tl', 1);
    const file = buildBoardFile('T', [{ ...line, style: { ...line.style, arrow: 'end' } }], [], []);
    const result = parseBoardFile(JSON.stringify(file));
    expect(result.ok && result.file.elements[0]).toMatchObject({
      type: 'line',
      style: { arrow: 'end', start: 'tl' },
    });
    const broken = JSON.parse(JSON.stringify(file));
    broken.elements[0].style.start = 'xx';
    expect(parseBoardFile(JSON.stringify(broken)).ok).toBe(false);
  });
});

describe('liens', () => {
  test('repère les liens et donne le texte affiché', () => {
    const raw = 'voir [ticket Trello](https://trello.com/c/abc) et [doc](http://exemple.fr/a)';
    const { display, links } = parseLinks(raw);
    expect(display).toBe('voir ticket Trello et doc');
    expect(links).toEqual([
      { start: 5, end: 18, href: 'https://trello.com/c/abc' },
      { start: 22, end: 25, href: 'http://exemple.fr/a' },
    ]);
  });

  test('une adresse non web n’est jamais un lien', () => {
    expect(parseLinks('[clic](javascript:alert(1))').links).toEqual([]);
    expect(displayText('[clic](javascript:alert(1))')).toBe('[clic](javascript:alert(1))');
  });

  test('normalise les adresses saisies', () => {
    expect(normalizeUrl('trello.com/c/abc')).toBe('https://trello.com/c/abc');
    expect(normalizeUrl(' https://exemple.fr ')).toBe('https://exemple.fr/');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('pas une adresse')).toBeNull();
    expect(normalizeUrl('https://exemple.fr/a(b)')).toBe('https://exemple.fr/a%28b%29');
  });

  test('transforme la sélection en lien sans toucher au reste', () => {
    expect(insertLink('voir le ticket ici', 8, 14, 'https://t.co/x')).toBe(
      'voir le [ticket](https://t.co/x) ici',
    );
    expect(insertLink('a]b', 0, 3, 'https://t.co/x')).toBe('[a b](https://t.co/x)');
  });
});
