import { expect, test } from '@playwright/test';
import { oemCatalog } from '../../src/data/oem';
import { createProjectWorkspace } from '../../src/editor/project-workspace';
import { projectPartsAsset } from '../../src/config/project-parts';
import { seatGlb } from './fixtures/part-glb';

test('clicking empty canvas deselects a part while a camera drag does not', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=1&assembly=jackshaft&part=bearing-left');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  const canvas = viewer.locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 34, box.y + 24);
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.up();
  await expect(page).toHaveURL(/part=bearing-left/);
  await canvas.click({ position: { x: 8, y: 8 } });
  await expect(page).toHaveURL(/part=(?:&|$)/);
  await page.reload();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  expect(new URL(page.url()).searchParams.get('part')).toBe('');
});

test('inspect an assembled jackshaft, cut surroundings, and return to the bike', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Keep the real internal stack and one surrounding assembly in this focused flow.
  const project = createProjectWorkspace(oemCatalog);
  const included = (id: string) => id.startsWith('project-jackshaft-') || id === 'project-rear-hub';
  project.partModels = project.partModels!.filter((model) => included(model.partId));
  project.mapping.mappings = project.mapping.mappings.filter((entry) => included(entry.partId));
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(project),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=local&nav=nav.jackshaft.assembly');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-load-complete', 'true');
  const fullCount = await viewer.getAttribute('data-visible-meshes');
  expect(Number(fullCount)).toBeGreaterThan(25);
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(page.getByLabel('Fade surroundings')).toBeChecked();
  await page.getByLabel('Cutaway', { exact: true }).check();
  await expect(page.getByRole('slider', { name: 'Section position' })).toHaveValue('0.5');

  const tree = page.locator('.parts-tree');
  if (!(await tree.isVisible()))
    await page.getByRole('button', { name: 'Parts', exact: true }).click();
  const expandAssembly = tree.getByRole('button', {
    name: 'Expand Jackshaft assembly',
    exact: true,
  });
  if (await expandAssembly.isVisible()) await expandAssembly.click();
  await tree.getByRole('button', { name: 'Expand Jackshaft bearings', exact: true }).click();
  await tree.getByRole('button', { name: 'Jackshaft Bearing Left', exact: true }).click();
  await expect(page.locator('.inspection-footer')).toContainText(
    'Selected part stays solid and uncut.',
  );
  await expect(viewer).toHaveAttribute('data-visible-meshes', fullCount!);
  await page.getByRole('button', { name: 'Section axis Z', exact: true }).click();
  const position = page.getByRole('slider', { name: 'Section position' });
  await position.fill('0.25');
  await expect(position).toHaveValue('0.25');
  await page.getByRole('button', { name: 'Flip cutaway side' }).click();
  await expect(page.getByRole('button', { name: 'Flip cutaway side' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Fade surroundings').uncheck();
  await expect(page.getByLabel('Fade surroundings')).not.toBeChecked();
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await position.fill('0.3');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '2');
  await page.getByRole('button', { name: 'Show assembly', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', fullCount!);
  await page.getByRole('button', { name: 'Isolate', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#component-details')).toBeHidden();
  await expect(page.getByLabel('Cutaway', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toBeFocused();
  await expect(position).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reassemble' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '25');
  await page.getByRole('button', { name: 'Reassemble' }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', fullCount!);
  await page.getByRole('button', { name: 'Complete motorcycle', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspect', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('section controls work with a keyboard and Escape restores the assembled view', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nav=nav.rear-wheel.assembly');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByLabel('Cutaway', { exact: true }).check();
  const position = page.getByRole('slider', { name: 'Section position' });
  await position.focus();
  await page.keyboard.press('Home');
  await expect(position).toHaveValue('0');
  await page.keyboard.press('End');
  await expect(position).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(position).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reassemble' })).toBeFocused();
});

test('inspection leaves an operable viewport and exit on narrow and short screens', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nav=nav.rear-wheel.assembly');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('button', { name: 'Inspect', exact: true }).click();
  await page.getByLabel('Cutaway', { exact: true }).check();
  await page.getByRole('slider', { name: 'Section position' }).fill('0.6');
  await page.screenshot({ path: testInfo.outputPath('inspection-phone.png') });
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  expect((await viewer.boundingBox())!.height).toBeGreaterThan(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await viewer.boundingBox())!.height).toBeGreaterThan(70);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reassemble' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('retains inspection controls when surrounding geometry arrives later', async ({ page }) => {
  const project = createProjectWorkspace(oemCatalog);
  const included = new Set(['project-seat', 'project-rear-hub']);
  project.partModels = project.partModels!.filter((model) => included.has(model.partId));
  project.mapping.mappings = project.mapping.mappings.filter((entry) => included.has(entry.partId));
  expect(project.partModels).toHaveLength(2);
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(project),
  );
  const seatURL = projectPartsAsset.models!.find((model) => model.id === 'seat')!.url;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/parts/*.glb?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname + url.search !== seatURL) await pending;
    await route.fulfill({ contentType: 'model/gltf-binary', body: seatGlb(false) });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?workspace=local&part=project-seat');
    const viewer = page.getByTestId('viewer');
    await expect(viewer).toHaveAttribute('data-loaded-models', '1');
    await expect(viewer).toHaveAttribute('data-load-complete', 'false');
    await page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await page.getByLabel('Cutaway', { exact: true }).check();
    await page.getByRole('button', { name: 'Section axis Y', exact: true }).click();
    await page.getByRole('slider', { name: 'Section position' }).fill('0.3');
    release();
    await expect(viewer).toHaveAttribute('data-load-complete', 'true');
    await expect(viewer).toHaveAttribute('data-visible-meshes', '2');
    await expect(page.getByLabel('Fade surroundings')).toBeChecked();
    await expect(page.getByLabel('Cutaway', { exact: true })).toBeChecked();
    await expect(page.getByRole('slider', { name: 'Section position' })).toHaveValue('0.3');
    await expect(page.getByRole('button', { name: 'Section axis Y', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(viewer).toHaveAttribute('data-visible-meshes', '2');
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
