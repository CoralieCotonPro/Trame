import { expect, test } from '@playwright/test';
import { createUser } from './backend';
import { openNewBoard, signIn } from './helpers';

// Hors Netlify, la fonction d'envoi n'existe pas : on intercepte l'appel pour vérifier son contenu.
// La fonction elle-même est testée dans tests/unit/feedback.test.ts.
const FUNCTION = '**/.netlify/functions/feedback';

test('depuis un tableau : l’idée part avec le jeton de session et le nom du tableau', async ({ page }) => {
  let sent: { authorization: string | undefined; body: Record<string, string> } | null = null;
  await page.route(FUNCTION, async (route) => {
    sent = {
      authorization: route.request().headers().authorization,
      body: route.request().postDataJSON() as Record<string, string>,
    };
    await route.fulfill({ status: 200, json: { status: 'ok' } });
  });

  await openNewBoard(page);
  await page.getByRole('button', { name: 'Une idée ?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Proposer une idée' });
  const send = dialog.getByRole('button', { name: 'Envoyer' });
  await expect(send).toBeDisabled();

  // Taper « v » ou Suppr ne doit pas déclencher les raccourcis du tableau.
  await dialog.getByRole('textbox').fill('Pouvoir voter sur les post-it');
  await dialog.getByRole('textbox').press('Delete');
  await send.click();
  await expect(dialog.getByRole('status')).toContainText('Merci');

  expect(sent).not.toBeNull();
  expect(sent!.authorization).toMatch(/^Bearer .+/);
  expect(sent!.body).toMatchObject({ message: 'Pouvoir voter sur les post-it', board: 'Test' });
  expect(sent!.body.page).toContain('/b/');
});

test('depuis la liste : un échec d’envoi garde le message et l’explique', async ({ page }) => {
  await page.route(FUNCTION, (route) => route.fulfill({ status: 502, json: { error: 'échec' } }));
  await signIn(page, await createUser());
  await page.getByRole('button', { name: 'Une idée ?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Proposer une idée' });
  await dialog.getByRole('textbox').fill('Un mode sombre');
  await dialog.getByRole('button', { name: 'Envoyer' }).click();
  await expect(dialog.getByRole('alert')).toContainText("L'envoi a échoué");
  await expect(dialog.getByRole('textbox')).toHaveValue('Un mode sombre');

  await dialog.getByRole('textbox').press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Une idée ?' })).toBeVisible();
});
