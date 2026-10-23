import { expect, test } from '@playwright/test';

test('the portal exposes a standalone manifest, app icons and accessible viewport metadata', async ({
  page,
  request,
}) => {
  await page.goto('/?demo=1');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /viewport-fit=cover/,
  );
  await expect(page.locator('meta[name="viewport"]')).not.toHaveAttribute(
    'content',
    /user-scalable=no|maximum-scale=1/,
  );
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    '/icons/apple-touch-icon.png',
  );
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});

test('installation is optional and a browser invitation is used only after a deliberate tap', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await page.locator('.workspace-tools > summary').click();
  await expect(page.locator('.app-install')).toBeVisible();
  await page.evaluate(() => {
    const state = window as Window & { installationCalls?: number };
    state.installationCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        state.installationCalls!++;
        return { outcome: 'dismissed' };
      },
    });
    window.dispatchEvent(event);
  });
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { installationCalls?: number }).installationCalls,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  await expect(page.locator('.app-install-message')).toHaveText(
    'You can install later from your browser’s menu.',
  );
  expect(
    await page.evaluate(
      () => (window as Window & { installationCalls?: number }).installationCalls,
    ),
  ).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('.app-install-status')).toHaveText('App installed');
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
});

test.describe('iPhone installation guidance', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  test('shows home-screen steps without pretending a native installer is available', async ({
    page,
  }) => {
    await page.goto('/?demo=1');
    await page.locator('.workspace-tools > summary').click();
    const summary = page.locator('.app-install-guide > summary');
    await expect(summary).toHaveText('Add to Home Screen');
    await summary.click();
    await expect(page.locator('.app-install-guide')).toContainText('Open as Web App');
    await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
    expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

test('offline launch has a useful recovery screen and reconnect preserves the requested view', async ({
  page,
  context,
}, testInfo) => {
  test.skip(
    !testInfo.config.metadata.production,
    'Offline recovery requires npm run test:mobile after a production build.',
  );
  const path = '/?demo=1&assembly=jackshaft';
  await page.goto(path);
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        }),
      );
  });
  const cached = await page.evaluate(async () => {
    const keys = (await caches.keys()).filter((key) => key.startsWith('surron-offline-'));
    return Promise.all(
      keys.map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname),
      ),
    );
  });
  expect(cached).toEqual([['/offline.html']]);
  await context.setOffline(true);
  await expect(page.locator('.connection-status')).toHaveText(
    'You’re offline. Loaded models remain available.',
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You’re offline' })).toBeVisible();
  expect(new URL(page.url()).search).toBe('?demo=1&assembly=jackshaft');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  expect(new URL(page.url()).search).toBe('?demo=1&assembly=jackshaft');
});
