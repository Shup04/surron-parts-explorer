import { expect, test } from '@playwright/test';

test('the footpeg assembly opens pegs, brackets and bolts in one exploded view', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Footpegs and side stand', exact: true }).click();
  await tree.getByRole('button', { name: 'Footpeg assembly', exact: true }).click();
  await expect(page).toHaveURL(/nav=nav\.footpegs-stand\.footpegs/);
  await expect(viewer).toHaveAttribute('data-visible-meshes', '8');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.screenshot({
    path: testInfo.outputPath('footpeg-assembly-exploded.png'),
    fullPage: true,
  });
  await expect(
    tree.getByRole('button', { name: 'Collapse Footpeg assembly', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  await tree.getByRole('button', { name: 'Left footpeg', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '8');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.reload();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '8');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('0');
  await page.screenshot({
    path: testInfo.outputPath('footpeg-assembly-assembled.png'),
    fullPage: true,
  });
});

test('footpeg brackets include their mounted bolts and expose the 6 mm Allen key', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?nav=nav.footpegs-stand.brackets');
  const viewer = page.getByTestId('viewer');
  await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
  await expect(viewer).toHaveAttribute('data-visible-meshes', '6');
  await expect(page.getByRole('slider', { name: 'Explosion amount' })).toHaveValue('1');
  await page.screenshot({ path: testInfo.outputPath('brackets-exploded.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Footpeg brackets', exact: true }).click();
  await tree.getByRole('button', { name: 'Expand Bracket bolts', exact: true }).click();
  await tree.getByRole('button', { name: 'Footpeg Bracket Bolt Left Upper', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '6');
  const details = page.locator('.part-details');
  await expect(details).toContainText('B3-001-08-020-F0');
  await expect(details.locator('.definition-pair').filter({ hasText: 'Allen key' })).toHaveText(
    'Allen key6 mm',
  );
  await expect(details).toContainText('Raw aluminum');
  await page.mouse.move(5, 5);
  await page.screenshot({ path: testInfo.outputPath('brackets-assembled.png'), fullPage: true });
  await page.getByRole('button', { name: 'Isolate', exact: true }).click();
  await expect(viewer).toHaveAttribute('data-visible-meshes', '1');
  await page.screenshot({ path: testInfo.outputPath('peg-bolt.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('cover screws retain their tool sizes and assembly scopes after reload', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [role, part, key, count] of [
    ['nav.motor.guard', 'project-bolt-motor-cover-upper', '4 mm', '4'],
    ['nav.swingarm.guard', 'project-bolt-jackshaft-cover-left-upper', '3 mm', '4'],
  ]) {
    await page.goto(`/?nav=${role}&part=${part}`);
    const viewer = page.getByTestId('viewer');
    await expect(viewer).toHaveAttribute('data-scene-ready', 'true');
    await expect(viewer).toHaveAttribute('data-visible-meshes', count);
    await expect(page.locator('.definition-pair').filter({ hasText: 'Allen key' })).toContainText(
      key,
    );
    await page.getByRole('button', { name: 'Reassemble', exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`${part}.png`), fullPage: true });
    await page.reload();
    await expect(viewer).toHaveAttribute('data-visible-meshes', count);
    await expect(page.locator('.definition-pair').filter({ hasText: 'Allen key' })).toContainText(
      key,
    );
  }
});
