import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  admin,
  anonymous,
  apply,
  createBoardFor,
  createUser,
  ok,
  postitOp,
  type TestUser,
} from './backend';
import { addPostit, box, canvas, center, drag, items, openBoardAs, saved } from './helpers';

const newPage = async (browser: Browser) => (await browser.newContext()).newPage();
const participants = (page: Page, count: number) =>
  page.getByRole('group', { name: new RegExp(`^${count} participants? :`) });

async function board(user: TestUser) {
  const boardId = await createBoardFor(user);
  const category = crypto.randomUUID();
  const value = crypto.randomUUID();
  await ok(user, boardId, [
    { id: crypto.randomUUID(), kind: 'category.upsert', category: { id: category, name: 'Sizing', sort_order: 0 } },
    { id: crypto.randomUUID(), kind: 'value.upsert', value: { id: value, category_id: category, label: 'M', color: '#aab2f0', sort_order: 0 } },
  ]);
  return boardId;
}

/** Deux navigateurs connectés au même tableau, temps réel établi. */
async function twoSessions(page: Page, browser: Browser) {
  const user = await createUser();
  const boardId = await board(user);
  await openBoardAs(page, user, boardId);
  const other = await newPage(browser);
  await openBoardAs(other, user, boardId);
  await expect(participants(page, 2)).toBeVisible();
  await expect(participants(other, 2)).toBeVisible();
  return { user, boardId, other };
}

async function createLink(page: Page, role: 'Édition' | 'Lecture seule' = 'Édition') {
  await page.getByRole('button', { name: 'Partager' }).click();
  const dialog = page.getByRole('dialog', { name: 'Partager le tableau' });
  await dialog.getByRole('combobox', { name: 'Droits du lien' }).selectOption({ label: role });
  await dialog.getByRole('button', { name: 'Créer un lien' }).click();
  const url = await dialog.getByRole('textbox', { name: 'Lien de partage' }).inputValue();
  return { url, dialog };
}

async function joinAs(guest: Page, url: string, name: string) {
  await guest.goto(url);
  await guest.getByRole('textbox', { name: 'Votre prénom ou pseudonyme' }).fill(name);
  await guest.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(canvas(guest).locator('canvas').first()).toBeVisible();
}

test('création, texte, déplacement, couleur, tag et suppression arrivent sans recharger', async ({
  page,
  browser,
}) => {
  const { other } = await twoSessions(page, browser);

  const postit = await addPostit(page, 'En direct');
  const inOther = items(other).filter({ hasText: 'En direct' });
  await expect(inOther).toHaveCount(1);

  await page.getByRole('button', { name: 'Couleur Bleu' }).click();
  await expect(inOther).toHaveAttribute('data-color', 'blue');

  await page.getByRole('button', { name: 'Modifier les tags' }).click();
  await page.getByRole('dialog', { name: 'Tags du post-it' }).getByRole('button', { name: 'Sizing : M' }).click();
  await page.keyboard.press('Escape');
  await expect(inOther).toHaveAttribute('data-tags', 'M');

  const from = await center(page, postit);
  await drag(page, from, { x: from.x + 200, y: from.y + 60 });
  const moved = await box(postit);
  await expect.poll(async () => (await box(inOther)).x).toBeCloseTo(moved.x, 0);

  await page.keyboard.press('Delete');
  await expect(items(other)).toHaveCount(0);
});

test('la synchronisation fonctionne dans les deux sens, y compris le catalogue et le nom', async ({
  page,
  browser,
}) => {
  const { other } = await twoSessions(page, browser);

  await addPostit(other, 'Depuis B');
  await expect(items(page).filter({ hasText: 'Depuis B' })).toHaveCount(1);

  await page.getByRole('textbox', { name: 'Nom du tableau' }).fill('Nom partagé');
  await expect(other.getByRole('textbox', { name: 'Nom du tableau' })).toHaveValue('Nom partagé');

  await page.getByRole('button', { name: 'Menu principal' }).click();
  await page.getByRole('button', { name: 'Gérer les tags' }).click();
  const manager = page.getByRole('dialog', { name: 'Gérer les tags' });
  await manager.getByRole('textbox', { name: 'Libellé de M', exact: true }).fill('Moyen');
  await manager.getByRole('textbox', { name: 'Libellé de M', exact: true }).press('Enter');
  await manager.getByRole('button', { name: 'Fermer' }).click();
  await saved(page);

  await other.getByRole('button', { name: 'Modifier les tags' }).click();
  await expect(
    other.getByRole('dialog', { name: 'Tags du post-it' }).getByRole('button', { name: 'Sizing : Moyen' }),
  ).toBeVisible();
});

