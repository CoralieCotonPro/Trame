import { expect, test, type Locator, type Page } from '@playwright/test';
import { addPostit, box, canvas, center, drag, items, openNewBoard, toScreen } from './helpers';

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openNewBoard(page);
  await expect(canvas(page).locator('canvas').first()).toBeVisible();
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const picker = (page: Page) => page.getByRole('dialog', { name: 'Tags du post-it' });
const manager = (page: Page) => page.getByRole('dialog', { name: 'Gérer les tags' });
const filtersPanel = (page: Page) => page.getByRole('complementary', { name: 'Filtres' });

async function openPicker(page: Page) {
  await page.getByRole('button', { name: 'Modifier les tags' }).click();
  await expect(picker(page)).toBeVisible();
}

async function closePicker(page: Page) {
  await page.keyboard.press('Escape');
  await expect(picker(page)).toHaveCount(0);
}

/** Crée un post-it portant les tags donnés, posé à un endroit libre. */
async function taggedPostit(
  page: Page,
  text: string,
  tags: string[],
  position: { x: number; y: number },
): Promise<Locator> {
  const postit = await addPostit(page, text);
  await drag(page, await center(page, postit), position);
  await openPicker(page);
  for (const tag of tags) await picker(page).getByRole('button', { name: tag }).click();
  await closePicker(page);
  return postit;
}

async function openManager(page: Page) {
  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('button', { name: 'Gérer les tags' }).click();
  await expect(manager(page)).toBeVisible();
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: 'Filtres', exact: true }).click();
  await expect(filtersPanel(page)).toBeVisible();
}

test('ajoute trois tags de catégories différentes', async ({ page }) => {
  const postit = await taggedPostit(
    page,
    'Améliorer les résultats',
    ['Sizing : M', 'Statut : À rédiger', 'Thématique : Simulateur'],
    { x: 500, y: 300 },
  );
  await expect(postit).toHaveAttribute('data-tags', 'M|À rédiger|Simulateur');
  await expect(postit).toContainText('Sizing : M, Statut : À rédiger, Thématique : Simulateur');
});

test('une catégorie ne garde qu’une valeur, et un second clic la retire', async ({ page }) => {
  const postit = await addPostit(page, 'Unique');
  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Sizing : S', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Sizing : L', exact: true }).click();
  await expect(postit).toHaveAttribute('data-tags', 'L');

  await picker(page).getByRole('button', { name: 'Sizing : L', exact: true }).click();
  await expect(postit).toHaveAttribute('data-tags', '');
});

test('cliquer sur un badge permet de changer sa valeur', async ({ page }) => {
  const postit = await taggedPostit(page, 'Badge', ['Sizing : M'], { x: 500, y: 300 });
  await page.mouse.click(1100, 600);

  const rect = await box(postit);
  const badge = await toScreen(page, { x: rect.x + 16 + 8, y: rect.y + rect.height - 16 - 10 });
  await page.mouse.click(badge.x, badge.y);
  await expect(picker(page)).toBeVisible();
  await picker(page).getByRole('button', { name: 'Sizing : XL' }).click();
  await expect(postit).toHaveAttribute('data-tags', 'XL');
});

test('annuler restaure le tag précédent', async ({ page }) => {
  const postit = await taggedPostit(page, 'Annuler', ['Statut : À lancer'], { x: 500, y: 300 });
  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Statut : En prod' }).click();
  await closePicker(page);
  await page.keyboard.press('Control+Z');
  await expect(postit).toHaveAttribute('data-tags', 'À lancer');
});

test('dupliquer conserve les tags', async ({ page }) => {
  await taggedPostit(page, 'Copie', ['Sizing : L'], { x: 500, y: 300 });
  await page.keyboard.press('Control+D');
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).nth(1)).toHaveAttribute('data-tags', 'L');
});

test('les tags s’appliquent à toute une sélection multiple', async ({ page }) => {
  const a = await addPostit(page, 'Alpha');
  await drag(page, await center(page, a), { x: 300, y: 300 });
  const b = await addPostit(page, 'Bravo');
  await drag(page, await center(page, b), { x: 650, y: 300 });
  await page.keyboard.press('Control+A');
  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Thématique : Admin/data' }).click();
  await expect(a).toHaveAttribute('data-tags', 'Admin/data');
  await expect(b).toHaveAttribute('data-tags', 'Admin/data');
});

