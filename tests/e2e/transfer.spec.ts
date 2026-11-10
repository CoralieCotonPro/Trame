import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { addPostit, addText, box, center, drag, items, openNewBoard, saved } from './helpers';

test.beforeEach(async ({ page }) => {
  await openNewBoard(page);
});

async function menu(page: Page, label: string) {
  await page.getByRole('button', { name: 'Menu principal' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: label }).click();
  return download;
}

async function buildBoard(page: Page) {
  const postit = await addPostit(page, 'Exporté');
  await page.getByRole('button', { name: 'Couleur Rose' }).click();
  await page.getByRole('button', { name: 'Modifier les tags' }).click();
  await page.getByRole('dialog', { name: 'Tags du post-it' }).getByRole('button', { name: 'Sizing : M' }).click();
  await page.keyboard.press('Escape');
  await drag(page, await center(page, postit), { x: 400, y: 300 });
  await addText(page, 'Roadmap', 'Titre 1');
  await saved(page);
  return postit;
}

async function importFile(page: Page, content: string) {
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByLabel('Fichier JSON à importer').setInputFiles({
    name: 'tableau.json',
    mimeType: 'application/json',
    buffer: Buffer.from(content),
  });
}

test('export puis import JSON : tout est restauré et enregistré', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Nom du tableau' }).fill('Mon export');
  const postit = await buildBoard(page);
  const original = await box(postit);

  const download = await menu(page, 'Exporter en JSON');
  expect(download.suggestedFilename()).toBe('Mon-export.json');
  const content = await readFile(await download.path(), 'utf8');
  const file = JSON.parse(content);
  expect(file).toMatchObject({ format: 'trame-tableau', version: 1, board: { name: 'Mon export' } });
  expect(file.elements).toHaveLength(2);
  expect(file.categories.map((c: { name: string }) => c.name)).toEqual(['Sizing', 'Statut', 'Thématique']);

  // On abîme le tableau, puis on restaure.
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.getByRole('textbox', { name: 'Nom du tableau' }).fill('Abîmé');
  await addPostit(page, 'À remplacer');
  await saved(page);

  await importFile(page, content);
  const dialog = page.getByRole('alertdialog', { name: 'Remplacer le contenu du tableau' });
  await expect(dialog).toContainText('Les 1 éléments actuels');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(items(page).filter({ hasText: 'À remplacer' })).toHaveCount(1);

  await importFile(page, content);
  await dialog.getByRole('button', { name: 'Remplacer' }).click();
  await saved(page);

  await page.reload();
  await expect(items(page)).toHaveCount(2);
  await expect(page.getByRole('textbox', { name: 'Nom du tableau' })).toHaveValue('Mon export');
  const restored = items(page).filter({ hasText: 'Exporté' });
  await expect(restored).toHaveAttribute('data-color', 'pink');
  await expect(restored).toHaveAttribute('data-tags', 'M');
  const rect = await box(restored);
  expect([rect.x, rect.y, rect.width, rect.height]).toEqual([
    original.x,
    original.y,
    original.width,
    original.height,
  ]);
  await expect(items(page).filter({ hasText: 'Roadmap' })).toHaveAttribute('data-level', 'h1');
});

test('un fichier invalide est refusé sans rien modifier', async ({ page }) => {
  await addPostit(page, 'Intact');
  await saved(page);
  await importFile(page, '{"format":"trame-tableau","version":99}');
  await expect(page.getByRole('alert')).toContainText('version 99');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
});

test('export PNG : cadré sur les éléments, avec texte et badges dessinés', async ({ page }) => {
  await buildBoard(page);
  // Le zoom ou la sélection à l'écran ne doivent pas influencer l'image.
  await page.getByRole('button', { name: 'Zoomer', exact: true }).click();

  const download = await menu(page, 'Exporter en image PNG');
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');

  const analysis = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const count = (r: number, g: number, b: number) => {
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === r && data[i + 1] === g && data[i + 2] === b) total += 1;
      }
      return total;
    };
    return {
      width: image.width,
      height: image.height,
      background: count(246, 246, 246),
      postit: count(253, 219, 250),
      badge: count(202, 202, 251),
      selectionMark: count(0, 0, 145),
      ink: count(22, 22, 22),
    };
  }, png.toString('base64'));

  expect(analysis.width).toBeGreaterThan(400);
  expect(analysis.background).toBeGreaterThan(0);
  expect(analysis.postit).toBeGreaterThan(50_000);
  expect(analysis.badge).toBeGreaterThan(100);
  expect(analysis.ink).toBeGreaterThan(100);
  expect(analysis.selectionMark).toBe(0);
});

test('export PNG d’éléments hors écran', async ({ page }) => {
  const far = await addPostit(page, 'Lointain');
  await page.keyboard.press('Escape');
  await addPostit(page, 'Proche');
  await page.mouse.click(1100, 600);
  await saved(page);

  const rect = await box(far);
  await page.keyboard.down('Space');
  await drag(page, { x: 900, y: 600 }, { x: 100, y: 100 });
  await drag(page, { x: 900, y: 600 }, { x: 100, y: 100 });
  await page.keyboard.up('Space');

  const download = await menu(page, 'Exporter en image PNG');
  const png = await readFile(await download.path());
  // Largeur attendue : emprise des deux post-it + marges, à l'échelle 2.
  const width = png.readUInt32BE(16);
  expect(width).toBeGreaterThanOrEqual((rect.width + 80) * 2);
});

test('un tableau vide le signale au lieu d’exporter une image vide', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('button', { name: 'Exporter en image PNG' }).click();
  await expect(page.getByRole('alert')).toContainText('vide');
});