test('un glissement est visible pendant qu’il a lieu, sans écriture en base', async ({
  page,
  browser,
}) => {
  const { other, boardId } = await twoSessions(page, browser);
  const postit = await addPostit(page, 'Glissé');
  await saved(page);
  await expect(items(other)).toHaveCount(1);
  await page.keyboard.press('Escape');

  const before = await other.screenshot();
  const from = await center(page, postit);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 250, from.y + 100, { steps: 10 });
  await expect.poll(async () => Buffer.compare(before, await other.screenshot())).not.toBe(0);

  const { data } = await admin.from('elements').select('x').eq('board_id', boardId).single();
  expect(data?.x).toBe((await box(items(other).first())).x);
  await page.mouse.up();
  await saved(page);
  const final = await admin.from('elements').select('x').eq('board_id', boardId).single();
  expect(final.data?.x).not.toBe(data?.x);
});

test('participants, curseur, et disparition à la déconnexion', async ({ page, browser }) => {
  const { other } = await twoSessions(page, browser);
  await other.mouse.move(600, 400);
  await other.mouse.move(640, 420, { steps: 4 });
  await expect(page.getByTestId('remote-cursor')).toHaveCount(1);

  await other.close();
  await expect(participants(page, 1)).toBeVisible();
  await expect(page.getByTestId('remote-cursor')).toHaveCount(0);
});

test('les positions de curseur ne sont jamais écrites en base', async ({ page, browser }) => {
  const { other, boardId } = await twoSessions(page, browser);
  await other.mouse.move(300, 300);
  await other.mouse.move(500, 500, { steps: 10 });
  await page.waitForTimeout(300);
  const { count } = await admin
    .from('elements')
    .select('*', { count: 'exact', head: true })
    .eq('board_id', boardId);
  expect(count).toBe(0);
});

test('édition simultanée : l’autre personne est signalée, aucun texte n’est perdu', async ({
  page,
  browser,
}) => {
  const { other } = await twoSessions(page, browser);
  const postit = await addPostit(page, 'Partagé');
  await saved(page);
  await expect(items(other)).toHaveCount(1);

  const point = await center(page, postit);
  await page.mouse.dblclick(point.x, point.y);
  await expect(other.getByText(/modifie…/)).toBeVisible();

  const otherPoint = await center(other, items(other).first());
  await other.mouse.dblclick(otherPoint.x, otherPoint.y);

  await page.getByRole('textbox', { name: 'Texte du post-it' }).fill('Texte A');
  await page.keyboard.press('Escape');
  await saved(page);

  await other.getByRole('textbox', { name: 'Texte du post-it' }).fill('Texte B');
  await other.keyboard.press('Escape');

  await expect(items(page).filter({ hasText: 'Texte A' })).toHaveCount(1);
  await expect(items(page).filter({ hasText: 'Texte B' })).toHaveCount(1);
  await expect(items(other).filter({ hasText: 'Texte A' })).toHaveCount(1);
  await expect(items(other).filter({ hasText: 'Texte B' })).toHaveCount(1);
});

test('déplacer et éditer le même post-it en même temps : les deux sont gardés', async ({
  page,
  browser,
}) => {
  const { other } = await twoSessions(page, browser);
  const postit = await addPostit(page, 'Double');
  await saved(page);
  const inOther = items(other).filter({ hasText: 'Double' });
  await expect(inOther).toHaveCount(1);

  const before = await box(inOther);
  const point = await center(other, inOther);
  await other.mouse.dblclick(point.x, point.y);
  await other.getByRole('textbox', { name: 'Texte du post-it' }).fill('Double édité');

  const from = await center(page, postit);
  await drag(page, from, { x: from.x + 150, y: from.y });
  await saved(page);

  await other.keyboard.press('Escape');
  await saved(other);

  await expect(items(page).filter({ hasText: 'Double édité' })).toHaveCount(1);
  await expect.poll(async () => (await box(items(other).first())).x).toBeCloseTo(before.x + 150, 0);
});

