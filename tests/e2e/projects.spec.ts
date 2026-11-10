import { expect, test } from '@playwright/test';
import { createBoardFor, createUser } from './backend';
import { canvas, signIn } from './helpers';

const unique = (prefix: string) => `${prefix} ${crypto.randomUUID().slice(0, 8)}`;

test('le créateur choisit le projet, obligatoire, avant de créer un tableau', async ({ page }) => {
  await signIn(page, await createUser());
  const create = page.getByRole('button', { name: 'Créer' });
  const name = unique('Atelier');
  await page.getByRole('textbox', { name: 'Nom du nouveau tableau' }).fill(name);
  await expect(create).toBeDisabled();

  await page.getByRole('combobox', { name: 'Projet du nouveau tableau' }).selectOption({ label: 'GUH' });
  await create.click();
  await expect(canvas(page).locator('canvas').first()).toBeVisible();

  await page.getByRole('button', { name: 'Tableaux' }).click();
  const row = page.getByRole('listitem').filter({ hasText: name });
  await expect(row).toContainText('GUH');
  await expect(row).toContainText('Créé par vous');
});

test('filtrer la liste par projet et par créateur, filtres gardés dans l’URL', async ({ page }) => {
  const alice = await createUser();
  const bob = await createUser();
  const aliceGuh = unique('Alice GUH');
  const aliceEnvergo = unique('Alice Envergo');
  const bobGuh = unique('Bob GUH');
  await createBoardFor(alice, aliceGuh, 'guh');
  await createBoardFor(alice, aliceEnvergo, 'envergo');
  await createBoardFor(bob, bobGuh, 'guh');

  await signIn(page, bob);
  const list = page.getByRole('list');
  await expect(list).toContainText(aliceGuh);
  await expect(list).toContainText(aliceEnvergo);
  await expect(page.getByRole('listitem').filter({ hasText: aliceGuh })).toContainText(
    `Créé par ${alice.email}`,
  );
  // Seul le créateur peut supprimer.
  await expect(page.getByRole('button', { name: `Supprimer ${aliceGuh}` })).toHaveCount(0);
  await expect(page.getByRole('button', { name: `Supprimer ${bobGuh}` })).toHaveCount(1);

  await page.getByRole('combobox', { name: 'Filtrer par projet' }).selectOption({ label: 'GUH' });
  await expect(list).toContainText(aliceGuh);
  await expect(list).toContainText(bobGuh);
  await expect(list).not.toContainText(aliceEnvergo);

  await page.getByRole('combobox', { name: 'Filtrer par créateur' }).selectOption({ label: alice.email });
  await expect(list).toContainText(aliceGuh);
  await expect(list).not.toContainText(bobGuh);
  await expect(page).toHaveURL(new RegExp(`\\?projet=guh&createur=${alice.id}$`));

  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Filtrer par projet' })).toHaveValue('guh');
  await expect(page.getByRole('combobox', { name: 'Filtrer par créateur' })).toHaveValue(alice.id);
  await expect(list).toContainText(aliceGuh);
  await expect(list).not.toContainText(bobGuh);

  await page.getByRole('combobox', { name: 'Filtrer par créateur' }).selectOption({ label: 'Moi' });
  await expect(list).toContainText(bobGuh);
  await expect(list).not.toContainText(aliceGuh);

  await page.getByRole('combobox', { name: 'Filtrer par projet' }).selectOption({ label: 'Envergo' });
  await expect(page.getByText('Aucun tableau ne correspond à ces filtres.')).toBeVisible();

  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(list).toContainText(aliceEnvergo);
});
