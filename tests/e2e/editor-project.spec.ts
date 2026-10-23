import { expect, test } from '@playwright/test';
import { projectPartsAsset } from '../../src/config/project-parts';
import { oemCatalog, oemDatabase } from '../../src/data/oem';
import { buildCuratedNavigation } from '../../src/navigation/model';
import { assignPartModel } from '../../src/editor/part-project';
import { seatGlb } from './fixtures/part-glb';

test('the main viewer opens current models in the editor without restoring or overwriting an old save', async ({
  page,
}, testInfo) => {
  const navigation = buildCuratedNavigation(oemDatabase, oemCatalog);
  const old = assignPartModel(
    {
      version: 1,
      catalog: oemCatalog,
      assetFileName: null,
      mapping: { version: 1, assetId: 'demonstration', units: 'm', upAxis: 'Y', mappings: [] },
    },
    navigation.byId.get('nav.body.seat')!,
    'old-seat.glb',
    'Old seat.glb',
  );
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(old),
  );
  await page.goto('/');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '72');
  await page.getByText('Tools', { exact: true }).click();
  const requests = new Set<string>();
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/parts/')) requests.add(url.pathname + url.search);
  });
  await page.getByRole('link', { name: 'Model editor', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('68 current project models loaded');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(68);
  await expect(page.getByLabel('Added parts')).toContainText('Footpeg Bracket Bolt Left Upper.glb');
  await expect(page.getByRole('button', { name: 'Choose Motor Pulley', exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('button', { name: 'Choose Jackshaft Pulley', exact: true }),
  ).toHaveCount(0);
  expect([...requests].sort()).toEqual(projectPartsAsset.models!.map((model) => model.url).sort());
  expect(await page.evaluate(() => localStorage.getItem('surron-editor-project'))).toBe(
    JSON.stringify(old),
  );
  await page.screenshot({
    path: testInfo.outputPath('current-project-editor.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Advanced tools', exact: true }).click();
  await page.locator('.editor-validation summary').click();
  await expect(page.getByLabel('Import preflight report')).toContainText('72 meshes');
  await expect(page.getByLabel('Import preflight report')).toContainText('1,219,281 triangles');
  await expect(page.getByRole('alert', { name: 'Editor error' })).toHaveCount(0);
});

test('replacing a project part saves the full assembly and the editor follows the local preview', async ({
  page,
}) => {
  await page.goto('/editor');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(68);
  const role = page.getByRole('combobox', { name: '1. Choose the bike part' });
  await role.selectOption('nav.body.seat');
  await expect(page.getByRole('button', { name: 'Replace Seat GLB', exact: true })).toBeEnabled();
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'updated-seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: seatGlb(false, 1000),
  });
  await expect(page.getByLabel('Added parts')).toContainText('updated-seat.glb');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(68);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await page.reload();
  await expect(page.getByLabel('Added parts')).toContainText('updated-seat.glb');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(68);
  await page.getByRole('button', { name: 'Save & preview', exact: true }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '72');
  await page.getByText('Tools', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Model editor', exact: true })).toHaveAttribute(
    'href',
    '/editor?workspace=local',
  );
  await page.getByRole('link', { name: 'Model editor', exact: true }).click();
  await expect(page.getByLabel('Added parts')).toContainText('updated-seat.glb');
  await page.getByRole('link', { name: 'Current project parts', exact: true }).click();
  await expect(page.getByLabel('Editor status')).toContainText('68 current project models loaded');
  await expect(page.getByLabel('Added parts')).not.toContainText('updated-seat.glb');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('surron-editor-project')!),
  );
  expect(saved.partModels).toHaveLength(68);
  expect(
    saved.partModels.filter((model: { projectModelId?: string }) => model.projectModelId),
  ).toHaveLength(67);
});
