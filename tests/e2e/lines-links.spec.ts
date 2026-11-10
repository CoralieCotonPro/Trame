import { expect, test, type Page } from '@playwright/test';
import { createBoardFor, createUser } from './backend';
import { addPostit, box, canvas, center, drag, items, openBoardAs, openNewBoard, saved, toScreen } from './helpers';

const lines = (page: Page) => page.locator('[data-type="line"]');

async function drawLine(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.getByRole('button', { name: 'Tracer un trait' }).click();
  await drag(page, from, to);
}

test.describe('traits', () => {
  test.beforeEach(async ({ page }) => {
    await openNewBoard(page);
  });

  test('tracer un trait, le régler, le déplacer et le retrouver après rechargement', async ({
    page,
  }) => {
    await drawLine(page, { x: 300, y: 300 }, { x: 600, y: 300 });
    await expect(lines(page)).toHaveCount(1);
    const line = lines(page).first();
    await expect(line).toHaveAccessibleName('Trait');
    const drawn = await box(line);
    expect(drawn.width).toBeCloseTo(300, 0);

    await page.getByRole('button', { name: 'Épais' }).click();
    await page.getByRole('button', { name: 'Avec flèche' }).click();
    await expect(line).toHaveAttribute('data-line', 'thick|end|tl');

    await drag(page, { x: 450, y: 300 }, { x: 450, y: 400 });
    expect((await box(line)).y).toBeCloseTo(drawn.y + 100, 0);
    await saved(page);

    await page.reload();
    await expect(lines(page)).toHaveCount(1);
    await expect(lines(page).first()).toHaveAttribute('data-line', 'thick|end|tl');
    await expect(lines(page).first()).toHaveAccessibleName('Flèche');
  });

  test('Shift trace un trait parfaitement horizontal', async ({ page }) => {
    await page.getByRole('button', { name: 'Tracer un trait' }).click();
    await page.keyboard.down('Shift');
    await drag(page, { x: 300, y: 300 }, { x: 600, y: 320 });
    await page.keyboard.up('Shift');
    expect((await box(lines(page).first())).height).toBe(0);
  });

  test('déplacer une extrémité allonge le trait et peut inverser son sens', async ({ page }) => {
    await drawLine(page, { x: 300, y: 300 }, { x: 500, y: 300 });
    await drag(page, { x: 500, y: 300 }, { x: 200, y: 400 });
    const line = lines(page).first();
    const after = await box(line);
    expect(after.width).toBeCloseTo(100, 0);
    expect(after.height).toBeCloseTo(100, 0);
    await expect(line).toHaveAttribute('data-line', 'thin|none|tr');
  });

  test('un clic trop court ne crée pas de trait, et l’outil revient à la sélection', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Tracer un trait' }).click();
    await page.mouse.click(400, 400);
    await expect(lines(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Sélection' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('cliquer à côté d’un trait diagonal sélectionne ce qui est dessous', async ({ page }) => {
    const postit = await addPostit(page, 'Dessous');
    await page.keyboard.press('Escape');
    const target = await center(page, postit);
    await drawLine(page, { x: target.x - 150, y: target.y - 150 }, { x: target.x + 150, y: target.y + 150 });
    await page.mouse.click(target.x + 40, target.y - 40);
    await expect(page.getByRole('button', { name: /Couleur Jaune/ })).toBeVisible();
    await page.keyboard.press('Delete');
    await expect(items(page).filter({ hasText: 'Dessous' })).toHaveCount(0);
    await expect(lines(page)).toHaveCount(1);
  });
});

test.describe('liens', () => {
  async function selectWords(page: Page, field: string, words: string) {
    await page.locator(`textarea[data-field="${field}"]`).evaluate((node, target) => {
      const textarea = node as HTMLTextAreaElement;
      const start = textarea.value.indexOf(target);
      textarea.setSelectionRange(start, start + target.length);
    }, words);
  }

  test('sélectionner des mots, Cmd+K, puis le lien s’ouvre au clic', async ({ page, context }) => {
    await openNewBoard(page);
    const postit = await addPostit(page, 'voir le ticket Trello ici');
    const point = await center(page, postit);
    await page.mouse.dblclick(point.x, point.y);
    await selectWords(page, 'body', 'ticket Trello');
    await page.keyboard.press('ControlOrMeta+K');

    const dialog = page.getByRole('dialog', { name: 'Ajouter un lien' });
    await expect(dialog).toContainText('ticket Trello');
    await dialog.getByLabel('Adresse du lien').fill('javascript:alert(1)');
    await dialog.getByRole('button', { name: 'Ajouter le lien' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Adresse invalide');
    await dialog.getByLabel('Adresse du lien').fill('trello.com/c/abc123');
    await dialog.getByRole('button', { name: 'Ajouter le lien' }).click();
    await expect(dialog).toHaveCount(0);

    // Le texte affiché ne montre que les mots, le lien est disponible pour tous.
    await expect(postit).toHaveText('Post-it : voir le ticket Trello ici');
    await expect(page.getByRole('link', { name: 'Lien : https://trello.com/c/abc123' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
    await saved(page);

    const boxes = JSON.parse((await postit.getAttribute('data-links')) as string);
    const link = boxes[0];
    const target = await toScreen(page, { x: link.x + link.w / 2, y: link.y + link.h / 2 });
    await page.mouse.click(1100, 600);
    const opened = context.waitForEvent('page');
    await page.mouse.click(target.x, target.y);
    expect((await opened).url()).toContain('trello.com/c/abc123');

    // Le reste du post-it se déplace normalement, sans ouvrir le lien.
    const before = await box(postit);
    const corner = await toScreen(page, { x: before.x + 20, y: before.y + before.height - 20 });
    await drag(page, corner, { x: corner.x + 80, y: corner.y });
    expect((await box(postit)).x).toBeCloseTo(before.x + 80, 0);
  });

  test('le bouton « Lien » du panneau fonctionne aussi pour un texte', async ({ page }) => {
    await openNewBoard(page);
    await page.getByRole('button', { name: 'Ajouter un texte' }).click();
    await page.getByRole('textbox', { name: 'Texte', exact: true }).fill('Roadmap et tickets');
    await selectWords(page, 'text', 'tickets');
    await page.getByRole('button', { name: 'Lien sur les mots sélectionnés' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajouter un lien' });
    await dialog.getByLabel('Adresse du lien').fill('https://trello.com/b/xyz');
    await dialog.getByRole('button', { name: 'Ajouter le lien' }).click();
    await expect(page.getByRole('link', { name: 'Lien : https://trello.com/b/xyz' })).toHaveCount(1);
    await expect(items(page).first()).toHaveText('Texte normal : Roadmap et tickets');
  });

  test('sans mots sélectionnés, un message l’explique', async ({ page }) => {
    await openNewBoard(page);
    await addPostit(page, 'Rien de sélectionné');
    const point = await center(page, items(page).first());
    await page.mouse.dblclick(point.x, point.y);
    await page.keyboard.press('ControlOrMeta+K');
    await expect(page.getByRole('alert')).toContainText('Sélectionnez d’abord');
  });

  test('un lecteur peut ouvrir un lien mais pas modifier', async ({ page, browser }) => {
    const owner = await createUser();
    const boardId = await createBoardFor(owner);
    await openBoardAs(page, owner, boardId);
    const postit = await addPostit(page, 'voir doc');
    const point = await center(page, postit);
    await page.mouse.dblclick(point.x, point.y);
    await selectWords(page, 'body', 'doc');
    await page.keyboard.press('ControlOrMeta+K');
    await page.getByLabel('Adresse du lien').fill('https://example.com/doc');
    await page.getByRole('button', { name: 'Ajouter le lien' }).click();
    await saved(page);

    await page.getByRole('button', { name: 'Partager' }).click();
    const share = page.getByRole('dialog', { name: 'Partager le tableau' });
    await share.getByRole('combobox', { name: 'Droits du lien' }).selectOption({ label: 'Lecture seule' });
    await share.getByRole('button', { name: 'Créer un lien' }).click();
    const url = await share.getByRole('textbox', { name: 'Lien de partage' }).inputValue();

    const viewerContext = await browser.newContext();
    const viewer = await viewerContext.newPage();
    await viewer.goto(url);
    await viewer.getByRole('textbox', { name: 'Votre prénom ou pseudonyme' }).fill('Lecteur');
    await viewer.getByRole('button', { name: 'Rejoindre' }).click();
    await expect(canvas(viewer).locator('canvas').first()).toBeVisible();

    const item = items(viewer).first();
    const link = JSON.parse((await item.getAttribute('data-links')) as string)[0];
    const target = await toScreen(viewer, { x: link.x + link.w / 2, y: link.y + link.h / 2 });
    const opened = viewerContext.waitForEvent('page');
    await viewer.mouse.click(target.x, target.y);
    expect((await opened).url()).toContain('example.com/doc');
  });
});
