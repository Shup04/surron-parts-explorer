import { expect, test, type Locator, type Page } from '@playwright/test';

async function focusableBoundary(panel: Locator, edge: 'first' | 'last') {
  await panel.evaluate((element, boundary) => {
    const controls = Array.from(
      element.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]',
      ),
    ).filter((control) => control.getClientRects().length && !control.closest('[inert]'));
    controls[boundary === 'first' ? 0 : controls.length - 1]?.focus();
  }, edge);
}

async function expectFocusBoundary(panel: Locator, edge: 'first' | 'last') {
  await expect
    .poll(() =>
      panel.evaluate((element, boundary) => {
        const controls = Array.from(
          element.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary, [tabindex="0"]',
          ),
        ).filter((control) => control.getClientRects().length && !control.closest('[inert]'));
        return document.activeElement === controls[boundary === 'first' ? 0 : controls.length - 1];
      }, edge),
    )
    .toBe(true);
}

/** Locate a real mesh through hover raycasts, without substituting a DOM click target. */
async function clickBearingInCanvas(page: Page) {
  const canvas = page.getByTestId('viewer').locator('canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const tooltip = page.getByRole('tooltip');
  const columns = [0.5];
  for (let offset = 0.025; offset <= 0.45; offset += 0.025) {
    columns.push(0.5 + offset, 0.5 - offset);
  }
  const rows = [0.5];
  for (let offset = 0.025; offset <= 0.3; offset += 0.025) {
    rows.push(0.5 - offset, 0.5 + offset);
  }
  for (const y of rows) {
    for (const x of columns) {
      const point = { x: bounds!.x + bounds!.width * x, y: bounds!.y + bounds!.height * y };
      await page.mouse.move(point.x, point.y);
      if (
        (await tooltip.isVisible()) &&
        (await tooltip.textContent())?.trim() === 'Left jackshaft bearing'
      ) {
        await page.mouse.click(point.x, point.y);
        return;
      }
    }
  }
  throw new Error('The exploded left bearing did not respond to pointer raycasts in the canvas.');
}

test('overview gives the motorcycle space and keeps side panels optional', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=1');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sur-Ron Light Bee X');
  await expect(page.locator('.catalog-panel')).toBeVisible();
  await expect(page.locator('.detail-panel')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeDisabled();

  const initial = await page.getByTestId('viewer').boundingBox();
  expect(initial!.width).toBeGreaterThan(page.viewportSize()!.width * 0.65);
  expect(initial!.height).toBeGreaterThan(page.viewportSize()!.height * 0.6);
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  await expect(page.locator('.catalog-panel')).not.toBeVisible();
  await expect
    .poll(async () => (await page.getByTestId('viewer').boundingBox())!.width)
    .toBeGreaterThan(initial!.width);

  const canvas = page.getByTestId('viewer').locator('canvas');
  const bounds = (await canvas.boundingBox())!;
  const start = { x: bounds.x + bounds.width * 0.82, y: bounds.y + bounds.height * 0.6 };
  // Move outside the canvas before captures so hover highlights cannot satisfy these checks.
  const capture = async (name: string) => {
    await page.mouse.move(4, 4);
    return canvas.screenshot({ path: testInfo.outputPath(`camera-${name}.png`) });
  };
  const original = await capture('original');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 150, start.y - 75, { steps: 12 });
  await page.mouse.up();
  const orbited = await capture('orbit');
  expect(orbited.equals(original), 'Orbit must change the rendered camera view').toBe(false);

  await page.mouse.move(start.x, start.y);
  await page.mouse.wheel(0, -240);
  const zoomed = await capture('zoom');
  expect(zoomed.equals(orbited), 'Wheel zoom must change the rendered camera view').toBe(false);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(start.x + 70, start.y + 45, { steps: 10 });
  await page.mouse.up({ button: 'right' });
  const panned = await capture('pan');
  expect(panned.equals(zoomed), 'Right-button drag must pan the rendered camera view').toBe(false);

  await page.getByRole('button', { name: 'Reset camera', exact: true }).click();
  const reset = await capture('reset');
  expect(reset.equals(panned), 'Reset must restore a different camera view after navigation').toBe(
    false,
  );
  expect(new URL(page.url()).searchParams.has('assembly')).toBe(false);
  await expect(page.locator('.detail-panel')).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('overview-expanded-viewport.png') });
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeVisible();
});

