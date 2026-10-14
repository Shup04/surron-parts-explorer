import { expect, test } from '@playwright/test';

/** Small binary GLB with duplicate source names that GLTFLoader uniquifies. */
function glb() {
  const vertices = new Float32Array([0, 0, 0, 0.05, 0, 0, 0, 0.05, 0]);
  const document = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [
      { children: [1, 2] },
      { name: 'bearing', mesh: 0, extras: { objectId: 'left-bearing' } },
      { name: 'bearing', mesh: 0, translation: [1, 0, 0], extras: { objectId: 'right-bearing' } },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: vertices.byteLength }],
    bufferViews: [{ buffer: 0, byteLength: vertices.byteLength }],
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
  };
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const result = Buffer.alloc(12 + 8 + padded.length + 8 + vertices.byteLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(padded.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(result, 20);
  result.writeUInt32LE(vertices.byteLength, 20 + padded.length);
  result.writeUInt32LE(0x004e4942, 24 + padded.length);
  Buffer.from(vertices.buffer).copy(result, 28 + padded.length);
  return result;
}

test('binary GLB preflight preserves source names, mapping and the imported snapshot', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/editor?demo=1');
  const input = page.getByLabel('Import model and companion files');
  await input.setInputFiles({
    name: 'readiness.glb',
    mimeType: 'model/gltf-binary',
    buffer: glb(),
  });
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'Loaded readiness.glb',
  );
  const disclosure = page.locator('.editor-validation');
  await expect(disclosure).not.toHaveAttribute('open', '');
  await disclosure.locator('summary').click();
  const report = page.getByLabel('Import preflight report');
  await expect(report).toContainText('3 objects · 2 meshes · 2 triangles');
  await expect(report).toContainText('1 unnamed · 2 duplicate-named');
  await expect(report).toContainText('1.05 × 0.05 × 0 m');
  await expect(report).toContainText('2 of 2 mesh objects have unique mapping keys');
  await expect(disclosure).toContainText('Give independently selectable components unique names');
  const original = (await report.textContent())!;
  await page.getByRole('checkbox', { name: 'Select bearing', exact: true }).check();
  await page.getByRole('combobox', { name: 'Catalog part', exact: true }).selectOption('shaft');
  await page.getByRole('button', { name: 'Map 1 selected', exact: true }).click();
  await page.getByRole('button', { name: 'Apply to mapped selection' }).click();
  await page.getByRole('button', { name: 'Explode', exact: true }).click();
  await expect(report).toHaveText(original);
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('preflight-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('status', { name: 'Editor status' })).toContainText(
    'restored intact',
  );
  await disclosure.locator('summary').click();
  await expect(report).toHaveText(original);
  await expect(page.locator('.editor-stats')).toContainText('1 mapped');
  await input.setInputFiles({
    name: 'bad.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('broken'),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toBeVisible();
  await expect(report).toHaveText(original);
  await page.setViewportSize({ width: 390, height: 844 });
  await report.scrollIntoViewIfNeeded();
  await expect(disclosure.locator('summary')).toContainText('Import preflight');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('preflight-phone.png'), fullPage: true });
  expect(errors).toEqual([]);
});
