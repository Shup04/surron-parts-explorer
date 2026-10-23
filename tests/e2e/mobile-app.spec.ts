import { expect, test, type CDPSession, type Page } from '@playwright/test';
import rearWheel from '../../data/models/rear-wheel-assembly.json';
import { oemCatalog } from '../../src/data/oem';
import { createProjectWorkspace } from '../../src/editor/project-workspace';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

async function useWheelModels(page: Page, hubOnly = false) {
  const project = createProjectWorkspace(oemCatalog);
  const ids = new Set(
    hubOnly ? ['project-rear-hub'] : rearWheel.instances.map((part) => `project-${part.id}`),
  );
  project.partModels = project.partModels!.filter((model) => ids.has(model.partId));
  project.mapping.mappings = project.mapping.mappings.filter((mapping) => ids.has(mapping.partId));
  await page.addInitScript(
    (saved) => localStorage.setItem('surron-editor-project', saved),
    JSON.stringify(project),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

async function renderedFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function expectFixedViewport(page: Page) {
  const dimensions = await page.evaluate(() => ({
    x: scrollX,
    y: scrollY,
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
  }));
  expect(dimensions.x).toBe(0);
  expect(dimensions.y).toBe(0);
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
}

type Point = { x: number; y: number };

/** Native Chromium touch input exercises scrolling and synthesized click behavior. */
async function gesture(client: CDPSession, page: Page, frames: Point[][], cancel = false) {
  const touchPoints = (points: Point[]) =>
    points.map((point, id) => ({ ...point, id, radiusX: 4, radiusY: 4, force: 1 }));
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: touchPoints(frames[0]),
  });
  for (const points of frames.slice(1)) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touchPoints(points),
    });
    await renderedFrame(page);
  }
  await client.send('Input.dispatchTouchEvent', {
    type: cancel ? 'touchCancel' : 'touchEnd',
    touchPoints: [],
  });
  await renderedFrame(page);
}

test('one-finger rotation and two-finger zoom/pan stay inside the model without selecting or refreshing', async ({
  page,
}) => {
  await useWheelModels(page, true);
  await page.goto('/?workspace=local');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  const canvas = viewer.locator('canvas');
  await renderedFrame(page);
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const client = await page.context().newCDPSession(page);
  const url = page.url();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  const beforeRotate = await canvas.screenshot();
  await gesture(
    client,
    page,
    Array.from({ length: 9 }, (_, step) => [{ x: center.x + step * 10, y: center.y + step * 5 }]),
  );
  expect(
    (await canvas.screenshot()).equals(beforeRotate),
    'Rotation must change the rendered view',
  ).toBe(false);
  const beforePinch = await canvas.screenshot();
  await gesture(
    client,
    page,
    Array.from({ length: 9 }, (_, step) => [
      { x: center.x - 25 - step * 5, y: center.y },
      { x: center.x + 25 + step * 5, y: center.y },
    ]),
  );
  expect(
    (await canvas.screenshot()).equals(beforePinch),
    'Pinching must change the rendered view',
  ).toBe(false);
  const beforePan = await canvas.screenshot();
  await gesture(
    client,
    page,
    Array.from({ length: 9 }, (_, step) => [
      { x: center.x - 25 + step * 4, y: center.y + step * 6 },
      { x: center.x + 25 + step * 4, y: center.y + step * 6 },
    ]),
  );
  expect(
    (await canvas.screenshot()).equals(beforePan),
    'Two-finger panning must change the rendered view',
  ).toBe(false);
  await expect(page).toHaveURL(url);
  expect(navigations, 'Gestures must not trigger a page refresh').toBe(0);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(page.locator('#component-details')).toBeHidden();
  await expectFixedViewport(page);
  await client.detach();
});

