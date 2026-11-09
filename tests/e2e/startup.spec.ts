import { expect, test } from '@playwright/test';

test("l'application démarre en français avec une surface Konva, sans erreur", async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('textbox', { name: 'Nom du tableau' })).toBeVisible();

  const canvas = page.getByTestId('board-canvas').locator('canvas').first();
  await expect(canvas).toBeVisible();
  const viewport = page.viewportSize();
  const box = await canvas.boundingBox();
  expect(box?.width).toBe(viewport?.width);
  expect(box?.height).toBe(viewport?.height);

  expect(errors).toEqual([]);
});
