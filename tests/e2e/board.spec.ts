import { expect, test } from '@playwright/test';
import { addPostit, addText, box, camera, canvas, center, drag, items, toScreen } from './helpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(canvas(page).locator('canvas').first()).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

// Zone libre du tableau, loin des barres flottantes.
const EMPTY = { x: 1100, y: 620 };

test('crée un post-it et modifie son texte au double-clic', async ({ page }) => {
  const postit = await addPostit(page, 'Améliorer la compréhension');
  await expect(postit).toHaveAttribute('data-type', 'postit');

  const point = await center(page, postit);
  await page.mouse.dblclick(point.x, point.y);
  const field = page.getByRole('textbox', { name: 'Texte du post-it' });
  await expect(field).toHaveValue('Améliorer la compréhension');
  await expect(page.getByRole('textbox', { name: 'Titre du post-it' })).toHaveCount(0);
  await field.fill('Texte modifié');
  await page.keyboard.press('Escape');

  await expect(items(page).first()).toHaveText('Post-it : Texte modifié');
});

test('le texte long agrandit le post-it au lieu d’être coupé', async ({ page }) => {
  const short = await addPostit(page, 'Court');
  const initial = await box(short);
  const point = await center(page, short);
  await page.mouse.dblclick(point.x, point.y);
  await page.getByRole('textbox', { name: 'Texte du post-it' }).fill('Ligne longue '.repeat(60));
  await page.keyboard.press('Escape');
  expect((await box(items(page).first())).height).toBeGreaterThan(initial.height);
});

test('change la couleur d’un post-it', async ({ page }) => {
  const postit = await addPostit(page, 'Couleur');
  await page.getByRole('button', { name: 'Couleur Violet' }).click();
  await expect(postit).toHaveAttribute('data-color', 'violet');
});

test('déplace un post-it', async ({ page }) => {
  const postit = await addPostit(page, 'Mobile');
  const before = await box(postit);
  const from = await center(page, postit);
  await drag(page, from, { x: from.x + 150, y: from.y + 80 });
  const after = await box(postit);
  expect(after.x).toBeCloseTo(before.x + 150, 0);
  expect(after.y).toBeCloseTo(before.y + 80, 0);
});

test('redimensionne un post-it par son coin', async ({ page }) => {
  const postit = await addPostit(page, 'Taille');
  const before = await box(postit);
  const corner = await toScreen(page, {
    x: before.x + before.width,
    y: before.y + before.height,
  });
  await drag(page, corner, { x: corner.x + 90, y: corner.y + 60 });
  const after = await box(postit);
  expect(after.width).toBeCloseTo(before.width + 90, 0);
  expect(after.height).toBeCloseTo(before.height + 60, 0);
  expect(after.x).toBe(before.x);
});

test('le zoom molette garde immobile le point sous le curseur', async ({ page }) => {
  const postit = await addPostit(page, 'Repère');
  const rect = await box(postit);
  const cursor = await toScreen(page, { x: rect.x + 20, y: rect.y + 20 });

  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.wheel(0, -200);
  await expect.poll(async () => (await camera(page)).zoom).toBeGreaterThan(1);

  const after = await toScreen(page, { x: rect.x + 20, y: rect.y + 20 });
  expect(after.x).toBeCloseTo(cursor.x, 3);
  expect(after.y).toBeCloseTo(cursor.y, 3);
  // Les coordonnées stockées ne dépendent pas du zoom.
  expect(await box(postit)).toEqual(rect);
});

test("déplace le tableau avec l'outil Main, sans bouger les éléments", async ({ page }) => {
  const postit = await addPostit(page, 'Fixe');
  const rect = await box(postit);
  const before = await camera(page);
  await page.getByRole('button', { name: 'Main : déplacer le tableau' }).click();
  await drag(page, EMPTY, { x: EMPTY.x - 200, y: EMPTY.y - 100 });
  const after = await camera(page);
  expect(after.x).toBeCloseTo(before.x - 200, 0);
  expect(after.y).toBeCloseTo(before.y - 100, 0);
  expect(await box(postit)).toEqual(rect);
});

test('déplace le tableau avec Espace même au-dessus d’un élément', async ({ page }) => {
  const postit = await addPostit(page, 'Sous la main');
  const rect = await box(postit);
  const before = await camera(page);
  const from = await center(page, postit);
  await page.keyboard.down('Space');
  await drag(page, from, { x: from.x + 120, y: from.y });
  await page.keyboard.up('Space');
  expect((await camera(page)).x).toBeCloseTo(before.x + 120, 0);
  expect(await box(postit)).toEqual(rect);
});

test('crée des titres T1, T2 et T3', async ({ page }) => {
  const h1 = await addText(page, 'Roadmap Envergo', 'Titre 1');
  await expect(h1).toHaveAttribute('data-level', 'h1');
  await page.keyboard.press('Escape');
  const h2 = await addText(page, 'Parcours', 'Titre 2');
  await expect(h2).toHaveAttribute('data-level', 'h2');
  await page.keyboard.press('Escape');
  const h3 = await addText(page, 'Détail', 'Titre 3');
  await expect(h3).toHaveAttribute('data-level', 'h3');

  // Un titre plus grand occupe plus de hauteur.
  expect((await box(h1)).height).toBeGreaterThan((await box(h2)).height);
  expect((await box(h2)).height).toBeGreaterThan((await box(h3)).height);
});

test('un bloc de texte laissé vide disparaît', async ({ page }) => {
  await page.getByRole('button', { name: 'Ajouter un texte' }).click();
  await page.keyboard.press('Escape');
  await expect(items(page)).toHaveCount(0);
});

