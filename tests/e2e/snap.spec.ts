import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPostit, box, center, drag, items, openNewBoard, toScreen } from './helpers';

const GRID = 24;
const onGrid = (value: number) => Math.abs(value / GRID - Math.round(value / GRID)) < 1e-6;

async function expectCornerOnGrid(item: Locator) {
  const rect = await box(item);
  expect(onGrid(rect.x), `x = ${rect.x}`).toBe(true);
  expect(onGrid(rect.y), `y = ${rect.y}`).toBe(true);
}

async function toggleSnap(page: Page, on: boolean) {
  await page.getByRole('button', { name: 'Menu principal' }).click();
  const toggle = page.getByRole('checkbox', { name: 'Aimanter à la grille' });
  await expect(toggle).toBeChecked({ checked: !on });
  await toggle.setChecked(on);
  await page.getByRole('button', { name: 'Menu principal' }).click();
}

test.beforeEach(async ({ page }) => {
  await openNewBoard(page);
});

test('activée par défaut : création, déplacement et redimensionnement s’alignent sur la grille', async ({
  page,
}) => {
  const postit = await addPostit(page, 'Aimanté');
  await expectCornerOnGrid(postit);

  const from = await center(page, postit);
  await drag(page, from, { x: from.x + 37, y: from.y + 53 }, { snap: true });
  await expectCornerOnGrid(postit);
  const moved = await box(postit);

  const corner = await toScreen(page, { x: moved.x + moved.width, y: moved.y + moved.height });
  await drag(page, corner, { x: corner.x + 61, y: corner.y + 43 }, { snap: true });
  const resized = await box(postit);
  expect(onGrid(resized.x + resized.width), `bord droit = ${resized.x + resized.width}`).toBe(true);
  expect(onGrid(resized.y + resized.height), `bord bas = ${resized.y + resized.height}`).toBe(true);
  expect(resized.x).toBe(moved.x);
});

test('un trait tracé a ses deux extrémités sur la grille', async ({ page }) => {
  await page.getByRole('button', { name: 'Tracer un trait' }).click();
  await drag(page, { x: 301, y: 307 }, { x: 593, y: 419 }, { snap: true });
  const line = items(page).first();
  await expectCornerOnGrid(line);
  const rect = await box(line);
  expect(onGrid(rect.width) && onGrid(rect.height)).toBe(true);
});

test('Alt suspend l’aimantation, et elle se désactive dans le menu', async ({ page }) => {
  const postit = await addPostit(page, 'Libre');
  const start = await box(postit);

  // Alt maintenu (comportement par défaut du helper) : déplacement exact.
  let from = await center(page, postit);
  await drag(page, from, { x: from.x + 37, y: from.y });
  expect((await box(postit)).x).toBeCloseTo(start.x + 37, 0);

  await toggleSnap(page, false);
  from = await center(page, postit);
  await drag(page, from, { x: from.x + 13, y: from.y }, { snap: true });
  expect((await box(postit)).x).toBeCloseTo(start.x + 50, 0);

  await toggleSnap(page, true);
  from = await center(page, postit);
  await drag(page, from, { x: from.x + 5, y: from.y }, { snap: true });
  await expectCornerOnGrid(postit);
});
