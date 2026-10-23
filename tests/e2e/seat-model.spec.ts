import { expect, test } from '@playwright/test';
import { seatGlb } from './fixtures/part-glb';

test('a saved seat GLB loads in the local preview, in Seat, and through mesh picking', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/editor?workspace=local&advanced=1');
  await page.getByLabel('Import model and companion files').setInputFiles({
    name: 'seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: seatGlb(),
  });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded seat.glb',
  );
  await page.getByRole('checkbox', { name: 'Select seat', exact: true }).check();
  await page.getByRole('searchbox', { name: 'Search catalog targets' }).fill('32300-YQ2A-0001');
  await page
    .getByRole('combobox', { name: 'Catalog part', exact: true })
    .selectOption('occ-lbx2021-p10-r4');
  await page.getByRole('button', { name: 'Map 1 selected', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Select seat', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Select other-bodywork', exact: true }).check();
  await page.getByRole('searchbox', { name: 'Search catalog targets' }).fill('body');
  await page.getByRole('combobox', { name: 'Catalog part', exact: true }).selectOption('body');
  await page.getByRole('button', { name: 'Map 1 selected', exact: true }).click();
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Local only');
  await page.getByRole('button', { name: 'Preview in explorer', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Seat and bodywork', exact: true }).click();
  await tree.getByRole('button', { name: 'Seat', exact: true }).click();
  await expect(page).toHaveURL(/nav=nav.body.seat/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  const canvas = page.getByTestId('viewer').locator('canvas');
  await expect(async () => {
    await canvas.click();
    await expect
      .poll(() => new URL(page.url()).searchParams.get('part'))
      .toBe('occ-lbx2021-p10-r4');
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('.oem-part-details .oem-number')).toHaveText('32300-YQ2A-0001');
  await page.goto('/?workspace=local&nav=nav.body.seat');
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await page.goto('/?demo=1');
  await expect(page).not.toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute(
    'data-visible-meshes',
    /^(?:[3-9]|\d{2,})$/,
  );
  expect(errors).toEqual([]);
});
