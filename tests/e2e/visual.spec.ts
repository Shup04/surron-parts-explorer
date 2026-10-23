import { expect, test, type Page, type TestInfo } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'tablet', width: 900, height: 1024 },
  { name: 'phone', width: 390, height: 844 },
];

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'The interface must fit the viewport without horizontal page scrolling',
  ).toBe(true);
}

async function openParts(page: Page) {
  await expect(page.locator('.explorer-shell')).toHaveAttribute('aria-busy', 'false');
  if (!(await page.locator('.catalog-panel').isVisible())) {
    await page.getByRole('button', { name: 'Parts', exact: true }).click();
  }
  await expect(page.getByRole('textbox', { name: 'Search parts', exact: true })).toBeVisible();
}

async function closeDetails(page: Page) {
  const close = page.getByRole('button', { name: 'Close component details', exact: true });
  if (await close.isVisible()) await close.click();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await expectNoHorizontalOverflow(page);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' });
}

/** Check the rendered tokens rather than keeping brittle pixel baselines for a live WebGL canvas. */
async function expectReadableNeutralTheme(page: Page) {
  const theme = await page.evaluate(async () => {
    await document.fonts.ready;
    const sample = document.createElement('span');
    // Reduced-motion styles still use a short transition. Read the final token colors,
    // not the first interpolated frame while repeatedly changing this probe's color.
    sample.style.setProperty('transition', 'none', 'important');
    document.body.appendChild(sample);
    const resolveColor = (token: string) => {
      sample.style.color = `var(${token})`;
      const components = getComputedStyle(sample).color.match(/[\d.]+/g);
      return components!.slice(0, 3).map(Number);
    };
    const colors = Object.fromEntries(
      ['--bg', '--panel', '--raised', '--text', '--muted', '--accent'].map((token) => [
        token,
        resolveColor(token),
      ]),
    );
    sample.remove();
    return { colors, font: getComputedStyle(document.body).fontFamily };
  });
  const luminance = (rgb: number[]) =>
    rgb
      .map((value) => value / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
      .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (first: number[], second: number[]) => {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  expect(theme.font).toMatch(/Geist/i);
  expect(theme.font).not.toMatch(/monospace/i);
  for (const token of ['--bg', '--panel', '--raised']) {
    const channels = theme.colors[token];
    expect(
      Math.max(...channels) - Math.min(...channels),
      `${token} should be neutral`,
    ).toBeLessThanOrEqual(20);
    expect(
      contrast(theme.colors['--text'], channels),
      `Primary text on ${token}`,
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrast(theme.colors['--muted'], channels),
      `Secondary text on ${token}`,
    ).toBeGreaterThanOrEqual(4.5);
  }
  expect(theme.colors['--accent'][2], 'The shared accent should be cool blue').toBeGreaterThan(
    theme.colors['--accent'][0],
  );
}

for (const viewport of viewports) {
  test.describe(`${viewport.name} visual system`, () => {
    test.use({ viewport, hasTouch: viewport.width <= 900 });

    test('explorer states and mapping studio remain legible and cohesive', async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?demo=1');
      await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
      await expect(page.getByTestId('viewer')).toHaveAttribute('data-visible-meshes', /^[1-9]\d*$/);
      await expectReadableNeutralTheme(page);
      await expect(page.locator('.detail-panel')).not.toBeVisible();
      await capture(page, testInfo, '01-motorcycle-overview');

      const partsButton = page.getByRole('button', { name: 'Parts', exact: true });
      const partsBounds = (await partsButton.boundingBox())!;
      expect(
        partsBounds.height,
        'Primary viewer controls retain touch targets',
      ).toBeGreaterThanOrEqual(44);
      await openParts(page);
      await page.getByRole('button', { name: 'Expand Motor & drivetrain', exact: true }).click();
      await page.locator('.tree-select').filter({ hasText: 'Jackshaft assembly' }).click();
      await expect(page).toHaveURL(/assembly=jackshaft/);
      await closeDetails(page);
      const slider = page.getByRole('slider', { name: 'Explosion amount' });
      await expect(slider).toHaveValue('0');
      await capture(page, testInfo, '02-selected-assembly');

      await page.getByRole('button', { name: 'Exploded', exact: true }).click();
      await expect(slider).toHaveValue('1');
      await expect(page.getByRole('button', { name: 'Reassemble', exact: true })).toBeInViewport();
      await capture(page, testInfo, '03-exploded-assembly');
      await openParts(page);
      await page.locator('.tree-select').filter({ hasText: 'Left jackshaft bearing' }).click();
      await expect(page).toHaveURL(/part=bearing-left/);
      await expect(
        page.getByRole('heading', { level: 2, name: 'Left jackshaft bearing' }),
      ).toBeVisible();
      await capture(page, testInfo, '04-part-details');
      await closeDetails(page);
      await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
      await expect(slider).toHaveValue('0');

      // The real reference catalog remains separate from the rendered demonstration geometry.
      await page.goto('/?source=lbx2021&year=2021');
      await openParts(page);
      await page
        .getByRole('textbox', { name: 'Search parts', exact: true })
        .fill('61234-YQ2A-0000');
      const result = page.locator('.search-result').filter({ hasText: '61234-YQ2A-0000' });
      await expect(result).toHaveCount(0);
      await capture(page, testInfo, '05-modeled-search');
      await page.goto('/?part=occ-lbx2021-p15-r16&source=lbx2021&year=2021');
      await expect(page.locator('.oem-number')).toHaveText('61234-YQ2A-0000');
      await expect(page.locator('.oem-number')).toHaveCSS('font-family', /monospace/i);
      await expect(page.getByTestId('geometry-unassigned')).toBeVisible();
      await capture(page, testInfo, '06-oem-part-details');

      await page.goto('/editor?demo=1');
      await expect(page.getByRole('heading', { name: 'Model mapping studio' })).toBeVisible();
      await expect(page.locator('.editor-canvas canvas')).toBeVisible();
      await expectReadableNeutralTheme(page);
      await capture(page, testInfo, '07-model-mapping-studio');
      const target = page.getByRole('combobox', { name: 'Catalog part', exact: true });
      await target.scrollIntoViewIfNeeded();
      await target.selectOption('bearing-left');
      await expect(target).toHaveValue('bearing-left');
      await expect(page.getByLabel('Human-readable name', { exact: true })).toHaveValue(
        'Left jackshaft bearing',
      );
      await capture(page, testInfo, '08-studio-inspector');

      await page.goto('/catalog');
      const reviewHeading = page.getByRole('heading', { name: 'OEM source review' });
      await expect(reviewHeading).toBeVisible();
      await page.locator('.review-table-scroll tbody tr').first().locator('button').first().click();
      if (viewport.width <= 600) {
        expect(
          (await reviewHeading.boundingBox())!.height,
          'The phone heading has its own row',
        ).toBeLessThan(32);
      }
      await capture(page, testInfo, '09-catalog-review');
      expect(errors).toEqual([]);
    });
  });
}