test('exploded bearing raycast and tree selection address the same component', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?demo=1');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  await page.getByRole('button', { name: 'Expand Motor & drivetrain', exact: true }).click();
  await page.locator('.tree-select').filter({ hasText: 'Jackshaft assembly' }).click();
  await expect(page).toHaveURL(/assembly=jackshaft/);
  const slider = page.getByRole('slider', { name: 'Explosion amount' });
  await expect(slider).toHaveValue('0');
  if (await page.getByRole('button', { name: 'Close component details' }).isVisible()) {
    await page.getByRole('button', { name: 'Close component details' }).click();
  }
  await page.getByRole('button', { name: 'Exploded', exact: true }).click();
  await expect(slider).toHaveValue('1');
  await clickBearingInCanvas(page);
  await expect(page).toHaveURL(/part=bearing-left/);
  await expect(
    page.getByRole('heading', { level: 2, name: 'Left jackshaft bearing' }),
  ).toBeVisible();
  const treeBearing = page.locator('.tree-select').filter({ hasText: 'Left jackshaft bearing' });
  await expect(treeBearing).toHaveAttribute('aria-current', 'true');
  await expect(treeBearing).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('bearing-selected-by-raycast.png') });

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () => (await page.getByTestId('viewer').boundingBox())!.width)
    .toBeGreaterThanOrEqual(1280 * 0.5);
  await expect(slider).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reassemble', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('laptop-bearing-details.png') });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.locator('.tree-select').filter({ hasText: 'Right jackshaft bearing' }).click();
  await expect(page).toHaveURL(/part=bearing-right/);
  await treeBearing.click();
  await expect(page).toHaveURL(/part=bearing-left/);
  await expect(treeBearing).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(slider).toHaveValue('0');

  const deepLink = page.url();
  await page.reload();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Left jackshaft bearing' }),
  ).toBeVisible();
  await expect(treeBearing).toHaveAttribute('aria-current', 'true');
  await expect(page).toHaveURL(deepLink);
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await expect(page).toHaveURL(/assembly=jackshaft&part=jackshaft/);
  await expect(page.locator('.detail-panel')).not.toBeVisible();
  await page.getByRole('link', { name: 'Sur-Ron Parts Explorer home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sur-Ron Light Bee X');
  await expect(page.locator('.detail-panel')).not.toBeVisible();
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
  expect(errors).toEqual([]);
});

test.describe('touch layouts', () => {
  test.use({ hasTouch: true });
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 900, height: 1024 },
  ]) {
    test(`${viewport.name} drawers contain focus and leave exploded controls usable`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/?demo=1');
      await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
      const navigation = page.locator('.catalog-panel');
      const parts = page.getByRole('button', { name: 'Parts', exact: true });
      await expect(navigation).not.toBeVisible();
      await expect(page.locator('.detail-panel')).not.toBeVisible();
      await parts.tap();
      await expect(navigation).toBeVisible();
      await focusableBoundary(navigation, 'last');
      await page.keyboard.press('Tab');
      await expectFocusBoundary(navigation, 'first');
      await page.keyboard.press('Shift+Tab');
      await expectFocusBoundary(navigation, 'last');
      const search = page.getByRole('textbox', { name: 'Search parts' });
      await search.focus();
      await page.keyboard.press('Escape');
      await expect(navigation).not.toBeVisible();
      await expect(parts).toBeFocused();

      await parts.tap();
      await search.fill('left jackshaft bearing');
      await page.locator('.search-result').filter({ hasText: 'Left jackshaft bearing' }).tap();
      await expect(page).toHaveURL(/part=bearing-left/);
      await expect(navigation).not.toBeVisible();
      await page.getByRole('button', { name: 'Details', exact: true }).tap();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Left jackshaft bearing' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close component details' }).tap();
      const slider = page.getByRole('slider', { name: 'Explosion amount' });
      await expect(slider).toBeVisible();
      await page.getByRole('button', { name: 'Exploded', exact: true }).tap();
      await expect(slider).toHaveValue('1');
      await page.getByRole('button', { name: 'Reassemble', exact: true }).tap();
      await expect(slider).toHaveValue('0');
      await page.screenshot({
        path: testInfo.outputPath(`${viewport.name}-assembly-controls.png`),
      });

      await page.reload();
      await page.getByRole('button', { name: 'Details', exact: true }).tap();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Left jackshaft bearing' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Close component details' }).tap();
      await page.getByRole('link', { name: 'Sur-Ron Parts Explorer home' }).tap();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sur-Ron Light Bee X');
      await expect(page.locator('.detail-panel')).not.toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
});

test('secondary viewer and developer controls remain accessible through disclosures', async ({
  page,
}) => {
  await page.goto('/?demo=1');
  await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
  const options = page.locator('.viewer-options > summary');
  await options.click();
  await page.getByRole('button', { name: 'Viewer help', exact: true }).click();
  await expect(page.locator('.help-popover')).toBeVisible();
  await expect(page.locator('.viewer-options')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Close viewer help' }).click();
  await options.click();
  await page.getByRole('button', { name: 'Performance diagnostics', exact: true }).click();
  await expect(page.locator('.stats-popover')).toContainText('Visible meshes');
  await page.getByRole('button', { name: 'Close performance diagnostics' }).click();
  await options.click();
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.classList.contains('workspace')))
    .toBe(true);
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  await expect(page.locator('.catalog-panel')).not.toBeVisible();
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search parts' })).toBeVisible();
  await page.locator('.viewer-options > summary').click();
  await page.getByRole('button', { name: 'Toggle fullscreen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.locator('.workspace-tools > summary').click();
  await expect(page.getByRole('link', { name: 'Model editor', exact: true })).toHaveAttribute(
    'href',
    '/editor?demo=1',
  );
  await expect(page.getByRole('link', { name: 'Catalog review', exact: true })).toHaveAttribute(
    'href',
    '/catalog',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('.workspace-tools')).not.toHaveAttribute('open', '');
});
