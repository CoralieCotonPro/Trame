import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPostit, box, center, drag, items, openNewBoard, saved, toScreen } from './helpers';

const lines = (page: Page) => page.locator('[data-type="line"]');
const HANDLE_OFFSET = 18;

/** Point d'écran d'une poignée de flèche, juste à l'extérieur du côté demandé. */
async function handle(page: Page, item: Locator, side: 'top' | 'right' | 'bottom' | 'left') {
  const rect = await box(item);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const edge = {
    top: { x: cx, y: rect.y },
    right: { x: rect.x + rect.width, y: cy },
    bottom: { x: cx, y: rect.y + rect.height },
    left: { x: rect.x, y: cy },
  }[side];
  const screen = await toScreen(page, edge);
  const shift = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[side];
  return { x: screen.x + (shift[0] as number) * HANDLE_OFFSET, y: screen.y + (shift[1] as number) * HANDLE_OFFSET };
}

async function moveTo(page: Page, item: Locator, to: { x: number; y: number }) {
  await drag(page, await center(page, item), to);
}

/** Deux post-it côte à côte : A à gauche, B à droite. */
async function twoCards(page: Page) {
  const a = await addPostit(page, 'Carte A');
  await moveTo(page, a, { x: 350, y: 350 });
  const b = await addPostit(page, 'Carte B');
  await moveTo(page, b, { x: 850, y: 350 });
  return { a, b };
}

test.describe('flèches entre les cartes', () => {
  test.beforeEach(async ({ page }) => {
    await openNewBoard(page);
  });

  test('tirer depuis une poignée relie deux cartes, et la flèche suit les déplacements', async ({
    page,
  }) => {
    const { a, b } = await twoCards(page);
    await page.mouse.click((await center(page, a)).x, (await center(page, a)).y);
    await drag(page, await handle(page, a, 'right'), await center(page, b));

    await expect(lines(page)).toHaveCount(1);
    const line = lines(page).first();
    const idA = await a.getAttribute('data-element-id');
    const idB = await b.getAttribute('data-element-id');
    await expect(line).toHaveAttribute('data-from', idA as string);
    await expect(line).toHaveAttribute('data-from-side', 'right');
    await expect(line).toHaveAttribute('data-to', idB as string);
    await expect(line).toHaveAttribute('data-to-side', 'left');
    await expect(line).toHaveAccessibleName('Flèche');

    // La flèche part du bord droit de A et arrive au bord gauche de B.
    const boxA = await box(a);
    const boxB = await box(b);
    const drawn = await box(line);
    expect(drawn.x).toBeCloseTo(boxA.x + boxA.width, 0);
    expect(drawn.x + drawn.width).toBeCloseTo(boxB.x, 0);

    // Déplacer B : la flèche s'allonge jusqu'à lui.
    await moveTo(page, b, { x: 1000, y: 500 });
    const movedB = await box(b);
    const after = await box(line);
    expect(after.x + after.width).toBeCloseTo(movedB.x, 0);
    expect(after.y + after.height).toBeCloseTo(movedB.y + movedB.height / 2, 0);
    await saved(page);

    await page.reload();
    await expect(lines(page).first()).toHaveAttribute('data-to', idB as string);
  });

  test('lâcher dans le vide laisse une flèche libre, dans le sens du geste', async ({ page }) => {
    const a = await addPostit(page, 'Départ');
    await moveTo(page, a, { x: 400, y: 300 });
    await page.mouse.click(400, 300);
    const from = await handle(page, a, 'bottom');
    await drag(page, from, { x: from.x, y: from.y + 200 });

    const line = lines(page).first();
    await expect(line).toHaveAttribute('data-from-side', 'bottom');
    await expect(line).not.toHaveAttribute('data-to', /.+/);
    // Coin de départ en haut : la flèche descend.
    await expect(line).toHaveAttribute('data-line', /^thin\|end\|t/);
  });

  test('déposer l’extrémité d’un trait sur une carte l’y accroche', async ({ page }) => {
    const a = await addPostit(page, 'Cible');
    await moveTo(page, a, { x: 700, y: 400 });
    await page.getByRole('button', { name: 'Tracer un trait' }).click();
    await drag(page, { x: 200, y: 400 }, { x: 400, y: 400 });
    await drag(page, { x: 400, y: 400 }, await center(page, a));
    await expect(lines(page).first()).toHaveAttribute('data-to', (await a.getAttribute('data-element-id')) as string);
    await expect(lines(page).first()).toHaveAttribute('data-to-side', 'left');
  });

  test('écrire sur une flèche', async ({ page }) => {
    const { a, b } = await twoCards(page);
    await page.mouse.click((await center(page, a)).x, (await center(page, a)).y);
    await drag(page, await handle(page, a, 'right'), await center(page, b));

    const line = lines(page).first();
    const middle = await center(page, line);
    await page.mouse.dblclick(middle.x, middle.y);
    await page.getByRole('textbox', { name: 'Texte de la flèche' }).fill('si oui');
    await page.keyboard.press('Escape');
    await expect(line).toHaveAccessibleName('Flèche : si oui');
    await saved(page);

    // Le texte se saisit aussi : un clic dessus sélectionne la flèche.
    await page.mouse.click(1000, 600);
    await page.mouse.click(middle.x, middle.y + 6);
    await expect(page.getByRole('button', { name: 'Écrire sur la flèche' })).toBeVisible();

    await page.reload();
    await expect(lines(page).first()).toHaveAccessibleName('Flèche : si oui');
  });

  test('supprimer une carte supprime ses flèches ; Annuler ramène les deux', async ({ page }) => {
    const { a, b } = await twoCards(page);
    await page.mouse.click((await center(page, a)).x, (await center(page, a)).y);
    await drag(page, await handle(page, a, 'right'), await center(page, b));
    await expect(lines(page)).toHaveCount(1);

    await page.mouse.click((await center(page, b)).x, (await center(page, b)).y);
    await page.keyboard.press('Delete');
    await expect(lines(page)).toHaveCount(0);
    await page.keyboard.press('ControlOrMeta+Z');
    await expect(lines(page)).toHaveCount(1);
    await expect(items(page).filter({ hasText: 'Carte B' })).toHaveCount(1);
  });
});

