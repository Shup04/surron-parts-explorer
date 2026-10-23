import { expect, test } from '@playwright/test';

test('project parts load together and isolate the frame and purple swingarm', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
      errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?workspace=project');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '48');
  await page.screenshot({ path: testInfo.outputPath('project-assembly.png'), fullPage: true });
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Frame and subframe', exact: true }).click();
  await tree.getByRole('button', { name: 'Main frame', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await expect(page.getByTestId('geometry-unassigned')).toHaveCount(0);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: testInfo.outputPath('main-frame.png'), fullPage: true });
  await page.goto('/?workspace=project&nav=nav.swingarm.arm');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.screenshot({ path: testInfo.outputPath('purple-swingarm.png'), fullPage: true });
  await page.reload();
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.goto('/?workspace=project&nav=frame');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '7');
  await page.goto('/');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '48');
  expect(errors).toEqual([]);
});