test('le menu contextuel ouvre l’édition des tags', async ({ page }) => {
  const postit = await addPostit(page, 'Menu');
  const point = await center(page, postit);
  await page.mouse.click(point.x, point.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Modifier les tags' }).click();
  await expect(picker(page)).toBeVisible();
});

test('une couleur modifiée se propage à tous les post-it concernés, à l’écran aussi', async ({
  page,
}) => {
  const a = await taggedPostit(page, 'Un', ['Sizing : M'], { x: 300, y: 300 });
  const b = await taggedPostit(page, 'Deux', ['Sizing : M'], { x: 650, y: 300 });
  const other = await taggedPostit(page, 'Trois', ['Sizing : S'], { x: 950, y: 300 });
  await page.mouse.click(1100, 600);
  const otherColor = await other.getAttribute('data-tag-colors');
  const before = await page.screenshot();

  await openManager(page);
  await manager(page).getByRole('button', { name: 'Changer la couleur de M', exact: true }).click();
  await manager(page)
    .getByRole('group', { name: 'Couleurs pour M' })
    .getByRole('button', { name: 'Couleur Rose' })
    .click();
  await manager(page).getByRole('button', { name: 'Fermer' }).click();

  await expect(a).toHaveAttribute('data-tag-colors', '#f774ef');
  await expect(b).toHaveAttribute('data-tag-colors', '#f774ef');
  await expect(other).toHaveAttribute('data-tag-colors', otherColor ?? '');
  expect(Buffer.compare(before, await page.screenshot())).not.toBe(0);
});

test('le menu principal reste cliquable au-dessus du panneau de propriétés', async ({ page }) => {
  await taggedPostit(page, 'En haut à droite', [], { x: 1050, y: 300 });
  await openManager(page);
});

test('renommer une valeur se propage aux post-it', async ({ page }) => {
  const postit = await taggedPostit(page, 'Nom', ['Sizing : M'], { x: 500, y: 300 });
  await openManager(page);
  const field = manager(page).getByRole('textbox', { name: 'Libellé de M', exact: true });
  await field.fill('Moyen');
  await field.press('Enter');
  await expect(postit).toHaveAttribute('data-tags', 'Moyen');
});

test('renommage invalide : le nom précédent est conservé', async ({ page }) => {
  await openManager(page);
  const field = manager(page).getByRole('textbox', { name: 'Libellé de M', exact: true });
  await field.fill('XL');
  await field.press('Enter');
  await expect(field).toHaveValue('M');
});

test('crée une catégorie et une valeur, utilisables aussitôt', async ({ page }) => {
  const postit = await addPostit(page, 'Nouveau');
  await openManager(page);
  await manager(page).getByRole('textbox', { name: 'Nouvelle catégorie' }).fill('Équipe');
  await manager(page).getByRole('button', { name: 'Ajouter la catégorie' }).click();
  await manager(page).getByRole('textbox', { name: 'Nouvelle valeur pour Équipe' }).fill('Design');
  await manager(page).getByRole('button', { name: 'Ajouter la valeur à Équipe' }).click();
  await manager(page).getByRole('button', { name: 'Fermer' }).click();

  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Équipe : Design' }).click();
  await expect(postit).toHaveAttribute('data-tags', 'Design');
});

test('supprimer une catégorie demande confirmation et retire ses tags', async ({ page }) => {
  const postit = await taggedPostit(page, 'Sup', ['Sizing : M', 'Statut : À lancer'], {
    x: 500,
    y: 300,
  });
  await openManager(page);
  await manager(page).getByRole('button', { name: 'Supprimer la catégorie Sizing' }).click();
  await expect(manager(page).getByRole('alert')).toContainText('retiré de 1 post-it');

  await manager(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(postit).toHaveAttribute('data-tags', 'M|À lancer');

  await manager(page).getByRole('button', { name: 'Supprimer la catégorie Sizing' }).click();
  await manager(page).getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(postit).toHaveAttribute('data-tags', 'À lancer');
  await expect(manager(page).getByRole('region', { name: 'Catégorie Sizing' })).toHaveCount(0);
});

test('l’ordre des catégories change l’ordre des badges', async ({ page }) => {
  const postit = await taggedPostit(page, 'Ordre', ['Sizing : M', 'Statut : À lancer'], {
    x: 500,
    y: 300,
  });
  await openManager(page);
  await manager(page).getByRole('button', { name: 'Monter Statut' }).click();
  await expect(postit).toHaveAttribute('data-tags', 'À lancer|M');
});

test('dans la gestion des tags, Suppr ne touche pas au tableau', async ({ page }) => {
  await addPostit(page, 'Protégé');
  await openManager(page);
  await manager(page).getByRole('button', { name: 'Monter Statut' }).focus();
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(manager(page)).toHaveCount(0);
  await expect(items(page)).toHaveCount(1);
});

test('filtre combiné : taille M ou L, et statut À rédiger', async ({ page }) => {
  await taggedPostit(page, 'M à faire', ['Sizing : M', 'Statut : À rédiger'], { x: 250, y: 200 });
  await taggedPostit(page, 'L à faire', ['Sizing : L', 'Statut : À rédiger'], { x: 550, y: 200 });
  await taggedPostit(page, 'S à faire', ['Sizing : S', 'Statut : À rédiger'], { x: 850, y: 200 });
  await taggedPostit(page, 'M terminé', ['Sizing : M', 'Statut : En prod'], { x: 250, y: 500 });
  await page.mouse.click(1150, 600);

  await openFilters(page);
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Sizing : M', exact: true }).click();
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Sizing : L', exact: true }).click();
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Statut : À rédiger' }).click();

  await expect(items(page)).toHaveCount(2);
  await expect(items(page).filter({ hasText: 'M à faire' })).toHaveCount(1);
  await expect(items(page).filter({ hasText: 'L à faire' })).toHaveCount(1);
  await expect(filtersPanel(page).getByRole('status')).toHaveText('2 post-it sur 4');

  await filtersPanel(page).getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(items(page)).toHaveCount(4);
});

test('un post-it filtré garde sa position et ne peut être ni cliqué ni supprimé', async ({
  page,
}) => {
  const hidden = await taggedPostit(page, 'Masqué', ['Sizing : S'], { x: 700, y: 300 });
  const rect = await box(hidden);
  await taggedPostit(page, 'Visible', ['Sizing : M'], { x: 400, y: 300 });
  await page.mouse.click(1150, 600);

  await openFilters(page);
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Sizing : M', exact: true }).click();
  await expect(items(page)).toHaveCount(1);

  await page.mouse.click(700, 300);
  await expect(page.getByRole('toolbar', { name: 'Propriétés de la sélection' })).toHaveCount(0);

  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(0);

  await filtersPanel(page).getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(items(page)).toHaveCount(1);
  expect(await box(items(page).first())).toEqual(rect);
});

test('un post-it créé sous un filtre reste visible', async ({ page }) => {
  await openFilters(page);
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Statut : À lancer' }).click();
  const postit = await addPostit(page, 'Créé sous filtre');
  await expect(postit).toHaveAttribute('data-tags', 'À lancer');
});

test('un libellé très long reste contenu et agrandit le post-it si besoin', async ({ page }) => {
  const postit = await addPostit(page, 'Long');
  const before = await box(postit);
  await openManager(page);
  await manager(page)
    .getByRole('textbox', { name: 'Nouvelle valeur pour Statut' })
    .fill('Un statut au libellé vraiment très long');
  await manager(page).getByRole('button', { name: 'Ajouter la valeur à Statut' }).click();
  await manager(page).getByRole('button', { name: 'Fermer' }).click();
  await openPicker(page);
  await picker(page).getByRole('button', { name: /Un statut au libellé/ }).click();
  await closePicker(page);

  const after = await box(postit);
  expect(after.width).toBe(before.width);
  expect(after.height).toBeGreaterThanOrEqual(before.height);
});

test('changer le tag d’un post-it sous filtre ne le fait pas disparaître', async ({ page }) => {
  await taggedPostit(page, 'En cours de tag', ['Statut : À lancer'], { x: 500, y: 300 });
  await openFilters(page);
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Statut : À lancer' }).click();
  await expect(items(page)).toHaveCount(1);

  await page.getByRole('button', { name: 'Modifier les tags' }).click();
  await picker(page).getByRole('button', { name: 'Statut : En dev' }).click();
  await expect(picker(page)).toBeVisible();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute('data-tags', 'En dev');

  // Une fois désélectionné, le filtre s'applique normalement.
  await closePicker(page);
  await page.mouse.click(1150, 600);
  await expect(items(page)).toHaveCount(0);
  await expect(filtersPanel(page).getByRole('status')).toHaveText('0 post-it sur 1');
});

test('un filtre actif reste signalé après la fermeture du panneau', async ({ page }) => {
  await taggedPostit(page, 'Signalé', ['Sizing : S'], { x: 500, y: 300 });
  await page.mouse.click(1150, 600);
  await openFilters(page);
  await filtersPanel(page).getByRole('checkbox', { name: 'Filtrer Sizing : M', exact: true }).click();
  await expect(items(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Fermer les filtres' }).click();

  const notice = page.getByRole('status').filter({ hasText: 'Filtre actif' });
  await expect(notice).toContainText('0 post-it affichés sur 1');
  await notice.getByRole('button', { name: 'Réinitialiser' }).click();
  await expect(items(page)).toHaveCount(1);
  await expect(notice).toHaveCount(0);
});