test('annuler n’efface pas ce qu’un collègue a modifié entre-temps', async ({ page, browser }) => {
  const { other } = await twoSessions(page, browser);
  const postit = await addPostit(page, 'Avant');
  await saved(page);
  const from = await center(page, postit);
  await drag(page, from, { x: from.x + 100, y: from.y });
  await saved(page);

  const inOther = items(other).first();
  await expect.poll(async () => (await box(inOther)).x).toBeCloseTo((await box(postit)).x, 0);
  const point = await center(other, inOther);
  await other.mouse.dblclick(point.x, point.y);
  await other.getByRole('textbox', { name: 'Texte du post-it' }).fill('Texte du collègue');
  await other.keyboard.press('Escape');
  await saved(other);
  await expect(items(page).filter({ hasText: 'Texte du collègue' })).toHaveCount(1);

  await page.mouse.click(1100, 600);
  await page.keyboard.press('Control+Z');
  await saved(page);
  await expect(items(other).filter({ hasText: 'Texte du collègue' })).toHaveCount(1);
  await expect.poll(async () => (await box(items(other).first())).x).toBeCloseTo(from.x - 100, 0);
});

test('reconnexion : ce qui a été manqué pendant la coupure est rattrapé', async ({
  page,
  browser,
}) => {
  const { other } = await twoSessions(page, browser);
  const context = other.context();
  await context.setOffline(true);
  await other.evaluate(() => window.dispatchEvent(new Event('offline')));

  await addPostit(page, 'Pendant la coupure');
  await saved(page);

  await context.setOffline(false);
  await other.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(items(other).filter({ hasText: 'Pendant la coupure' })).toHaveCount(1, {
    timeout: 15000,
  });
});

test('un invité rejoint avec un simple prénom et peut modifier', async ({ page, browser }) => {
  const owner = await createUser();
  await openBoardAs(page, owner, await board(owner));
  const { url, dialog } = await createLink(page);
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  const guest = await newPage(browser);
  await joinAs(guest, url, 'Camille');
  await expect(page.getByRole('group', { name: /Camille/ })).toBeVisible();
  await expect(guest.getByRole('button', { name: 'Partager' })).toHaveCount(0);

  await addPostit(guest, 'Idée de Camille');
  await expect(items(page).filter({ hasText: 'Idée de Camille' })).toHaveCount(1);
});

test('lecture seule : voit les changements, ne peut rien modifier', async ({ page, browser }) => {
  const owner = await createUser();
  await openBoardAs(page, owner, await board(owner));
  const postit = await addPostit(page, 'À regarder');
  await saved(page);
  const { url, dialog } = await createLink(page, 'Lecture seule');
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  const viewer = await newPage(browser);
  await joinAs(viewer, url, 'Lecteur');
  await expect(viewer.getByText('Lecture seule')).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Ajouter un post-it' })).toHaveCount(0);

  const inViewer = items(viewer).first();
  const rect = await box(inViewer);
  const point = await center(viewer, inViewer);
  await viewer.mouse.dblclick(point.x, point.y);
  await expect(viewer.getByRole('textbox', { name: 'Texte du post-it' })).toHaveCount(0);
  await drag(viewer, point, { x: point.x + 200, y: point.y });
  await viewer.keyboard.press('n');
  await viewer.mouse.click(point.x, point.y);
  await viewer.keyboard.press('Delete');
  expect(await box(inViewer)).toEqual(rect);
  await expect(items(viewer)).toHaveCount(1);

  await page.getByRole('button', { name: 'Couleur Vert' }).click();
  await expect(postit).toHaveAttribute('data-color', 'green');
  await expect(inViewer).toHaveAttribute('data-color', 'green');
});

test('révoquer un lien : invité connecté exclu, lien inutilisable', async ({ page, browser }) => {
  const owner = await createUser();
  await openBoardAs(page, owner, await board(owner));
  const { url, dialog } = await createLink(page);
  await dialog.getByRole('button', { name: 'Fermer' }).click();

  const guest = await newPage(browser);
  await joinAs(guest, url, 'Exclu');

  await page.getByRole('button', { name: 'Partager' }).click();
  await dialog.getByRole('region', { name: 'Liens actifs' }).getByRole('button', { name: 'Révoquer' }).click();
  await expect(guest.getByText('Votre accès à ce tableau a été retiré.')).toBeVisible();

  const late = await newPage(browser);
  await late.goto(url);
  await late.getByRole('textbox', { name: 'Votre prénom ou pseudonyme' }).fill('Trop tard');
  await late.getByRole('button', { name: 'Rejoindre' }).click();
  await expect(late.getByRole('alert')).toContainText("n'est plus valide");
});

