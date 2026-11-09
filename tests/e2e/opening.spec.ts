import { expect, test } from '@playwright/test';
import { createBoardFor, createUser, ok, postitOp } from './backend';
import { camera, items, openBoardAs } from './helpers';

const WIDTH = 200;
const HEIGHT = 160;

function at(x: number, y: number) {
  const op = postitOp();
  return { ...op, element: { ...op.element, x, y, width: WIDTH, height: HEIGHT } };
}

test('à l’ouverture, 100 % et centré sur les derniers post-it posés', async ({ page }) => {
  const user = await createUser();
  const boardId = await createBoardFor(user);

  // Écrits un par un pour que l'ordre chronologique soit réel.
  for (const position of [
    [20000, 20000], // ancien et lointain : hors des cinq derniers
    [50000, 50000], // récent mais isolé
    [0, 0],
    [300, 0],
    [0, 300],
    [300, 300],
  ] as const) {
    await ok(user, boardId, [at(position[0], position[1])]);
  }

  await openBoardAs(page, user, boardId);
  await expect(items(page)).toHaveCount(6);

  const viewport = page.viewportSize();
  await expect.poll(async () => (await camera(page)).zoom).toBe(1);
  const { x, y } = await camera(page);
  // Centre attendu : milieu du groupe de quatre, soit (250, 230).
  expect(x).toBeCloseTo((viewport?.width ?? 0) / 2 - 250, 0);
  expect(y).toBeCloseTo((viewport?.height ?? 0) / 2 - 230, 0);
});