test('returning a drag to its start or cancelling it does not select, and subsequent taps enter wheel then hub', async ({
  page,
}) => {
  await useWheelModels(page, true);
  await page.goto('/?workspace=local');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '1');
  const canvas = page.getByTestId('viewer').locator('canvas');
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const client = await page.context().newCDPSession(page);
  const url = page.url();
  await gesture(client, page, [[center], [{ x: center.x + 70, y: center.y }], [center]]);
  await expect(page).toHaveURL(url);
  await gesture(client, page, [[center], [{ x: center.x + 30, y: center.y + 25 }]], true);
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: 'Reset camera', exact: true }).tap();
  await renderedFrame(page);
  await canvas.tap();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await expect(page.locator('#component-details')).toBeHidden();
  await canvas.tap();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await expect(page.locator('#component-details')).toBeHidden();
  await canvas.tap();
  await expect(page).toHaveURL(/part=project-rear-hub/);
  await page.getByRole('button', { name: 'Details', exact: true }).tap();
  await expect(page.locator('#component-details h2')).toHaveText('Rear Hub');
  await expectFixedViewport(page);
  await client.detach();
});

test('phone wheel navigation leaves the model usable and preserves nested scope through history', async ({
  page,
}, testInfo) => {
  await useWheelModels(page);
  await page.goto('/?workspace=local');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  const parts = page.getByRole('button', { name: 'Parts', exact: true });
  const details = page.getByRole('button', { name: 'Details', exact: true });
  await parts.tap();
  const search = page.getByRole('textbox', { name: 'Search parts' });
  await expect(search).not.toBeFocused();
  const overviewUrl = page.url();
  await page.goBack();
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(page).toHaveURL(overviewUrl);
  await parts.tap();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Rear wheel', exact: true }).tap();
  await tree.getByRole('button', { name: 'Rear wheel assembly', exact: true }).tap();
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(page.locator('#component-details')).toBeHidden();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  await expect(page.getByRole('button', { name: 'Reassemble', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('phone-wheel.png') });
  await parts.tap();
  await tree.getByRole('button', { name: 'Hub', exact: true }).tap();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveCount(0);
  await details.tap();
  await expect(page.locator('#component-details h2')).toHaveText('Hub');
  await page.goBack();
  await expect(page.locator('#component-details')).toBeHidden();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await page.goBack();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  await expect(page.locator('#component-details')).toBeHidden();
  await page.goForward();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.hub(?:&|$)/);
  await page.reload();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  await expect(page.locator('#component-details')).toBeHidden();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).tap();
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  await expectFixedViewport(page);
});

