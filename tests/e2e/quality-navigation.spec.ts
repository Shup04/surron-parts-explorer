import { expect, test } from '@playwright/test';

test('clearing search keeps keyboard focus in the search field', async ({ page }) => {
  await page.goto('/?demo=1');
  const search = page.getByRole('textbox', { name: 'Search parts' });
  await search.fill('bearing');
  await expect(page.locator('.search-results [role="status"]')).toContainText('Matching parts');
  await page.getByRole('button', { name: 'Clear search' }).focus();
  await page.keyboard.press('Enter');
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await page.keyboard.type('left jackshaft bearing');
  await expect(page.locator('.search-result')).toHaveCount(1);
});

test('viewer disclosures restore focus without closing component details', async ({ page }) => {
  await page.goto('/?demo=1&assembly=jackshaft&part=bearing-left');
  const details = page.locator('#component-details');
  await expect(details).toBeVisible();
  const options = page.locator('.viewer-options > summary');
  await options.click();
  await page.getByRole('button', { name: 'Viewer help', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(options).toBeFocused();
  await expect(page.locator('.viewer-options')).not.toHaveAttribute('open', '');
  await expect(details).toBeVisible();

  await options.press('Enter');
  await page.getByRole('button', { name: 'Viewer help', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: 'Close viewer help' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.help-popover')).toBeHidden();
  await expect(options).toBeFocused();
  await expect(details).toBeVisible();

  await options.press('Enter');
  await page.getByRole('button', { name: 'Performance diagnostics', exact: true }).press('Enter');
  const closeDiagnostics = page.getByRole('button', { name: 'Close performance diagnostics' });
  await expect(closeDiagnostics).toBeFocused();
  await closeDiagnostics.press('Enter');
  await expect(options).toBeFocused();
  await expect(page.locator('.stats-popover')).toBeHidden();

  const tools = page.locator('.workspace-tools > summary');
  await tools.click();
  await page.getByRole('link', { name: 'Model editor', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(tools).toBeFocused();
  await expect(page.locator('.workspace-tools')).not.toHaveAttribute('open', '');
  await expect(details).toBeVisible();
});

test('Escape dismisses mobile drawers before changing isolation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=1&assembly=jackshaft&part=bearing-left');
  const details = page.locator('#component-details');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  const assemblyMeshCount = Number(await viewer.getAttribute('data-visible-meshes'));
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect
    .poll(async () => Number(await viewer.getAttribute('data-visible-meshes')))
    .toBeLessThan(assemblyMeshCount);
  const isolatedMeshCount = Number(await viewer.getAttribute('data-visible-meshes'));
  expect(isolatedMeshCount).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Exit isolation' })).toBeVisible();
  await expect(viewer).toHaveAttribute('data-visible-meshes', String(isolatedMeshCount));

  const parts = page.getByRole('button', { name: 'Parts', exact: true });
  await parts.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(parts).toBeFocused();
  await expect(viewer).toHaveAttribute('data-visible-meshes', String(isolatedMeshCount));

  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Exit isolation' })).toBeHidden();
  await expect(viewer).toHaveAttribute('data-visible-meshes', String(assemblyMeshCount));
});

test('curated component details use the right label and avoid a duplicate information action', async ({
  page,
}) => {
  await page.goto('/?nav=nav.jackshaft.bearings');
  const details = page.locator('#component-details');
  await expect(details.locator('.panel-heading .eyebrow')).toHaveText('Part details');
  await expect(details.getByRole('heading', { name: 'Jackshaft bearings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View part information' })).toBeHidden();
  await page.getByRole('button', { name: 'Close component details' }).click();
  await page.getByRole('button', { name: 'View part information' }).click();
  await expect(details).toBeVisible();
  await expect(page.getByRole('button', { name: 'View part information' })).toBeHidden();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await expect(details.locator('.panel-heading .eyebrow')).toHaveText('Assembly details');
});

test('copying a part link announces completion', async ({ page }) => {
  // Check the application's success feedback without modifying the host clipboard.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => undefined },
    });
  });
  await page.goto('/?demo=1&assembly=jackshaft&part=bearing-left');
  await page.getByRole('button', { name: 'Copy share link' }).click();
  await expect(page.locator('.explorer-shell > [aria-live="polite"]')).toHaveText(
    'Share link copied.',
  );
});