test('le propriétaire peut passer un participant en lecture seule, en direct', async ({
  page,
  browser,
}) => {
  const owner = await createUser();
  await openBoardAs(page, owner, await board(owner));
  const { url, dialog } = await createLink(page);
  await dialog.getByRole('button', { name: 'Fermer' }).click();
  const guest = await newPage(browser);
  await joinAs(guest, url, 'Alex');
  await expect(guest.getByRole('button', { name: 'Ajouter un post-it' })).toBeVisible();

  await page.getByRole('button', { name: 'Partager' }).click();
  await dialog.getByRole('combobox', { name: 'Droits de Alex' }).selectOption({ label: 'Lecture seule' });
  await expect(guest.getByRole('button', { name: 'Ajouter un post-it' })).toHaveCount(0);
});

test('supprimer un tableau demande confirmation, réservé au propriétaire', async ({
  page,
  browser,
}) => {
  const owner = await createUser();
  const boardId = await createBoardFor(owner, 'À jeter');
  await openBoardAs(page, owner, boardId);
  await page.getByRole('button', { name: 'Mes tableaux' }).click();

  await page.getByRole('button', { name: 'Supprimer À jeter' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('link', { name: /À jeter/ })).toBeVisible();

  await page.getByRole('button', { name: 'Supprimer À jeter' }).click();
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.getByRole('link', { name: /À jeter/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes tableaux' })).toBeVisible();
  await expect(page.getByRole('link', { name: /À jeter/ })).toHaveCount(0);

  const { count } = await admin.from('boards').select('*', { count: 'exact', head: true }).eq('id', boardId);
  expect(count).toBe(0);
  void browser;
});

// --- Contournements directs de l'API ---

async function guestClient() {
  const client = anonymous();
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw error;
  return { id: data.user?.id as string, email: '', client } as TestUser;
}

async function link(owner: TestUser, boardId: string, role = 'editor') {
  const { data, error } = await owner.client.rpc('create_share_link', {
    p_board: boardId,
    p_role: role,
    p_days: 7,
  });
  if (error) throw error;
  return data as { id: string; token: string };
}

const redeem = (user: TestUser, token: string) =>
  user.client.rpc('redeem_share_link', { p_token: token, p_display_name: 'Test' });

test('API : connaître l’identifiant d’un tableau ne donne aucun droit', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const guest = await guestClient();
  expect((await guest.client.from('boards').select('id').eq('id', boardId)).data).toEqual([]);
  expect((await apply(guest, boardId, [postitOp()])).error?.code).toBe('42501');
});

test('API : un faux jeton est refusé et le jeton n’est pas stocké en clair', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const { token, id } = await link(owner, boardId);
  const guest = await guestClient();
  expect((await redeem(guest, 'faux')).error?.code).toBe('42501');

  const { data } = await admin.from('board_share_links').select('token_hash').eq('id', id).single();
  expect(data?.token_hash).not.toBe(token);
  expect(data?.token_hash).toHaveLength(64);

  const leak = await owner.client.from('board_share_links').select('token_hash').eq('id', id);
  expect(leak.error).not.toBeNull();
});

test('API : un invité en lecture seule ne peut pas écrire, même directement', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const elementId = crypto.randomUUID();
  await ok(owner, boardId, [postitOp(elementId)]);
  const { token } = await link(owner, boardId, 'viewer');
  const guest = await guestClient();
  expect((await redeem(guest, token)).error).toBeNull();

  expect((await guest.client.from('elements').select('id').eq('board_id', boardId)).data).toHaveLength(1);
  expect((await apply(guest, boardId, [postitOp()])).error?.code).toBe('42501');
  await guest.client.from('elements').update({ x: 500 }).eq('id', elementId);
  await guest.client.from('elements').delete().eq('id', elementId);
  await guest.client.from('boards').update({ name: 'Piraté' }).eq('id', boardId);

  const { data } = await admin.from('elements').select('x').eq('id', elementId).single();
  expect(data?.x).toBe(0);
  const name = await admin.from('boards').select('name').eq('id', boardId).single();
  expect(name.data?.name).toBe('Test');
});