test('drawers scroll independently and phone, landscape and tablet controls remain reachable', async ({
  page,
}, testInfo) => {
  await useWheelModels(page);
  await page.goto('/?workspace=local&nav=nav.rear-wheel.assembly');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 844, height: 390 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button', { name: 'Parts', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Reassemble', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Reassemble', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
    await page.getByRole('button', { name: 'Exploded', exact: true }).tap();
    await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
    const canvas = (await page.getByTestId('viewer').locator('canvas').boundingBox())!;
    expect(canvas.height).toBeGreaterThan(100);
    await expectFixedViewport(page);
    await page.screenshot({
      path: testInfo.outputPath(`wheel-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 390, height: 600 });
  await page.getByRole('button', { name: 'Parts', exact: true }).tap();
  const search = page.getByRole('textbox', { name: 'Search parts' });
  await expect(search).not.toBeFocused();
  await search.tap();
  await search.fill('bolt');
  await expect(search).toBeFocused();
  expect(
    await search.evaluate((input) => parseFloat(getComputedStyle(input).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  // A compact viewport also exercises controls while a keyboard consumes vertical space.
  await page.setViewportSize({ width: 390, height: 360 });
  const results = page.locator('.search-result');
  await expect(results).toHaveCount(11);
  await results.last().scrollIntoViewIfNeeded();
  await expect(results.last()).toBeInViewport();
  const close = page.getByRole('button', { name: 'Close parts navigation', exact: true });
  await expect(close).toBeInViewport();
  await expectFixedViewport(page);
  await close.tap();
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Parts', exact: true })).toBeFocused();
});

test('asset and graphics recovery preserve the selected assembly without reloading the page', async ({
  page,
}, testInfo) => {
  await useWheelModels(page, true);
  const hubAsset = /\/parts\/Rear(?:%20| )Hub\.glb(?:\?|$)/;
  await page.route(hubAsset, (route) => route.abort('failed'));
  await page.goto('/?workspace=local&nav=nav.rear-wheel.hub');
  const viewer = page.getByTestId('viewer');
  await expect(page.getByRole('button', { name: 'Retry loading', exact: true })).toBeVisible();
  await page.unroute(hubAsset);
  await page.getByRole('button', { name: 'Retry loading', exact: true }).tap();
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  const url = page.url();
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  const hasLossExtension = await viewer.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    extension?.loseContext();
    return !!extension;
  });
  expect(hasLossExtension, 'Chromium must expose its WebGL context-loss test extension').toBe(true);
  await expect(viewer).toHaveAttribute('data-scene-ready', 'false');
  await page.getByRole('button', { name: 'Restore 3D view', exact: true }).tap();
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(page).toHaveURL(url);
  expect(navigations).toBe(0);
  await expect(page.locator('#component-details')).toBeHidden();
  await renderedFrame(page);
  await page.screenshot({ path: testInfo.outputPath('phone-recovered-hub.png') });
});

for (const panel of [
  { button: 'Parts', selector: '#parts-navigation' },
  { button: 'Details', selector: '#component-details' },
]) {
  test(`${panel.button} restores through Forward and reload without adding extra Back steps`, async ({
    page,
  }) => {
    await useWheelModels(page);
    await page.goto('/?workspace=local');
    await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
    const overviewUrl = page.url();
    await page.getByRole('button', { name: 'Parts', exact: true }).tap();
    const tree = page.locator('.parts-tree');
    await tree.getByRole('button', { name: 'Expand Rear wheel', exact: true }).tap();
    await tree.getByRole('button', { name: 'Rear wheel assembly', exact: true }).tap();
    await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
    const wheelUrl = page.url();
    await page.getByRole('button', { name: panel.button, exact: true }).tap();
    await expect(page.locator(panel.selector)).toBeVisible();
    await page.goBack();
    await expect(page.locator(panel.selector)).toBeHidden();
    await expect(page).toHaveURL(wheelUrl);
    await page.goForward();
    await expect(page.locator(panel.selector)).toBeVisible();
    await expect(page).toHaveURL(wheelUrl);
    await page.reload();
    await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', '19');
    await expect(page.locator(panel.selector)).toBeVisible();
    await page.goBack();
    await expect(page.locator(panel.selector)).toBeHidden();
    await expect(page).toHaveURL(wheelUrl);
    await page.goBack();
    await expect(page).toHaveURL(overviewUrl);
    await expect(page.locator('#parts-navigation')).toBeHidden();
    await expect(page.locator('#component-details')).toBeHidden();
    await expectFixedViewport(page);
  });
}

test('registered project phone views stay clear and source-filter navigation closes Parts', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  await expect(page.locator('.asset-notice')).toHaveCount(0);
  await renderedFrame(page);
  await expectFixedViewport(page);
  await page.screenshot({ path: testInfo.outputPath('phone-project-overview.png') });
  const parts = page.getByRole('button', { name: 'Parts', exact: true });
  await parts.tap();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).not.toBeFocused();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Rear wheel', exact: true }).tap();
  await tree.getByRole('button', { name: 'Expand Rear wheel assembly', exact: true }).tap();
  await expect(tree.getByRole('button', { name: 'Hub', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-project-parts.png') });
  await tree.getByRole('button', { name: 'Rear wheel assembly', exact: true }).tap();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '19');
  await parts.tap();
  await tree.getByRole('button', { name: 'Disc', exact: true }).tap();
  await page.getByRole('button', { name: 'Details', exact: true }).tap();
  await expect(page.locator('#component-details h2')).toHaveText('Rear Brake Disc');
  await expect(
    page.getByRole('button', { name: 'Close component details', exact: true }),
  ).toBeInViewport();
  await renderedFrame(page);
  await page.screenshot({ path: testInfo.outputPath('phone-project-part-details.png') });
  await expectFixedViewport(page);

  await page.goto('/?nav=nav.rear-wheel.assembly&year=2021');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '19');
  await parts.tap();
  await page.getByRole('combobox', { name: 'Catalog model year', exact: true }).selectOption('');
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(page).not.toHaveURL(/year=/);
  await expect(page).toHaveURL(/nav=nav\.rear-wheel\.assembly/);
  await page.goBack();
  await expect(page).toHaveURL(/year=2021/);
  await expect(page.locator('#parts-navigation')).toBeHidden();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '19');
  expect(errors).toEqual([]);
});
