import { expect, test } from '@playwright/test';
import partsManifest from '../../public/parts/manifest.json';
import { seatGlb } from './fixtures/part-glb';

test('the public hierarchy contains only modeled parts and their assemblies', async ({
  page,
}, testInfo) => {
  // This exhaustively expands every modeled branch, including both nested assemblies.
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project');
  const tree = page.locator('.parts-tree');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-load-complete', 'true');
  const wholeBikeMeshes = (await page.getByTestId('viewer').getAttribute('data-visible-meshes'))!;
  await expect(tree.getByRole('button', { name: 'Front wheel', exact: true })).toHaveCount(0);
  await expect(tree.getByRole('button', { name: 'Front suspension', exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-filter-disclosure')).toHaveCount(0);
  while (await tree.getByRole('button', { name: /^Expand / }).count())
    await tree
      .getByRole('button', { name: /^Expand / })
      .first()
      .click();
  await expect(tree.locator('[data-navigation-kind="component"]')).toHaveCount(
    partsManifest.parts.length,
  );
  await expect(
    tree.getByRole('button', { name: 'Jackshaft and final drive', exact: true }),
  ).toHaveCount(1);
  await expect(tree.getByRole('button', { name: 'Battery pack', exact: true })).toHaveCount(0);
  await expect(tree.getByRole('button', { name: 'Jackshaft bearings', exact: true })).toHaveCount(
    1,
  );
  await expect(tree.getByRole('button', { name: 'M6 Hardware Left', exact: true })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'M6 Hardware Right', exact: true })).toBeVisible();
  await tree.getByRole('button', { name: 'Main frame', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(page.locator('.part-details h2')).toHaveText('Main Frame');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('modeled-hierarchy.png'), fullPage: true });
});

test('search finds supplied models without adding unmodeled reference records', async ({
  page,
}) => {
  await page.goto('/?workspace=project');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-load-complete', 'true');
  const wholeBikeMeshes = (await page.getByTestId('viewer').getAttribute('data-visible-meshes'))!;
  const search = page.getByRole('textbox', { name: 'Search parts' });
  await search.fill('61234-YQ2A-0000');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await search.fill('front wheel hub');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await expect(page.locator('.empty-state')).toContainText('No modeled parts match');
  await search.fill('rear belt pulley');
  await expect(page.locator('.search-result')).toHaveCount(0);
  await search.fill('suspension rocker');
  await expect(page.locator('.search-result')).toHaveCount(1);
  await page.locator('.search-result').click();
  await expect(page.locator('.part-details h2')).toHaveText('Suspension Rocker');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.reload();
  await expect(page.locator('.part-details h2')).toHaveText('Suspension Rocker');
  await expect(page.locator('.tree-row.active')).toHaveAttribute(
    'data-navigation-id',
    'nav.rear-suspension.rocker',
  );
});

test('new local jackshaft models populate one assembly and stay exploded while selecting its children', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/editor?workspace=local');
  const roles = ['nav.jackshaft.pulley', 'nav.jackshaft.bearings', 'nav.jackshaft.inner-spacer'];
  for (const [i, role] of roles.entries()) {
    await page.getByRole('combobox', { name: '1. Choose the bike part' }).selectOption(role);
    await page.getByLabel('Import part GLB').setInputFiles({
      name: `part-${i}.glb`,
      mimeType: 'model/gltf-binary',
      buffer: seatGlb(false),
    });
    await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(i + 1);
  }
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  const tree = page.locator('.parts-tree');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '3');
  await expect(tree.locator(':scope > li')).toHaveCount(1);
  await tree.getByRole('button', { name: 'Jackshaft and final drive', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await expect(page.locator('#component-details')).toContainText('3 modeled parts');
  await expect(page.locator('#component-details')).not.toContainText('OEM reference');
  await expect(
    tree.getByRole('button', { name: 'Collapse Jackshaft and final drive', exact: true }),
  ).toBeVisible();
  await tree.getByRole('button', { name: 'Expand Jackshaft assembly', exact: true }).click();
  await tree.getByRole('button', { name: 'Jackshaft bearings', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '3');
  await expect(page.locator('.part-details h2')).toHaveText('Jackshaft bearings');
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.getByRole('button', { name: 'Show assembly', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '3');
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await tree.getByRole('button', { name: 'Inner spacer', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await page.goBack();
  await expect(page.locator('.part-details h2')).toHaveText('Jackshaft bearings');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '3');
  await page.reload();
  await expect(slider).toHaveValue('0');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '3');
  await page.screenshot({ path: testInfo.outputPath('jackshaft-assembly.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('mobile navigation contains only available parts and returns from a part to its assembly', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project');
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Frame and subframe', exact: true }).click();
  await expect(tree.getByRole('button', { name: 'Jackshaft bearings', exact: true })).toHaveCount(
    0,
  );
  await tree.getByRole('button', { name: 'Main frame', exact: true }).click();
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('#component-details h2')).toHaveText('Main Frame');
  await page.getByRole('button', { name: 'Close component details' }).click();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('#component-details h2')).toHaveText('Frame and subframe');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('modeled-phone.png'), fullPage: true });
});
