import { expect, test } from '@playwright/test';

test.describe('short viewport layouts', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('assembly canvas stays inside its allocated space and above the controls', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?demo=1&assembly=jackshaft&part=jackshaft');
    await expect(page.getByTestId('viewer')).toHaveAttribute('data-scene-ready', 'true');
    const canvas = await page.getByTestId('viewer').locator('canvas').boundingBox();
    const allocated = await page.locator('.canvas-wrap').boundingBox();
    const controls = await page.locator('.explosion-slider').boundingBox();
    expect(canvas!.height).toBeGreaterThan(0);
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(allocated!.y + allocated!.height + 1);
    expect(canvas!.y + canvas!.height).toBeLessThanOrEqual(controls!.y + 1);
    await expect(page.getByRole('button', { name: 'Reassemble', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Exploded', exact: true }).click();
    await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
    await page.screenshot({ path: testInfo.outputPath('landscape-exploded.png') });
  });

  test('expanded filters and the parts tree remain reachable in a short drawer', async ({
    page,
  }, testInfo) => {
    await page.goto('/?year=2021');
    await page.getByRole('button', { name: 'Parts', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Catalog model year' })).toHaveValue('2021');
    const tree = page.locator('.parts-tree');
    await tree.getByRole('button', { name: 'Expand Frame and subframe', exact: true }).click();
    const bearings = tree.getByRole('button', { name: 'Main frame', exact: true });
    await bearings.scrollIntoViewIfNeeded();
    await expect(bearings).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Close parts navigation' })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('landscape-filtered-navigation.png') });
    await bearings.click();
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Main Frame' })).toBeVisible();
    await expect(page.locator('#parts-navigation')).toBeHidden();
  });

  test('missing geometry actions remain reachable without overlapping the viewer toolbar', async ({
    page,
  }, testInfo) => {
    await page.goto('/?part=occ-lbx2021-p15-r16');
    await expect(page.locator('#component-details')).toBeHidden();
    const empty = page.getByTestId('geometry-unassigned');
    const information = empty.getByRole('button', { name: 'View part information' });
    await information.scrollIntoViewIfNeeded();
    await expect(information).toBeInViewport();
    await information.click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Midshaft right bushing' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close component details' })).toBeInViewport();
    await page.getByRole('button', { name: 'Close component details' }).click();
    await empty.getByText('Model options', { exact: true }).click();
    const editor = empty.getByRole('link', { name: 'Add a part model' });
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath('landscape-missing-geometry.png') });
  });

  test('short phone empty states clear the toolbar and retain their actions', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto('/?part=occ-lbx2021-p15-r16');
    await expect(page.locator('#component-details')).toBeHidden();
    const empty = page.getByTestId('geometry-unassigned');
    const icon = await empty.locator(':scope > svg').boundingBox();
    const toolbar = await page.locator('.viewer-tools').boundingBox();
    expect(icon!.y).toBeGreaterThanOrEqual(toolbar!.y + toolbar!.height);
    await page.screenshot({ path: testInfo.outputPath('short-phone-missing-geometry.png') });
    const information = empty.getByRole('button', { name: 'View part information' });
    await information.scrollIntoViewIfNeeded();
    await expect(information).toBeInViewport();
    await information.click();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Midshaft right bushing' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close component details' }).click();
    await empty.getByText('Model options', { exact: true }).click();
    const editor = empty.getByRole('link', { name: 'Add a part model' });
    await editor.scrollIntoViewIfNeeded();
    await expect(editor).toBeInViewport();
    await expect(editor).toHaveAttribute('href', '/editor');
  });
});
