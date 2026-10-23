import { expect, test } from '@playwright/test';
import { oemCatalog } from '../../src/data/oem';
import { createProjectWorkspace } from '../../src/editor/project-workspace';

test('a wheel screw selects the assembly first, then the individual screw', async ({ page }) => {
  const project = createProjectWorkspace(oemCatalog);
  const boltId = 'project-rear-sprocket-bolt-01';
  project.partModels = project.partModels!.filter((model) => model.partId === boltId);
  project.mapping.mappings = project.mapping.mappings.filter(
    (mapping) => mapping.partId === boltId,
  );
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(project),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=local');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  const canvas = viewer.locator('canvas');
  await canvas.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Rear Sprocket Bolt 01');
  await canvas.click();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await expect(page).not.toHaveURL(new RegExp(`part=${boltId}`));
  await expect(page.locator('#component-details h2')).toHaveText('Rear wheel assembly');
  await canvas.click();
  await expect(page).toHaveURL(new RegExp(`part=${boltId}`));
  await expect(page.locator('.part-details h2')).toHaveText('Rear Sprocket Bolt 01');
  await page.getByRole('button', { name: 'Complete motorcycle', exact: true }).click();
  await canvas.click();
  await expect(page.locator('#component-details h2')).toHaveText('Rear wheel assembly');
});

test('hub geometry opens the wheel, then the nested hub, then its body', async ({ page }) => {
  const project = createProjectWorkspace(oemCatalog);
  const hubId = 'project-rear-hub';
  project.partModels = project.partModels!.filter((model) => model.partId === hubId);
  project.mapping.mappings = project.mapping.mappings.filter((mapping) => mapping.partId === hubId);
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(project),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=local');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  const canvas = viewer.locator('canvas');
  await canvas.click();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await expect(page.locator('#component-details h2')).toHaveText('Rear wheel assembly');
  await canvas.click();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await expect(page).not.toHaveURL(new RegExp(`part=${hubId}`));
  await expect(page.locator('#component-details h2')).toHaveText('Hub');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveCount(0);
  await page.reload();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.locator('#component-details h2')).toHaveText('Hub');
  await canvas.click();
  await expect(page).toHaveURL(new RegExp(`part=${hubId}`));
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await expect(page.locator('.part-details h2')).toHaveText('Rear Hub');
});

test('the complete wheel explodes into eight groups and reassembles around its hub', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await viewer.getAttribute('data-visible-meshes')))
    .toBeGreaterThan(19);
  await expect(viewer).toHaveAttribute('data-load-complete', 'true');
  const wholeBikeMeshes = (await viewer.getAttribute('data-visible-meshes'))!;
  await page.screenshot({ path: testInfo.outputPath('bike-with-rear-wheel.png'), fullPage: true });
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Rear wheel', exact: true }).click();
  await tree.getByRole('button', { name: 'Rear wheel assembly', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '19');
  // Wait for the WebGL viewport to catch up with the newly opened details panel.
  await expect
    .poll(() =>
      viewer.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
        const width = canvas.getBoundingClientRect().width;
        return Math.abs(canvas.width - width * Math.min(devicePixelRatio, 1.75)) < 2;
      }),
    )
    .toBe(true);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('rear-wheel-exploded.png'), fullPage: true });
  for (const name of [
    'Hub',
    'Rim',
    'Spokes',
    'Rear sprocket',
    'Bolts',
    'Disc',
    'Tire',
    'Inner tube',
  ]) {
    await expect(tree.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await tree.getByRole('button', { name: 'Disc', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '19');
  await expect(page.locator('.part-details')).toContainText('202.8 × 2 mm');
  await expect(slider).toHaveValue('1');
  await page.reload();
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(slider).toHaveValue('0');
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.screenshot({ path: testInfo.outputPath('rear-disc-isolated.png'), fullPage: true });
  await page.getByRole('button', { name: 'Show assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.screenshot({ path: testInfo.outputPath('rear-wheel-assembled.png'), fullPage: true });
  await tree.getByRole('button', { name: 'Expand Rear wheel assembly', exact: true }).click();
  await tree.getByRole('button', { name: 'Hub', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(page.locator('#component-details h2')).toHaveText('Hub');
  await expect(tree.getByRole('button', { name: 'Hub body', exact: true })).toBeVisible();
  await expect(slider).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rear-hub-assembly.png'), fullPage: true });
  await page.goto('/?part=project-rear-tire-18');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(page.locator('.part-details')).toContainText('3.00-18');
  await expect(slider).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('rear-tire-in-place.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('the rear-wheel assembly remains usable on a phone', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nav=nav.rear-wheel.assembly');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  await expect
    .poll(async () => Number(await page.getByTestId('viewer').getAttribute('data-visible-meshes')))
    .toBeGreaterThan(19);
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await expect(page.locator('#component-details')).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath('rear-wheel-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
