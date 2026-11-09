import { expect, test, type Browser, type Page } from '@playwright/test';
import { createBoardFor, createUser, ok, type TestUser } from './backend';
import { addPostit, box, center, drag, items, openBoardAs, saved, status } from './helpers';

const RPC = '**/rest/v1/rpc/apply_board_ops';

async function seededBoard(user: TestUser) {
  const boardId = await createBoardFor(user);
  const category = crypto.randomUUID();
  const value = crypto.randomUUID();
  await ok(user, boardId, [
    { id: crypto.randomUUID(), kind: 'category.upsert', category: { id: category, name: 'Sizing', sort_order: 0 } },
    { id: crypto.randomUUID(), kind: 'value.upsert', value: { id: value, category_id: category, label: 'M', color: '#aab2f0', sort_order: 0 } },
  ]);
  return boardId;
}

async function secondSession(browser: Browser, user: TestUser, boardId: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await openBoardAs(page, user, boardId);
  return page;
}

test('connexion réelle par lien reçu par e-mail', async ({ page }) => {
  const email = `lien-${crypto.randomUUID()}@exemple.test`;
  await page.goto('/');
  await page.getByLabel(/adresse e-mail/).fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByRole('status')).toContainText(email);

  const mailpit = process.env.E2E_MAILPIT_URL as string;
  let link: string | undefined;
  await expect
    .poll(async () => {
      const list = await (await fetch(`${mailpit}/api/v1/search?query=to:"${email}"`)).json();
      const id = list.messages?.[0]?.ID as string | undefined;
      if (!id) return false;
      const message = await (await fetch(`${mailpit}/api/v1/message/${id}`)).json();
      link = /https?:\/\/[^\s"<>]+\/auth\/v1\/verify[^\s"<>]+/.exec(message.Text as string)?.[0];
      return Boolean(link);
    })
    .toBe(true);

  await page.goto((link as string).replaceAll('&amp;', '&'));
  await expect(page.getByRole('heading', { name: 'Mes tableaux' })).toBeVisible();
});

test('crée un tableau, le retrouve dans la liste et après rechargement', async ({ page }) => {
  const user = await createUser();
  const boardId = await seededBoard(user);
  await openBoardAs(page, user, boardId);

  const name = page.getByRole('textbox', { name: 'Nom du tableau' });
  await name.fill('Roadmap Envergo');
  const postit = await addPostit(page, 'Persistant');
  await page.getByRole('button', { name: 'Couleur Rose' }).click();
  const moved = await center(page, postit);
  await drag(page, moved, { x: moved.x + 120, y: moved.y - 40 });
  await page.getByRole('button', { name: 'Modifier les tags' }).click();
  await page.getByRole('dialog', { name: 'Tags du post-it' }).getByRole('button', { name: 'Sizing : M' }).click();
  await page.keyboard.press('Escape');
  await saved(page);
  const before = await box(postit);

  await page.reload();
  await expect(items(page).filter({ hasText: 'Persistant' })).toHaveCount(1);
  const reloaded = items(page).first();
  expect(await box(reloaded)).toEqual(before);
  await expect(reloaded).toHaveAttribute('data-color', 'pink');
  await expect(reloaded).toHaveAttribute('data-tags', 'M');
  await expect(name).toHaveValue('Roadmap Envergo');

  await page.getByRole('button', { name: 'Mes tableaux' }).click();
  await expect(page.getByRole('link', { name: /Roadmap Envergo/ })).toBeVisible();
});

test('les titres, le catalogue et une suppression sont conservés', async ({ page }) => {
  const user = await createUser();
  await openBoardAs(page, user, await seededBoard(user));

  await page.getByRole('button', { name: 'Ajouter un texte' }).click();
  await page.getByRole('textbox', { name: 'Texte', exact: true }).fill('Grand titre');
  await page.keyboard.press('Control+Enter');
  await page.getByRole('button', { name: 'Titre 1', exact: true }).click();

  await addPostit(page, 'À supprimer');
  await page.keyboard.press('Delete');

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('button', { name: 'Gérer les tags' }).click();
  const manager = page.getByRole('dialog', { name: 'Gérer les tags' });
  await manager.getByRole('button', { name: 'Changer la couleur de M', exact: true }).click();
  await manager.getByRole('button', { name: 'Couleur Rouge foncé' }).click();
  await manager.getByRole('textbox', { name: 'Nouvelle catégorie' }).fill('Équipe');
  await manager.getByRole('button', { name: 'Ajouter la catégorie' }).click();
  await manager.getByRole('button', { name: 'Fermer' }).click();
  await saved(page);

  await page.reload();
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute('data-level', 'h1');

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('button', { name: 'Gérer les tags' }).click();
  await expect(manager.getByRole('region', { name: 'Catégorie Équipe' })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Changer la couleur de M', exact: true })).toHaveCSS(
    'background-color',
    'rgb(179, 38, 30)',
  );
});

test('« Enregistré » n’apparaît qu’après la confirmation du serveur', async ({ page }) => {
  const user = await createUser();
  await openBoardAs(page, user, await seededBoard(user));

  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(RPC, async (route) => {
    await held;
    await route.continue();
  });

  await addPostit(page, 'En attente');
  await expect(status(page)).toHaveText('Enregistrement…');
  await page.waitForTimeout(500);
  await expect(status(page)).toHaveText('Enregistrement…');

  release();
  await saved(page);
});

