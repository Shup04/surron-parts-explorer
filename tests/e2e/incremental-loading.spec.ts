import { expect, test } from '@playwright/test';
import { projectPartsAsset } from '../../src/config/project-parts';
import { seatGlb } from './fixtures/part-glb';

const total = projectPartsAsset.models!.length;
const seatURL = projectPartsAsset.models!.find((model) => model.id === 'seat')!.url;
const frameURL = projectPartsAsset.models!.find((model) => model.id === 'main-frame')!.url;
const fixture = seatGlb(false);

test('opens the requested part before background files finish and retries only a failed file', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const requests: string[] = [];
  let release!: () => void;
  const background = new Promise<void>((resolve) => {
    release = resolve;
  });
  let frameAttempts = 0;
  await page.route('**/parts/*.glb?*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname + url.search;
    requests.push(path);
    if (path === frameURL && ++frameAttempts === 1) {
      await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
      return;
    }
    if (path !== seatURL) await background;
    await route.fulfill({ contentType: 'model/gltf-binary', body: fixture });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project&nav=nav.body.seat');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(viewer).toHaveAttribute('data-load-complete', 'false');
  await expect(viewer).toHaveAttribute('data-failed-models', '1');
  await expect(page.getByLabel('Model loading')).toContainText(`1 of ${total} models loaded`);
  await expect(page.getByLabel('Failed model files')).toContainText('Main Frame.glb');
  expect(requests[0]).toBe(seatURL);
  expect(requests.length).toBeLessThanOrEqual(5); // One success, one failure, at most three in flight.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('partial-loading-mobile.png') });
  release();
  await expect(viewer).toHaveAttribute('data-load-complete', 'true');
  await expect(viewer).toHaveAttribute('data-loaded-models', String(total - 1));
  await page.getByRole('button', { name: 'Retry Main Frame.glb', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-loaded-models', String(total));
  await expect(page.getByLabel('Model loading')).toHaveCount(0);
  await expect(viewer).toHaveAttribute('data-visible-meshes', String(total));
  expect(requests.filter((url) => url === seatURL)).toHaveLength(1);
  expect(requests).toHaveLength(total + 1);
  expect(errors).toEqual([]);
});

async function addTwoLocalParts(page: import('@playwright/test').Page) {
  await page.goto('/editor?workspace=local');
  const role = page.getByRole('combobox', { name: '1. Choose the bike part' });
  for (const [id, name] of [
    ['nav.body.seat', 'Seat.glb'],
    ['nav.body.front-fender', 'Fender.glb'],
  ]) {
    await expect(role).toBeEnabled();
    await role.selectOption(id);
    await page.getByLabel('Import part GLB').setInputFiles({
      name,
      mimeType: 'model/gltf-binary',
      buffer: fixture,
    });
    await expect(page.getByLabel('Added parts')).toContainText(name);
  }
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
}

test('replaces one editor part without fetching unchanged blobs or replacing the canvas', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const requests: string[] = [];
    Object.assign(window, { modelRequests: requests });
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith('blob:')) requests.push(url);
      return original(input, init);
    };
  });
  await addTwoLocalParts(page);
  const requests = () =>
    page.evaluate(() => (window as unknown as { modelRequests: string[] }).modelRequests);
  expect(await requests()).toHaveLength(2);
  const canvas = await page.locator('.editor-canvas canvas').elementHandle();
  expect(canvas).not.toBeNull();
  await page
    .getByRole('combobox', { name: '1. Choose the bike part' })
    .selectOption('nav.body.seat');
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'replacement-seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: fixture,
  });
  await expect(page.getByLabel('Editor status')).toContainText('Seat replaced');
  await expect(page.getByLabel('Added parts')).toContainText('replacement-seat.glb');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await requests()).toHaveLength(3);
  await page.getByLabel('Import part GLB').setInputFiles({
    name: 'broken-seat.glb',
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from('invalid'),
  });
  await expect(page.getByRole('alert', { name: 'Editor error' })).toBeVisible();
  await expect(page.getByLabel('Added parts')).toContainText('replacement-seat.glb');
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await requests()).toHaveLength(4);
  expect(errors).toEqual([]);
});

test('restores an editor workspace with a failed part and recovers it in place', async ({
  page,
}) => {
  await addTwoLocalParts(page);
  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Local only');
  await page.addInitScript(() => {
    const createURL = URL.createObjectURL.bind(URL);
    let seatURL = '';
    let failed = false;
    URL.createObjectURL = (blob) => {
      const url = createURL(blob);
      if (blob instanceof File && blob.name.includes('nav.body.seat')) seatURL = url;
      return url;
    };
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === seatURL && !failed) {
        failed = true;
        return Promise.resolve(new Response('Temporary failure', { status: 503 }));
      }
      return fetch(input, init);
    };
  });
  await page.reload();
  await expect(page.getByLabel('Model loading')).toContainText('1 of 2 models loaded');
  await expect(page.getByLabel('Added parts').locator('li')).toHaveCount(2);
  const canvas = await page.locator('.editor-canvas canvas').elementHandle();
  await page.getByRole('button', { name: 'Retry Seat.glb', exact: true }).click();
  await expect(page.getByLabel('Model loading')).toHaveCount(0);
  await expect(page.getByLabel('Editor status')).toContainText(
    '2 models loaded. All files are available.',
  );
  expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.getByRole('alert', { name: 'Editor error' })).toHaveCount(0);
});