test('API : un invité ne peut pas gérer le tableau ni se promouvoir', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const { token, id } = await link(owner, boardId, 'viewer');
  const guest = await guestClient();
  await redeem(guest, token);

  expect((await guest.client.rpc('create_share_link', { p_board: boardId, p_role: 'editor', p_days: 7 })).error?.code).toBe('42501');
  expect((await guest.client.rpc('revoke_share_link', { p_link: id })).error?.code).toBe('42501');
  expect((await guest.client.rpc('set_member_role', { p_board: boardId, p_user: guest.id, p_role: 'editor' })).error?.code).toBe('42501');
  expect((await guest.client.from('board_permissions').update({ role: 'owner' }).eq('user_id', guest.id)).error).not.toBeNull();
  await guest.client.from('boards').delete().eq('id', boardId);
  const { count } = await admin.from('boards').select('*', { count: 'exact', head: true }).eq('id', boardId);
  expect(count).toBe(1);
});

test('API : un lien de lecture ne rétrograde pas et ne promeut personne', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const viewerLink = await link(owner, boardId, 'viewer');
  await redeem(owner, viewerLink.token);
  const { data } = await admin
    .from('board_permissions')
    .select('role')
    .eq('board_id', boardId)
    .eq('user_id', owner.id)
    .single();
  expect(data?.role).toBe('owner');
});

test('API : un invité anonyme ne peut pas créer de tableau', async () => {
  const guest = await guestClient();
  const { error } = await guest.client.from('boards').insert({ name: 'Non', owner_id: guest.id });
  expect(error).not.toBeNull();
});

test('API : lien expiré ou révoqué refusé ; révoquer coupe les écritures', async () => {
  const owner = await createUser();
  const boardId = await board(owner);

  const expired = await link(owner, boardId);
  await admin.from('board_share_links').update({ expires_at: '2020-01-01' }).eq('id', expired.id);
  expect((await redeem(await guestClient(), expired.token)).error?.code).toBe('42501');

  const active = await link(owner, boardId);
  const guest = await guestClient();
  await redeem(guest, active.token);
  expect((await apply(guest, boardId, [postitOp()])).error).toBeNull();

  expect((await owner.client.rpc('revoke_share_link', { p_link: active.id })).error).toBeNull();
  expect((await apply(guest, boardId, [postitOp()])).error?.code).toBe('42501');
  expect((await guest.client.from('elements').select('id').eq('board_id', boardId)).data).toEqual([]);
});

async function joinStatus(user: TestUser, topic: string): Promise<string> {
  await user.client.realtime.setAuth();
  return new Promise((resolve) => {
    const channel = user.client.channel(topic, { config: { private: true } });
    channel.subscribe((status) => {
      if (status !== 'CLOSED') {
        resolve(status);
        void user.client.removeChannel(channel);
      }
    });
  });
}

async function topic(boardId: string) {
  const { data } = await admin.from('boards').select('realtime_key').eq('id', boardId).single();
  return `board:${boardId}:${data?.realtime_key as string}`;
}

test('API : un inconnu ne peut pas s’abonner, même en connaissant la clé du canal', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const stranger = await createUser();
  const name = await topic(boardId);
  expect(await joinStatus(stranger, name)).toBe('CHANNEL_ERROR');
  expect(await joinStatus(stranger, `${name}:presence`)).toBe('CHANNEL_ERROR');
  expect(await joinStatus(owner, name)).toBe('SUBSCRIBED');
});

test('API : une connexion ouverte avant la révocation ne reçoit plus rien', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const created = await link(owner, boardId);
  const guest = await guestClient();
  await redeem(guest, created.token);
  await guest.client.realtime.setAuth();

  const oldTopic = await topic(boardId);
  let received = 0;
  const channel = guest.client
    .channel(oldTopic, { config: { private: true } })
    .on('broadcast', { event: 'db' }, () => (received += 1));
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve();
    });
  });
  await ok(owner, boardId, [postitOp()]);
  await expect.poll(() => received).toBe(1);

  await owner.client.rpc('revoke_share_link', { p_link: created.id });
  await ok(owner, boardId, [postitOp()]);
  await new Promise((resolve) => setTimeout(resolve, 2000));
  expect(received).toBe(1);

  expect(await topic(boardId)).not.toBe(oldTopic);
  await guest.client.removeChannel(channel);
  expect(await joinStatus(guest, oldTopic)).toBe('CHANNEL_ERROR');
  expect(await joinStatus(guest, await topic(boardId))).toBe('CHANNEL_ERROR');
});

