import { expect, test } from '@playwright/test';

test('renders real geometry, selects by raycast, navigates and restores browser history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await viewer.getAttribute('data-visible-meshes')))
    .toBeGreaterThan(10);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The machine, piece by piece.');
  // The raycast target is discovered from the actual rendered geometry, not a DOM substitute.
  const bounds = await viewer.boundingBox();
  expect(bounds).not.toBeNull();
  let hit = false;
  for (let y = 0.35; y <= 0.7 && !hit; y += 0.07) {
    for (let x = 0.3; x <= 0.7 && !hit; x += 0.06) {
      await page.mouse.move(bounds!.x + bounds!.width * x, bounds!.y + bounds!.height * y);
      if (await page.getByRole('tooltip').isVisible()) {
        await page.mouse.click(bounds!.x + bounds!.width * x, bounds!.y + bounds!.height * y);
        hit = true;
      }
    }
  }
  expect(hit, 'Synthetic motorcycle geometry must respond to pointer raycasts').toBe(true);
  await expect(page).toHaveURL(/assembly=/);
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The machine, piece by piece.');
  expect(errors).toEqual([]);
});

test('search, exploded assembly controls, visibility, isolation and deep links work together', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Search parts' }).fill('left jackshaft bearing');
  await page.locator('.search-result').filter({ hasText: 'Left jackshaft bearing' }).click();
  await expect(page).toHaveURL(/part=bearing-left/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Left jackshaft bearing');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(page.locator('.isolation-banner')).toContainText('Left jackshaft bearing');
  await page.getByRole('button', { name: 'Show assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  const link = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Left jackshaft bearing');
  expect(page.url()).toBe(link);
  await page
    .locator('.breadcrumbs')
    .getByRole('button', { name: 'Jackshaft assembly', exact: true })
    .click();
  await page.getByRole('button', { name: 'Hide Left jackshaft bearing' }).click();
  await expect(page.getByRole('button', { name: 'Show Left jackshaft bearing' })).toBeVisible();
  await page.getByRole('button', { name: /Show 1 hidden/ }).click();
  await expect(page.getByRole('button', { name: 'Hide Left jackshaft bearing' })).toBeVisible();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Motor & drivetrain');
  await page.goBack();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jackshaft assembly');
});

test('mobile parts navigation and detail sheet remain usable without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts' }).fill('sprocket');
  await page.locator('.search-result').filter({ hasText: 'Jackshaft sprocket' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Jackshaft sprocket');
  await page.getByRole('button', { name: 'Close component details' }).click();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toBeVisible();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('unknown deep links recover to the motorcycle and keyboard navigation works', async ({
  page,
}) => {
  await page.goto('/?motorcycle=unknown&assembly=not-present&part=missing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The machine, piece by piece.');
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeFocused();
  await page.keyboard.type('battery');
  const result = page.locator('.search-result').filter({ hasText: 'Battery' });
  await result.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Battery');
});
