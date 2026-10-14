import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

function gltfFixture() {
  const vertices = new Float32Array([
    0, 0, 0, 0.05, 0, 0, 0, 0.05, 0, 0, 0, 0, 0, 0, 0.05, 0.05, 0, 0, 0, 0, 0, 0, 0.05, 0, 0, 0,
    0.05, 0.05, 0, 0, 0, 0, 0.05, 0, 0.05, 0,
  ]);
  return JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'shaft', mesh: 0 },
      { name: 'bearing-left', mesh: 0, translation: [0.1, 0, 0] },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [
      {
        uri: `data:application/octet-stream;base64,${Buffer.from(vertices.buffer).toString('base64')}`,
        byteLength: vertices.byteLength,
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 12,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [0.05, 0.05, 0.05],
      },
    ],
  });
}

test('local model mapping, explosion metadata, export and explorer handoff stay connected', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/editor?demo=1');
  await expect(page.getByRole('heading', { name: 'Model mapping studio' })).toBeVisible();
  await page.getByLabel('Import model and companion files').setInputFiles({
    name: 'mechanical-fixture.gltf',
    mimeType: 'model/gltf+json',
    buffer: Buffer.from(gltfFixture()),
  });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded mechanical-fixture.gltf',
  );
  await page.getByRole('button', { name: 'Apply 2 exact ID matches' }).click();
  await expect(page.locator('.editor-stats')).toContainText('2 mapped');
  await page
    .locator('.editor-object-name')
    .filter({ hasText: /^shaft/ })
    .click();
  await page
    .getByRole('combobox', { name: 'Catalog part', exact: true })
    .selectOption('bearing-right');
  await page.getByRole('button', { name: 'Map 1 selected', exact: true }).click();
  await page.getByLabel('Distance (m)', { exact: true }).fill('0.25');
  await page.getByRole('button', { name: 'Apply to mapped selection', exact: true }).click();
  await page.getByRole('button', { name: 'Explode', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Editor explosion amount' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Editor explosion amount' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Frame selected', exact: true }).click();
  await page.getByRole('button', { name: 'Save camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recall camera', exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full project JSON', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.assetFileName).toBe('mechanical-fixture.gltf');
  expect(exported.mapping.mappings).toHaveLength(2);
  expect(
    exported.mapping.mappings.find((entry: { partId: string }) => entry.partId === 'bearing-right')
      .explosion.distance,
  ).toBe(0.25);
  expect(exported.mapping.camera.position).toHaveLength(3);
  expect(exported.catalog.parts.some((part: { id: string }) => part.id === 'bearing-right')).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Preview in explorer', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '2');
  await page.getByRole('textbox', { name: 'Search parts' }).fill('right jackshaft bearing');
  await page.locator('.search-result').filter({ hasText: 'Right jackshaft bearing' }).click();
  await expect(page).toHaveURL(/part=bearing-right/);
  await expect(page).toHaveURL(/workspace=local/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Right jackshaft bearing');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  expect(errors).toEqual([]);
});

test('model and project import errors leave the working workspace intact', async ({ page }) => {
  await page.goto('/editor?demo=1');
  await page.getByLabel('Import model and companion files').setInputFiles({
    name: 'broken.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('this is not a glb'),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toBeVisible();
  await expect(page.locator('.editor-model-name')).toHaveText('Synthetic demonstration motorcycle');
  await page.getByLabel('Import model and companion files').setInputFiles({
    name: 'missing.gltf',
    mimeType: 'model/gltf+json',
    buffer: Buffer.from(
      JSON.stringify({
        asset: { version: '2.0' },
        buffers: [{ uri: 'missing.bin', byteLength: 10 }],
      }),
    ),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toContainText(
    'Missing companion file',
  );
  await page.getByLabel('Import project, catalog or mapping JSON').setInputFiles({
    name: 'bad-project.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 2, catalog: {}, mapping: {} })),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toContainText(
    'Unsupported project version',
  );
  await expect(page.locator('.editor-model-name')).toHaveText('Synthetic demonstration motorcycle');
});

test('catalog assembly creation and reparenting are validated and exportable', async ({ page }) => {
  await page.goto('/editor?demo=1');
  await page
    .getByRole('combobox', { name: 'Catalog part', exact: true })
    .selectOption('drivetrain');
  await page.getByText('Add part or assembly', { exact: true }).click();
  await page.getByLabel('Stable ID', { exact: true }).fill('service-group');
  await page.getByLabel('Name', { exact: true }).fill('Service inspection group');
  await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('assembly');
  await page.getByRole('button', { name: 'Create catalog entry', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Catalog part', exact: true })).toHaveValue(
    'service-group',
  );
  await page
    .getByRole('combobox', { name: 'Catalog part', exact: true })
    .selectOption('bearing-left');
  await page
    .getByRole('combobox', { name: 'Parent assembly', exact: true })
    .selectOption('service-group');
  await page.getByLabel('Human-readable name', { exact: true }).fill('Inspected left bearing');
  await page.getByRole('button', { name: 'Save catalog changes', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Stable part ID preserved',
  );
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Workspace saved',
  );
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('surron-editor-project')!),
  );
  expect(
    stored.catalog.parts.find((part: { id: string }) => part.id === 'bearing-left'),
  ).toMatchObject({ name: 'Inspected left bearing', parentId: 'service-group' });
  expect(
    stored.catalog.parts.find((part: { id: string }) => part.id === 'service-group'),
  ).toMatchObject({
    kind: 'assembly',
    parentId: 'drivetrain',
    verification: 'unknown',
    oemNumber: null,
  });
  stored.catalog.parts.find((part: { id: string }) => part.id === 'bearing-left').name =
    'Catalog-imported left bearing';
  await page.getByLabel('Import project, catalog or mapping JSON').setInputFiles({
    name: 'factory-catalog.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stored.catalog)),
  });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Catalog imported',
  );
  await page.getByRole('button', { name: 'Preview in explorer', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('textbox', { name: 'Search parts' }).fill('Catalog-imported left bearing');
  await page.locator('.search-result').filter({ hasText: 'Catalog-imported left bearing' }).click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Catalog-imported left bearing');
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page).toHaveURL(/assembly=service-group/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Catalog-imported left bearing');
});
