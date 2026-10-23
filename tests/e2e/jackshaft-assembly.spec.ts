import { expect, test } from '@playwright/test';
import { oemCatalog } from '../../src/data/oem';
import { createProjectWorkspace } from '../../src/editor/project-workspace';

test('a real jackshaft screw opens its parent before it can be selected individually', async ({
  page,
}) => {
  // Keep one real bolt visible so the canvas center is an unambiguous raycast target.
  const project = createProjectWorkspace(oemCatalog);
  const boltId = 'project-jackshaft-pulley-bolt-01';
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
  const canvas = viewer.locator('canvas');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await canvas.hover();
  await expect(page.getByRole('tooltip')).toHaveText('Jackshaft Pulley Bolt 01');
  await canvas.click();
  await expect(page).toHaveURL(/nav=nav\.jackshaft\.assembly/);
  await expect(page.locator('#component-details h2')).toHaveText('Jackshaft assembly');
  await expect(page).not.toHaveURL(new RegExp(`part=${boltId}`));

  await canvas.click();
  await expect(page).toHaveURL(new RegExp(`part=${boltId}`));
  await expect(page.locator('.part-details h2')).toHaveText('Jackshaft Pulley Bolt 01');
  await page.getByRole('button', { name: 'Complete motorcycle', exact: true }).click();
  await canvas.click();
  await expect(page.locator('#component-details h2')).toHaveText('Jackshaft assembly');
  await expect(page).not.toHaveURL(new RegExp(`part=${boltId}`));
});

test('clicking the jackshaft assembly opens its exploded parts and retains the assembly while inspecting hardware', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Jackshaft and final drive', exact: true }).click();
  await tree.getByRole('button', { name: 'Jackshaft assembly', exact: true }).click();
  await expect(page).toHaveURL(/nav=nav\.jackshaft\.assembly/);
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  await expect(slider).toHaveValue('1');
  // Let the canvas resize after the details column opens before capturing its camera framing.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: testInfo.outputPath('jackshaft-exploded.png'), fullPage: true });
  await tree.getByRole('button', { name: 'Expand Jackshaft bearings', exact: true }).click();
  await tree.getByRole('button', { name: 'Jackshaft Bearing Right Inner', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('.part-details')).toContainText('6000-2RS');
  await expect(page.locator('.part-details')).toContainText('Z-6000-2Z-26-10-08');
  await page.reload();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await expect(slider).toHaveValue('1');
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '2');
  await page.getByRole('button', { name: 'Show assembly', exact: true }).click();
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await page.screenshot({ path: testInfo.outputPath('jackshaft-assembled.png'), fullPage: true });
  await page.goto('/?nav=nav.jackshaft.assembly&part=project-jackshaft-sprocket-bolt-01');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await expect(page.locator('.part-details')).toContainText('M6 × 25');
  await expect(page.locator('.part-details')).toContainText('Modeled Allen key (provisional)');
  await page.goto('/?part=project-jackshaft-inner-spacer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(slider).toHaveCount(0);
  await page
    .locator('.part-details')
    .getByRole('button', { name: 'Jackshaft assembly', exact: true })
    .click();
  await expect(page).toHaveURL(/nav=nav\.jackshaft\.assembly/);
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await expect(slider).toHaveValue('1');
  expect(errors).toEqual([]);
});

test('a phone can open the jackshaft explosion and reassemble it', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nav=nav.jackshaft.assembly');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '25');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Close component details', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('jackshaft-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