test('API : un invité anonyme membre peut s’abonner', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const { token } = await link(owner, boardId);
  const guest = await guestClient();
  await redeem(guest, token);
  expect(await joinStatus(guest, await topic(boardId))).toBe('SUBSCRIBED');
});

test('API : un lecteur ne peut pas émettre de faux glissement', async () => {
  const owner = await createUser();
  const boardId = await board(owner);
  const { token } = await link(owner, boardId, 'viewer');
  const viewer = await guestClient();
  await redeem(viewer, token);

  await owner.client.realtime.setAuth();
  await viewer.client.realtime.setAuth();
  let received = 0;
  const name = await topic(boardId);
  const subscribed = (client: TestUser['client'], onDrag?: () => void) =>
    new Promise<ReturnType<TestUser['client']['channel']>>((resolve) => {
      const channel = client.channel(name, { config: { private: true } });
      if (onDrag) channel.on('broadcast', { event: 'drag' }, onDrag);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve(channel);
      });
    });
  await subscribed(owner.client, () => (received += 1));
  const sender = await subscribed(viewer.client);

  await sender.send({ type: 'broadcast', event: 'drag', payload: { c: 'x', ids: [], x: 1, y: 1 } });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(received).toBe(0);
});

test('10 participants qui bougent en même temps restent sous la limite de messages', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const user = await createUser();
  const boardId = await board(user);
  const counts: number[] = [];
  const pages: Page[] = [];
  // L'une après l'autre : un nouveau lien de connexion invalide le précédent.
  for (let index = 0; index < 10; index += 1) {
    const page = await newPage(browser);
    counts[index] = 0;
    page.on('websocket', (socket) => {
      socket.on('framesent', ({ payload }) => {
        if (String(payload).includes('cursor')) counts[index] = (counts[index] ?? 0) + 1;
      });
    });
    await openBoardAs(page, user, boardId);
    pages.push(page);
  }
  await Promise.all(pages.map((page) => expect(participants(page, 10)).toBeVisible()));

  counts.fill(0);
  const started = Date.now();
  const SECONDS = 6;
  await Promise.all(
    pages.map(async (page) => {
      for (let step = 0; Date.now() - started < SECONDS * 1000; step += 1) {
        await page.mouse.move(300 + (step % 40) * 15, 300 + (step % 20) * 10);
        await page.waitForTimeout(30);
      }
    }),
  );

  const sent = counts.reduce((total, count) => total + count, 0);
  const receivedPerSecond = (sent * 9) / SECONDS;
  console.log(`Curseurs : ${sent} envois en ${SECONDS} s, soit ${Math.round(receivedPerSecond)} messages reçus/s`);
  expect(sent).toBeGreaterThan(0);
  expect(receivedPerSecond).toBeLessThanOrEqual(100);
});

test('écrire plusieurs post-it d’affilée ne coupe pas la présence', async ({ page, browser }) => {
  const { other } = await twoSessions(page, browser);

  // Au-delà de 5 annonces de présence en 30 s, Supabase fermerait le canal.
  for (let index = 0; index < 8; index += 1) {
    await addPostit(page, `Rafale ${index}`);
  }
  await saved(page);
  await page.waitForTimeout(1500);

  await expect(participants(other, 2)).toBeVisible();
  await expect(participants(page, 2)).toBeVisible();

  await page.mouse.move(600, 600);
  await page.mouse.move(640, 640, { steps: 4 });
  await expect(other.getByTestId('remote-cursor')).toHaveCount(1);

  const point = await center(page, items(page).filter({ hasText: 'Rafale 7' }));
  await page.mouse.dblclick(point.x, point.y);
  await expect(other.getByText(/modifie…/)).toBeVisible();

});

test('un participant qui arrive voit qui est déjà en train d’écrire', async ({ page, browser }) => {
  const owner = await createUser();
  const boardId = await board(owner);
  await openBoardAs(page, owner, boardId);
  const postit = await addPostit(page, 'En cours');
  await saved(page);
  const point = await center(page, postit);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByRole('textbox', { name: 'Texte du post-it' })).toBeVisible();

  const late = await newPage(browser);
  await openBoardAs(late, owner, boardId);
  await expect(late.getByText(/modifie…/)).toBeVisible();
});
