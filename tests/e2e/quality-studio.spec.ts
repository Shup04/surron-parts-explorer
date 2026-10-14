import { expect, test } from '@playwright/test';

test('studio distinguishes inherited mappings and hidden selections without ghost highlights', async ({
  page,
}, testInfo) => {
  await page.goto('/editor?demo=1');
  const objects = page.locator('.editor-object-name');
  const inherited = objects.filter({ hasText: '(unnamed object)' }).first();
  await inherited.click();
  await expect(inherited).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Unmap', exact: true })).toBeDisabled();
  await expect(page.locator('#inherited-mapping-note')).toContainText('Select that parent');

  const frame = objects.filter({ has: page.locator('span', { hasText: /^frame$/ }) });
  await frame.click();
  await expect(page.getByRole('button', { name: 'Unmap', exact: true })).toBeEnabled();
  await expect(inherited).toHaveAttribute('aria-pressed', 'false');

  const collapse = page.getByRole('button', { name: 'Collapse frame', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await collapse.click();
  await expect(page.getByRole('button', { name: 'Expand frame', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: 'Expand frame', exact: true }).click();

  const root = objects.filter({
    has: page.locator('span', { hasText: /^demonstration-motorcycle$/ }),
  });
  await root.click();
  await page.getByRole('button', { name: 'Hide selected', exact: true }).click();
  await expect(root).toContainText('Hidden');
  await expect(inherited).toContainText('Hidden');
  await expect(frame).toContainText('Hidden');
  await page.mouse.move(0, 0);

  // A hidden model must look identical with or without a selected object. This
  // catches helpers that otherwise leave a wireframe box around hidden geometry.
  const canvas = page.locator('.editor-canvas canvas');
  // Element screenshots capture overlaid DOM too. Keep camera-button disabled
  // states out of the comparison so it measures only the rendered scene.
  const sceneOnly = {
    style: '.editor-viewport-controls, .editor-hover { visibility: hidden !important; }',
  };
  await canvas.screenshot({
    ...sceneOnly,
    path: testInfo.outputPath('studio-hidden-selection.png'),
  });
  const selectedHidden = await canvas.screenshot(sceneOnly);
  await page
    .getByRole('checkbox', { name: 'Select demonstration-motorcycle', exact: true })
    .uncheck();
  await expect
    .poll(async () => (await canvas.screenshot(sceneOnly)).equals(selectedHidden))
    .toBe(true);
  await page.getByRole('button', { name: 'Restore visibility', exact: true }).click();
  await expect(root).not.toContainText('Hidden');
  await expect(inherited).not.toContainText('Hidden');

  await frame.click();
  await page.getByRole('button', { name: 'Isolate selection', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show all objects', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('checkbox', { name: 'Select frame', exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Show all objects', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Show all objects', exact: true }).click();
  await expect(page.locator('.editor-object.not-visible')).toHaveCount(0);
});

test('studio protects unsaved changes when leaving through either internal link', async ({
  page,
}) => {
  await page.goto('/editor?demo=1');
  await page.getByLabel('Human-readable name', { exact: true }).fill('Unsaved inspection assembly');
  await page.getByRole('button', { name: 'Save catalog changes', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Unsaved changes');

  for (const name of ['Explorer', 'Review factual catalog data']) {
    const pendingDialog = page.waitForEvent('dialog');
    const pendingClick = page.getByRole('link', { name, exact: true }).click();
    const dialog = await pendingDialog;
    expect(dialog.type()).toBe('beforeunload');
    await dialog.dismiss();
    await pendingClick;
    await expect(page).toHaveURL(/\/editor\?demo=1$/);
    await expect(page.getByLabel('Human-readable name', { exact: true })).toHaveValue(
      'Unsaved inspection assembly',
    );
  }

  await page.getByRole('button', { name: 'Save locally', exact: true }).click();
  await expect(page.locator('.editor-save-state')).toHaveText('Local only');
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.dismiss();
  });
  await page.getByRole('link', { name: 'Explorer', exact: true }).click();
  await expect(page).toHaveURL(/\/\?demo=1$/);
  expect(dialogs).toEqual([]);
});