test('sélection multiple Shift + clic et déplacement groupé', async ({ page }) => {
  const a = await addPostit(page, 'Alpha');
  const startA = await center(page, a);
  await drag(page, startA, { x: 300, y: 250 });
  const b = await addPostit(page, 'Beta');
  const startB = await center(page, b);
  await drag(page, startB, { x: 700, y: 250 });

  const beforeA = await box(a);
  const beforeB = await box(b);
  await page.mouse.click(300, 250);
  await page.keyboard.down('Shift');
  await page.mouse.click(700, 250);
  await page.keyboard.up('Shift');

  await drag(page, { x: 700, y: 250 }, { x: 760, y: 310 });
  expect((await box(a)).x).toBeCloseTo(beforeA.x + 60, 0);
  expect((await box(b)).y).toBeCloseTo(beforeB.y + 60, 0);
});

test('glisser sur le vide trace une sélection, sans déplacer le tableau', async ({ page }) => {
  const a = await addPostit(page, 'Un');
  await drag(page, await center(page, a), { x: 300, y: 300 });
  const b = await addPostit(page, 'Deux');
  await drag(page, await center(page, b), { x: 600, y: 300 });
  await page.keyboard.press('Escape');
  const before = await camera(page);

  await drag(page, { x: 150, y: 150 }, { x: 800, y: 500 });
  expect(await camera(page)).toEqual(before);

  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(0);
});

test('un rectangle remplace la sélection, avec Shift il la complète', async ({ page }) => {
  const a = await addPostit(page, 'Un');
  await drag(page, await center(page, a), { x: 300, y: 300 });
  const b = await addPostit(page, 'Deux');
  await drag(page, await center(page, b), { x: 700, y: 300 });
  await page.keyboard.press('Escape');

  await drag(page, { x: 150, y: 150 }, { x: 450, y: 500 });
  await drag(page, { x: 550, y: 150 }, { x: 850, y: 500 });
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(1);
  await expect(items(page)).toHaveText('Post-it : Un');

  await page.keyboard.press('Control+Z');
  await drag(page, { x: 150, y: 150 }, { x: 450, y: 500 });
  await page.keyboard.down('Shift');
  await drag(page, { x: 550, y: 150 }, { x: 850, y: 500 });
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(0);
});

test('un clic sur le vide désélectionne', async ({ page }) => {
  await addPostit(page, 'Sélectionné');
  await expect(page.getByRole('toolbar', { name: 'Propriétés de la sélection' })).toBeVisible();
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await expect(page.getByRole('toolbar', { name: 'Propriétés de la sélection' })).toHaveCount(0);
});

test('copier, coller, dupliquer, supprimer, annuler et rétablir', async ({ page }) => {
  await addPostit(page, 'Original');
  await page.keyboard.press('Control+D');
  await expect(items(page)).toHaveCount(2);
  await page.keyboard.press('Control+C');
  await page.keyboard.press('Control+V');
  await expect(items(page)).toHaveCount(3);
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(2);
  await page.keyboard.press('Control+Z');
  await expect(items(page)).toHaveCount(3);
  await page.keyboard.press('Control+Shift+Z');
  await expect(items(page)).toHaveCount(2);
});

test('les raccourcis n’interfèrent pas avec la saisie', async ({ page }) => {
  await page.keyboard.press('n');
  await expect(items(page)).toHaveCount(1);
  const field = page.getByRole('textbox', { name: 'Texte du post-it' });
  await field.pressSequentially('nt hv');
  await field.press('Backspace');
  await expect(field).toHaveValue('nt h');
  await expect(items(page)).toHaveCount(1);
});

test('le menu contextuel permet de changer l’ordre et de supprimer', async ({ page }) => {
  const a = await addPostit(page, 'Dessous');
  const b = await addPostit(page, 'Dessus');
  expect((await box(b)).z).toBeGreaterThan((await box(a)).z);

  const point = await center(page, b);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Arrière-plan' }).click();
  expect((await box(b)).z).toBeLessThan((await box(a)).z);

  const pointA = await center(page, a);
  await page.mouse.click(pointA.x, pointA.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(items(page)).toHaveCount(1);
});

test('double-clic sur le vide : post-it créé, désactivable', async ({ page }) => {
  await page.mouse.dblclick(EMPTY.x, EMPTY.y);
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('checkbox', { name: 'Double-clic : créer un post-it' }).uncheck();
  await page.mouse.click(600, 650);
  await page.mouse.dblclick(300, 600);
  await expect(items(page)).toHaveCount(1);
});

test('boutons de zoom, retour à 100 % et ajustement', async ({ page }) => {
  await addPostit(page, 'Loin');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(1.2);
  await page.getByRole('button', { name: /revenir à 100 %/ }).click();
  await expect.poll(async () => (await camera(page)).zoom).toBe(1);

  await page.keyboard.down('Space');
  await drag(page, EMPTY, { x: 100, y: 100 });
  await page.keyboard.up('Space');
  const moved = await camera(page);
  expect(moved.x).toBeCloseTo(100 - EMPTY.x, 0);
  await page.getByRole('button', { name: 'Ajuster à tous les éléments' }).click();
  const rect = await box(items(page).first());
  const centerPoint = await toScreen(page, {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  });
  const viewport = page.viewportSize();
  expect(centerPoint.x).toBeCloseTo((viewport?.width ?? 0) / 2, 0);
  expect(centerPoint.y).toBeCloseTo((viewport?.height ?? 0) / 2, 0);
});

test('un élément est bien dessiné sur le canvas', async ({ page }) => {
  const emptyShot = await page.screenshot();
  await addPostit(page, 'Visible');
  await page.keyboard.press('Escape');
  expect(Buffer.compare(emptyShot, await page.screenshot())).not.toBe(0);
});