test('la barre de propriétés laisse la poignée du haut visible et saisissable', async ({ page }) => {
  await openNewBoard(page);
  const a = await addPostit(page, 'Haut');
  await moveTo(page, a, { x: 600, y: 450 });
  await page.mouse.click(600, 450);
  const top = await handle(page, a, 'top');
  const panel = await page.getByRole('toolbar', { name: 'Propriétés de la sélection' }).boundingBox();
  expect(panel).not.toBeNull();
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThan(top.y - 8);
  await drag(page, top, { x: top.x + 200, y: top.y - 150 });
  await expect(lines(page).first()).toHaveAttribute('data-from-side', 'top');
});

test('une flèche entre deux cartes décalées fait des coudes', async ({ page }) => {
  await openNewBoard(page);
  const { a, b } = await twoCards(page);
  await moveTo(page, b, { x: 850, y: 600 });
  await page.mouse.click((await center(page, a)).x, (await center(page, a)).y);
  await drag(page, await handle(page, a, 'right'), await center(page, b));
  const line = lines(page).first();
  await expect(line).toHaveAttribute('data-path', /.+/);
  const path = JSON.parse((await line.getAttribute('data-path')) as string) as number[][];
  expect(path.length).toBeGreaterThan(2);
  for (let i = 1; i < path.length; i += 1) {
    const [x1, y1] = path[i - 1] as number[];
    const [x2, y2] = path[i] as number[];
    expect(x1 === x2 || y1 === y2).toBe(true);
  }
  await page.getByRole('button', { name: 'Tracé droit' }).click();
  await expect(line).toHaveAttribute('data-path', /^\[\[[^\]]+\],\[[^\]]+\]\]$/);
});

test.describe('losanges', () => {
  test('ajouter un losange, y écrire, le relier et le retrouver', async ({ page }) => {
    await openNewBoard(page);
    await page.getByRole('button', { name: 'Ajouter un losange' }).click();
    await page.getByRole('textbox', { name: 'Texte du losange' }).fill('Avis favorable ?');
    await page.keyboard.press('Escape');
    const diamond = items(page).filter({ hasText: 'Losange : Avis favorable ?' });
    await expect(diamond).toHaveCount(1);
    await moveTo(page, diamond, { x: 400, y: 300 });

    await page.getByRole('button', { name: 'Couleur Vert' }).click();
    await expect(diamond).toHaveAttribute('data-color', 'green');

    const yes = await addPostit(page, 'Instruction');
    await moveTo(page, yes, { x: 400, y: 600 });
    await page.mouse.click(400, 300);
    await drag(page, await handle(page, diamond, 'bottom'), await center(page, yes));
    await expect(lines(page).first()).toHaveAttribute('data-to-side', 'top');
    await saved(page);

    await page.reload();
    await expect(items(page).filter({ hasText: 'Losange : Avis favorable ?' })).toHaveAttribute(
      'data-color',
      'green',
    );
    await expect(lines(page)).toHaveCount(1);
  });

  test('un clic dans le coin du rectangle, hors de la forme, ne sélectionne pas le losange', async ({
    page,
  }) => {
    await openNewBoard(page);
    await page.getByRole('button', { name: 'Ajouter un losange' }).click();
    await page.keyboard.press('Escape');
    const diamond = items(page).filter({ hasText: 'Losange' });
    await moveTo(page, diamond, { x: 500, y: 400 });
    await page.mouse.click(1000, 600);
    const rect = await box(diamond);
    const corner = await toScreen(page, { x: rect.x + 8, y: rect.y + 8 });
    await page.mouse.click(corner.x, corner.y);
    await expect(page.getByRole('toolbar', { name: 'Propriétés de la sélection' })).toHaveCount(0);
  });
});
