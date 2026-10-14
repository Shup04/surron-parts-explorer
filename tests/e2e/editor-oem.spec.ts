import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { demoCatalog } from '../../src/data/catalog';
import { oemCatalog, oemDatabase } from '../../src/data/oem';

function model() {
  const positions = new Float32Array([0, 0, 0, 0.05, 0, 0, 0, 0.05, 0]);
  return Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ name: 'machined-bearing', mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [
        {
          uri: `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString('base64')}`,
          byteLength: positions.byteLength,
        },
      ],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [0, 0, 0],
          max: [0.05, 0.05, 0],
        },
      ],
    }),
  );
}

async function exportProject(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export full project JSON', exact: true }).click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, 'utf8'));
}

test('OEM targets include review edits and geometry replacement preserves the sourced catalog', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const row = oemDatabase.sourceRows.find(
    (entry) => entry.sourceId === 'motorino' && entry.callout === '15_08',
  )!;
  const targetId = oemDatabase.occurrences.find((entry) => entry.sourceRowId === row.id)!.id;
  await page.addInitScript(
    (occurrenceId) =>
      localStorage.setItem(
        'surron-oem-review-v1',
        JSON.stringify({
          version: 1,
          patches: [
            {
              occurrenceId,
              normalizedName: 'Reviewed fixture bearing label',
              note: 'Browser regression review',
              updatedAt: '2026-10-14T00:00:00Z',
            },
          ],
        }),
      ),
    targetId,
  );
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Model mapping studio' })).toBeVisible();
  await expect(page.locator('.editor-stats')).toContainText('0 mapped');
  await page
    .getByRole('searchbox', { name: 'Search catalog targets' })
    .fill('Reviewed fixture bearing label');
  await page.getByRole('combobox', { name: 'Catalog part', exact: true }).selectOption(targetId);
  await expect(page.locator('.editor-target-details')).toContainText('Z-6000-2Z-26-10-08');
  await expect(page.getByRole('button', { name: /^Map .*selected$/ })).toBeDisabled();
  await page
    .getByLabel('Import model and companion files')
    .setInputFiles({ name: 'precise.gltf', mimeType: 'model/gltf+json', buffer: model() });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded precise.gltf',
  );
  await page
    .locator('.editor-object-name')
    .filter({ hasText: /^machined-bearing/ })
    .click();
  await page.getByRole('button', { name: 'Map 1 selected', exact: true }).click();
  const initial = await exportProject(page);
  expect(initial.catalog.parts).toHaveLength(oemCatalog.parts.length);
  expect(initial.mapping.mappings).toHaveLength(1);
  expect(initial.mapping.mappings[0].partId).toBe(targetId);
  expect(initial.catalog.parts.find((part: { id: string }) => part.id === targetId).name).toBe(
    'Reviewed fixture bearing label',
  );
  await page
    .getByLabel('Import model and companion files')
    .setInputFiles({ name: 'refined.gltf', mimeType: 'model/gltf+json', buffer: model() });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded refined.gltf',
  );
  const replacement = await exportProject(page);
  expect(replacement.catalog).toEqual(initial.catalog);
  expect(replacement.mapping.mappings).toEqual(initial.mapping.mappings);
  expect(replacement.assetFileName).toBe('refined.gltf');

  await page.getByRole('button', { name: 'Preview in explorer', exact: true }).click();
  await expect(page).toHaveURL(/workspace=local/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('textbox', { name: 'Search parts' }).fill('Reviewed fixture bearing label');
  await page
    .locator('.search-result')
    .filter({ hasText: 'Reviewed fixture bearing label' })
    .click();
  await expect.poll(() => new URL(page.url()).searchParams.get('part')).toBe(targetId);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await expect(page.locator('.oem-part-details h2')).toHaveText('Reviewed fixture bearing label');
  await expect(page.locator('.oem-part-details .oem-number')).toHaveText('Z-6000-2Z-26-10-08');
  await expect(page.locator('.oem-part-details .source-card')).toContainText('Motorino');
  await expect(page.locator('.oem-part-details .source-card')).toContainText(
    `Page ${row.page} · Figure ${row.figure} · Item ${row.callout}`,
  );
  await expect(page.getByRole('button', { name: 'Toggle isolation', exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/workspace=local/);
  await expect.poll(() => new URL(page.url()).searchParams.get('part')).toBe(targetId);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await expect(page.locator('.oem-part-details h2')).toHaveText('Reviewed fixture bearing label');
  await expect(page.locator('.oem-part-details .oem-number')).toHaveText('Z-6000-2Z-26-10-08');
  expect(errors).toEqual([]);
});

test('an older local workspace receives OEM records only through explicit additive merge', async ({
  page,
}) => {
  const legacy = {
    version: 1,
    catalog: structuredClone(demoCatalog),
    mapping: {
      version: 1,
      assetId: 'demonstration',
      units: 'm',
      upAxis: 'Y',
      mappings: [{ objectKey: '$', partId: 'frame' }],
    },
    assetFileName: null,
  };
  legacy.catalog.parts.find((part) => part.id === 'frame')!.name = 'My saved custom frame';
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', JSON.stringify(saved)),
    legacy,
  );
  await page.goto('/editor');
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'restored intact',
  );
  expect((await exportProject(page)).catalog).toEqual(legacy.catalog);
  await page.getByRole('button', { name: 'Merge current OEM catalog', exact: true }).click();
  const merged = await exportProject(page);
  expect(merged.catalog.parts.length).toBeGreaterThan(1000);
  expect(merged.mapping).toEqual(legacy.mapping);
  expect(merged.catalog.parts.find((part: { id: string }) => part.id === 'frame').name).toBe(
    'My saved custom frame',
  );
  await page.getByRole('button', { name: 'Merge current OEM catalog', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Added 0 missing',
  );
});
