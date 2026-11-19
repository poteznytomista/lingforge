import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 640, height: 480 },
]) {
  test(`workspace fits ${viewport.width}×${viewport.height} and supports navigation`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByText('Browser preview')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Give your world a voice.',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const navigation = page.getByRole('navigation', { name: 'Workspace' });
    for (const label of [
      'Phonology',
      'Lexicon',
      'Grammar',
      'Writing systems',
      'Documents',
      'Fonts & shaping',
      'Rules & analysis',
      'Resources',
    ]) {
      await navigation
        .getByRole('button', { name: label, exact: true })
        .click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(label);
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    }
    await page
      .getByRole('button', { name: 'Preferences', exact: true })
      .click();
    // The native radios are visually clipped; users click their visible labels.
    await page.getByText('Large', { exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Large', exact: true }),
    ).toBeChecked();
    await page.getByText('Reduce motion', { exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Reduce motion', exact: true }),
    ).toBeChecked();
    expect(
      await page.evaluate(() => {
        const main = document.querySelector('main')!;
        return main.scrollWidth <= main.clientWidth;
      }),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'Reset appearance' })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Reset appearance' }),
    ).toBeInViewport();
    expect(errors).toEqual([]);
  });
}

test('supports keyboard access and has no automated accessibility violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByText('Browser preview')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'Skip to workspace' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  const overview = await new AxeBuilder({ page }).analyze();
  expect(overview.violations).toEqual([]);
  await page.keyboard.press('Control+,');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Preferences' }),
  ).toBeFocused();
  const settings = await new AxeBuilder({ page }).analyze();
  expect(settings.violations).toEqual([]);
});

test('supports keyboard preference changes and loads assets locally', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:1420') {
      externalRequests.push(request.url());
    }
  });
  await page.goto('/');
  await expect(page.getByText('Browser preview')).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('radio', { name: 'Standard', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Comfortable', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Large', exact: true }),
  ).toBeChecked();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('radio', { name: 'Reduce motion', exact: true }),
  ).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  expect(externalRequests).toEqual([]);
});
