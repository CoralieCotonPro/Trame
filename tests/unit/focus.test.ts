import { createPostit } from '../../src/lib/elements';
import { recentCentroid } from '../../src/lib/geometry';
import type { BoardElement } from '../../src/types/board';

const rect = (element: BoardElement) => ({ x: element.x, y: element.y, width: 0, height: 0 });

function postitAt(x: number, y: number, minute: number): BoardElement {
  return {
    ...createPostit({ x, y }, 1),
    updatedAt: `2026-11-10T10:${String(minute).padStart(2, '0')}:00.000Z`,
  };
}

test('sans élément, pas de centre', () => {
  expect(recentCentroid([], rect)).toBeNull();
});

test('ne retient que les derniers éléments posés', () => {
  const elements = [
    postitAt(9000, 9000, 0),
    ...[1, 2, 3, 4, 5].map((minute) => postitAt(minute * 10, 0, minute)),
  ];
  expect(recentCentroid(elements, rect)).toEqual({ x: 30, y: 0 });
});

test('ignore un élément récent mais isolé au loin', () => {
  const elements = [postitAt(0, 0, 3), postitAt(100, 0, 4), postitAt(50000, 50000, 2)];
  expect(recentCentroid(elements, rect)).toEqual({ x: 50, y: 0 });
});

test('le plus récent sert de référence', () => {
  const elements = [postitAt(0, 0, 1), postitAt(8000, 0, 9)];
  expect(recentCentroid(elements, rect)).toEqual({ x: 8000, y: 0 });
});
