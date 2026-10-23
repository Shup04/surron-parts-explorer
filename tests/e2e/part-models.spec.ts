import { expect, test, type Page } from '@playwright/test';
import { seatGlb } from './fixtures/part-glb';

async function openSeat(page: Page) {
  const tree = page.locator('.parts-tree');
  const seat = tree.getByRole('button', { name: 'Seat', exact: true });
  if (!(await seat.isVisible()))
    await tree.getByRole('button', { name: 'Expand Seat and bodywork', exact: true }).click();
  await seat.click();
}

test('simple uploads retain separate GLBs, replace one part, and preserve assignment after reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const projectRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/parts/')) projectRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/editor?workspace=local');
  await expect(page.getByRole('heading', { name: 'Add bike parts' })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Mapping and catalog inspector' }),
  ).toBeHidden();
  const role = page.getByRole('combobox', { name: '1. Choose the bike part' });
  await role.selectOption('nav.body.seat');
  await page
    .getByLabel('Import part GLB')
    .setInputFiles({ name: 'part.glb', mimeType: 'model/gltf-binary', buffer: seatGlb(false) });
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Local only');
  await role.selectOption('nav.body.front-fender');
  await page
    .getByLabel('Import part GLB')
    .setInputFiles({ name: 'part.glb', mimeType: 'model/gltf-binary', buffer: seatGlb(false) });
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Front fender added and assigned',
  );
  await page.screenshot({ path: testInfo.outputPath('simple-parts-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await openSeat(page);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await expect(async () => {
    await page.getByTestId('viewer').locator('canvas').click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('part'))
      .toBe('model-nav.body.seat');
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('.part-details h2')).toHaveText('Seat');
  await page.goto('/editor?workspace=local');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  await role.selectOption('nav.body.seat');
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'broken.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toBeVisible();
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'seat-revised.glb',
    mimeType: 'model/gltf-binary',
    buffer: seatGlb(false),
  });
  await expect(page.getByLabel('Added parts')).toContainText('seat-revised.glb');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Frame model', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('simple-parts-phone.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  await page.goto('/?workspace=local&nav=nav.body.seat');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  await page.reload();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('surron-editor-project')!),
  );
  expect(saved.partModels).toHaveLength(2);
  expect(
    saved.partModels.find((model: { id: string }) => model.id === 'nav.body.seat').originalName,
  ).toBe('seat-revised.glb');
  expect(
    saved.partModels.find((model: { id: string }) => model.id === 'nav.body.front-fender')
      .originalName,
  ).toBe('part.glb');
  expect(errors).toEqual([]);
  expect(projectRequests).toEqual([]);
});

test('an existing imported seat can be assigned without uploading or selecting meshes again', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/editor?workspace=local&advanced=1');
  await page
    .getByLabel('Import model and companion files')
    .setInputFiles({ name: 'my-seat.glb', mimeType: 'model/gltf-binary', buffer: seatGlb() });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded my-seat.glb',
  );
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Local only');
  // Unmodeled roles remain in the editor's picker, not the public parts tree.
  await page.goto('/editor?workspace=local&part=nav.body.seat');
  await expect(page.getByRole('combobox', { name: '1. Choose the bike part' })).toHaveValue(
    'nav.body.seat',
  );
  await expect(page.locator('.editor-existing-import')).toContainText('my-seat.glb');
  await page.getByRole('button', { name: 'Use this model for Seat', exact: true }).click();
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await openSeat(page);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
});