test('coupure réseau : rien n’est perdu, même après un rechargement', async ({ page, browser }) => {
  const user = await createUser();
  const boardId = await seededBoard(user);
  await openBoardAs(page, user, boardId);

  await page.route(RPC, (route) => route.abort('internetdisconnected'));
  await addPostit(page, 'Écrit hors ligne');
  await expect(status(page)).toHaveText('Hors connexion');

  // La modification non envoyée survit au rechargement, sans être annoncée comme enregistrée.
  await page.reload();
  await expect(items(page).filter({ hasText: 'Écrit hors ligne' })).toHaveCount(1);
  await expect(status(page)).not.toHaveText('Enregistré');

  await page.unroute(RPC);
  await saved(page);

  const other = await secondSession(browser, user, boardId);
  await expect(items(other).filter({ hasText: 'Écrit hors ligne' })).toHaveCount(1);
});

test('reconnexion après une vraie coupure du navigateur', async ({ page, context, browser }) => {
  const user = await createUser();
  const boardId = await seededBoard(user);
  await openBoardAs(page, user, boardId);

  await context.setOffline(true);
  await addPostit(page, 'Pendant la coupure');
  await expect(status(page)).toHaveText('Hors connexion');
  await context.setOffline(false);
  await saved(page);

  const other = await secondSession(browser, user, boardId);
  await expect(items(other).filter({ hasText: 'Pendant la coupure' })).toHaveCount(1);
});

test('conflit réel : le second texte est conservé dans une copie', async ({ page, browser }) => {
  const user = await createUser();
  const boardId = await seededBoard(user);
  await openBoardAs(page, user, boardId);
  await addPostit(page, 'Original');
  await saved(page);

  const other = await secondSession(browser, user, boardId);
  await expect(items(other)).toHaveCount(1);

  const editIn = async (target: Page, text: string) => {
    const point = await center(target, items(target).first());
    await target.mouse.dblclick(point.x, point.y);
    await target.getByRole('textbox', { name: 'Texte du post-it' }).fill(text);
    await target.keyboard.press('Escape');
    await saved(target);
  };

  await editIn(page, 'Version A');
  await expect(items(page).first()).toHaveText('Post-it : Version A');
  await editIn(other, 'Version B');

  await expect(other.getByRole('alert')).toContainText('copie juste à côté');
  await expect(items(other).filter({ hasText: 'Version A' })).toHaveCount(1);
  await expect(items(other).filter({ hasText: 'Version B' })).toHaveCount(1);
  await saved(other);

  await page.reload();
  await expect(items(page).filter({ hasText: 'Version A' })).toHaveCount(1);
  await expect(items(page).filter({ hasText: 'Version B' })).toHaveCount(1);
});

test('déplacements simultanés d’éléments distincts depuis deux navigateurs', async ({
  page,
  browser,
}) => {
  const user = await createUser();
  const boardId = await seededBoard(user);
  await openBoardAs(page, user, boardId);
  const first = await addPostit(page, 'Premier');
  await drag(page, await center(page, first), { x: 300, y: 300 });
  const second = await addPostit(page, 'Second');
  await drag(page, await center(page, second), { x: 700, y: 300 });
  await saved(page);

  const other = await secondSession(browser, user, boardId);
  const inOther = items(other).filter({ hasText: 'Second' });
  await expect(inOther).toHaveCount(1);

  const firstStart = await box(first);
  const secondStart = await box(inOther);
  await Promise.all([
    (async () => drag(page, await center(page, first), { x: (await center(page, first)).x + 50, y: 300 }))(),
    (async () => drag(other, await center(other, inOther), { x: (await center(other, inOther)).x - 70, y: 300 }))(),
  ]);
  await Promise.all([saved(page), saved(other)]);

  await page.reload();
  await expect(items(page)).toHaveCount(2);
  expect((await box(items(page).filter({ hasText: 'Premier' }))).x).toBeCloseTo(firstStart.x + 50, 0);
  expect((await box(items(page).filter({ hasText: 'Second' }))).x).toBeCloseTo(secondStart.x - 70, 0);
});

test('annuler une suppression recrée bien l’élément sur le serveur', async ({ page }) => {
  const user = await createUser();
  await openBoardAs(page, user, await seededBoard(user));
  await addPostit(page, 'Revenant');
  await saved(page);
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(0);
  await saved(page);
  await page.keyboard.press('Control+Z');
  await expect(items(page)).toHaveCount(1);
  await saved(page);
  await page.reload();
  await expect(items(page).filter({ hasText: 'Revenant' })).toHaveCount(1);
});

test('un tableau d’un autre compte n’est pas accessible', async ({ page }) => {
  const owner = await createUser();
  const boardId = await seededBoard(owner);
  await openBoardAs(page, await createUser(), boardId, { expectBoard: false });
  await expect(page.getByText("Ce tableau n'existe pas, ou vous n'y avez pas accès.")).toBeVisible();
});
