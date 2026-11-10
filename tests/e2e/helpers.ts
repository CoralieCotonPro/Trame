import { expect, type Locator, type Page } from '@playwright/test';
import { createUser, magicLink, type TestUser } from './backend';

export const canvas = (page: Page) => page.getByTestId('board-canvas');
export const items = (page: Page) => page.locator('[data-element-id]');
export const status = (page: Page) => page.getByTestId('save-status');
export const saved = (page: Page) => expect(status(page)).toHaveText('Enregistré');

const BASE_URL = 'http://localhost:4173';

export async function signIn(page: Page, user: TestUser, path = '/') {
  await page.goto(await magicLink(user.email, `${BASE_URL}${path}`));
}

export async function openBoardAs(
  page: Page,
  user: TestUser,
  boardId: string,
  { expectBoard = true } = {},
) {
  await signIn(page, user, `/b/${boardId}`);
  if (expectBoard) await expect(canvas(page).locator('canvas').first()).toBeVisible();
}

/** Compte neuf et tableau neuf, créés par l'interface : aucun état partagé entre tests. */
export async function openNewBoard(page: Page) {
  await signIn(page, await createUser());
  await page.getByRole('textbox', { name: 'Nom du nouveau tableau' }).fill('Test');
  await page.getByRole('combobox', { name: 'Projet du nouveau tableau' }).selectOption('envergo');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(canvas(page).locator('canvas').first()).toBeVisible();
}

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

export async function camera(page: Page) {
  const node = canvas(page);
  return {
    x: Number(await node.getAttribute('data-camera-x')),
    y: Number(await node.getAttribute('data-camera-y')),
    zoom: Number(await node.getAttribute('data-zoom')),
  };
}

export async function box(item: Locator): Promise<ElementBox> {
  const read = async (name: string) => Number(await item.getAttribute(`data-${name}`));
  return {
    x: await read('x'),
    y: await read('y'),
    width: await read('width'),
    height: await read('height'),
    z: await read('z'),
  };
}

/** Convertit un point du tableau en coordonnées écran. */
export async function toScreen(page: Page, point: { x: number; y: number }) {
  const cam = await camera(page);
  return { x: point.x * cam.zoom + cam.x, y: point.y * cam.zoom + cam.y };
}

export async function center(page: Page, item: Locator) {
  const rect = await box(item);
  return toScreen(page, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
}

/**
 * Glisser d'un point à un autre. Par défaut, Alt est maintenu : l'aimantation à la grille est
 * suspendue et les positions restent exactes. `{ snap: true }` laisse l'aimantation agir.
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { snap = false } = {},
) {
  if (!snap) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (!snap) await page.keyboard.up('Alt');
}

export async function addPostit(page: Page, text: string) {
  const before = await items(page).count();
  await page.getByRole('button', { name: 'Ajouter un post-it' }).click();
  await page.getByRole('textbox', { name: 'Texte du post-it' }).fill(text);
  await page.keyboard.press('Escape');
  await expect(items(page)).toHaveCount(before + 1);
  return items(page).filter({ hasText: text });
}

export async function addText(page: Page, text: string, level: string) {
  await page.getByRole('button', { name: 'Ajouter un texte' }).click();
  await page.getByRole('textbox', { name: 'Texte', exact: true }).fill(text);
  await page.keyboard.press('Control+Enter');
  const item = items(page).filter({ hasText: text });
  await expect(item).toHaveCount(1);
  if (level !== 'Texte normal') {
    await page.getByRole('button', { name: level, exact: true }).click();
  }
  return item;
}
