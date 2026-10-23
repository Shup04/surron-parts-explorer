import { expect, test } from '@playwright/test';

test('rear shock loads its finishes, separates, and exposes each component', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project&nav=nav.rear-suspension.shock');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '9');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await page.screenshot({ path: testInfo.outputPath('rear-shock-assembled.png') });
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '9');
  await page.screenshot({ path: testInfo.outputPath('rear-shock-exploded.png') });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');

  const tree = page.locator('.parts-tree');
  const expand = tree.getByRole('button', { name: 'Expand Rear shock', exact: true });
  if (await expand.count()) await expand.click();
  for (const [name, role, meshCount] of [
    ['Main body', 'body', '7'],
    ['Spring', 'spring', '1'],
    ['Preload nut', 'preload-nut', '1'],
  ]) {
    const component = tree.getByRole('button', { name, exact: true });
    await component.click();
    await expect(component).toHaveAttribute('aria-current', 'true');
    // The component's own link also works independently of the open assembly.
    await page.goto(`/?workspace=project&nav=nav.rear-suspension.shock.${role}`);
    await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
    await expect(viewer).toHaveAttribute('data-visible-meshes', meshCount);
    await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`rear-shock-${role}.png`) });
  }
  await page.reload();
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  expect(errors).toEqual([]);
});

test('rear shock remains usable on a phone', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project&nav=nav.rear-suspension.shock');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '9');
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  const closeDetails = page.getByRole('button', { name: 'Close component details' });
  if (await closeDetails.isVisible()) await closeDetails.click();
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await page.screenshot({ path: testInfo.outputPath('rear-shock-phone-exploded.png') });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('rear-shock-phone-assembled.png') });
});
