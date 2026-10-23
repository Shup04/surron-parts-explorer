import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { seatGlb } from './fixtures/part-glb';

test.use({ viewport: { width: 800, height: 600 }, trace: 'off' });

/** Verify rendered pixels, because raycasting and mesh counts also succeed when clipped. */
async function brightModelPixels(page: Page): Promise<number> {
  const screenshot = await page.getByTestId('viewer').locator('canvas').screenshot();
  // Inspect screenshots outside the software WebGL browser to avoid extra GPU canvases.
  const { width, height } = await sharp(screenshot).metadata();
  const data = await sharp(screenshot)
    .extract({
      left: Math.floor(width! * 0.2),
      top: Math.floor(height! * 0.2),
      width: Math.floor(width! * 0.6),
      height: Math.floor(height! * 0.6),
    })
    .removeAlpha()
    .raw()
    .toBuffer();
  let bright = 0;
  for (let i = 0; i < data.length; i += 3)
    if (data[i] > 80 && data[i + 1] > 80 && data[i + 2] > 80) bright++;
  return bright;
}

test('large imported geometry remains rendered after camera framing, hovering and navigation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/editor?workspace=local&part=nav.body.seat');
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'large-seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: seatGlb(false, 1000),
  });
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  const canvas = page.getByTestId('viewer').locator('canvas');
  await canvas.hover();
  await expect(page.locator('.viewer-tooltip')).toContainText('Seat');
  await expect.poll(() => brightModelPixels(page)).toBeGreaterThan(5000);
  await page.screenshot({ path: testInfo.outputPath('large-seat-rendered.png') });
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Seat and bodywork', exact: true }).click();
  await tree.getByRole('button', { name: 'Seat', exact: true }).click();
  await expect(page.locator('#component-details')).toBeHidden();
  await expect.poll(() => brightModelPixels(page)).toBeGreaterThan(5000);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  await expect.poll(() => brightModelPixels(page)).toBeGreaterThan(5000);
  await page.reload();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.locator('#component-details')).toBeHidden();
  await expect.poll(() => brightModelPixels(page)).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});
