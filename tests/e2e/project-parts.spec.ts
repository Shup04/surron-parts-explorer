import { expect, test } from '@playwright/test';
import { seatGlb } from './fixtures/part-glb';

test('project parts load together and isolate the frame and purple swingarm', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await viewer.getAttribute('data-visible-meshes')))
    .toBeGreaterThan(7);
  await expect(viewer).toHaveAttribute('data-load-complete', 'true');
  const wholeBikeMeshes = (await viewer.getAttribute('data-visible-meshes'))!;
  await page.screenshot({ path: testInfo.outputPath('project-assembly.png'), fullPage: true });
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Frame and subframe', exact: true }).click();
  await tree.getByRole('button', { name: 'Main frame', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: testInfo.outputPath('main-frame.png'), fullPage: true });
  await page.goto('/?workspace=project&nav=nav.swingarm.arm');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.screenshot({ path: testInfo.outputPath('purple-swingarm.png'), fullPage: true });
  await page.reload();
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.goto('/?workspace=project&nav=frame');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '7');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.screenshot({
    path: testInfo.outputPath('frame-assembly-exploded.png'),
    fullPage: true,
  });
  await page.goto('/');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  expect(errors).toEqual([]);
});

test('a saved local import cannot override the styled project on normal entry', async ({
  page,
}) => {
  await page.goto('/editor?workspace=local');
  await page
    .getByRole('combobox', { name: '1. Choose the bike part' })
    .selectOption('nav.body.seat');
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'older-seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: seatGlb(false),
  });
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  const viewer = page.getByTestId('viewer');
  await expect(page).toHaveURL(/workspace=local/);
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');

  await page.goto('/');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect
    .poll(async () => Number(await viewer.getAttribute('data-visible-meshes')))
    .toBeGreaterThan(1);
  await expect(viewer).toHaveAttribute('data-load-complete', 'true');
  const wholeBikeMeshes = (await viewer.getAttribute('data-visible-meshes'))!;
  await expect(page).not.toHaveURL(/workspace=local/);
  await page.reload();
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await page.goto('/?nav=nav.body.seat');
  await expect(viewer).toHaveAttribute('data-visible-meshes', wholeBikeMeshes);
  await expect(page.locator('.part-details')).toContainText(
    'Supplied 3D part from the current Blender assembly.',
  );

  await page.getByText('Tools', { exact: true }).click();
  await page.getByRole('link', { name: 'Saved local parts', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.locator('.asset-notice')).toContainText('Local model');
});
