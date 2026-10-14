import { expect, test, type Page } from '@playwright/test';
import { oemDatabase } from '../../src/data/oem';

function componentInformation(page: Page) {
  return page.getByRole('complementary', { name: 'Component information' });
}

test('fourteen motorcycle systems expose meaningful front-wheel roles and collapsed service parts', async ({
  page,
}) => {
  await page.goto('/');
  const tree = page.locator('.parts-tree');
  await expect(tree.locator(':scope > li')).toHaveCount(14);
  await expect(page.locator('.catalog-panel .panel-heading .count-tag')).toHaveText('14 systems');
  await expect(tree).not.toContainText('Decals');
  await expect(tree).not.toContainText('Charger');
  await expect(tree.locator('[data-navigation-kind="installed"]')).toHaveCount(0);

  await tree.getByRole('button', { name: 'Expand Front wheel', exact: true }).click();
  for (const name of ['Tire', 'Rim and spokes', 'Hub', 'Axle', 'Wheel bearings', 'Brake rotor'])
    await expect(
      tree.getByRole('button', { name: new RegExp(`^${name}(?:\\s*\\d+)?$`) }),
    ).toBeVisible();
  const service = tree.getByRole('button', { name: 'Expand Service parts', exact: true });
  await expect(service).toHaveAttribute('aria-expanded', 'false');
  await expect(tree).not.toContainText('51200-YQ2A-0000');

  await tree.getByRole('button', { name: 'Tire', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('nav')).toBe('nav.front-wheel.tire');
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Tire');
  await expect(componentInformation(page)).toContainText('Installed variant not confirmed');
  await expect(componentInformation(page).getByTestId('navigation-references')).not.toHaveAttribute(
    'open',
    '',
  );

  await tree.getByRole('button', { name: 'Hub', exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get('nav')).toBe('nav.front-wheel.hub');
  await page.goBack();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Tire');
  await page.reload();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Tire');
  await page.goForward();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Hub');
});

test('curated navigation preserves assembly history, avoids duplicate entries and returns to its parent', async ({
  page,
}) => {
  await page.goto('/?motorcycle=lbx&assembly=front-wheel&part=front-wheel');
  const original = page.url();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Tire', exact: true }).click();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Tire');
  const historyLength = await page.evaluate(() => history.length);
  await tree.getByRole('button', { name: 'Tire', exact: true }).click();
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  await page.goBack();
  await expect(page).toHaveURL(original);
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText(
    'Front wheel',
  );
  await page.goForward();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText(
    'Front wheel',
  );
  await expect.poll(() => new URL(page.url()).searchParams.get('nav')).toBe('front-wheel');
});

test('jackshaft bearing references preserve distinct OEMs, source quantities and stable selection', async ({
  page,
}) => {
  const historicalNumber = 'Z-6000-2Z-26-10-08';
  const historicalRow = oemDatabase.sourceRows.find(
    (row) =>
      row.sourceId === 'lbx2021' &&
      row.assemblyKey === 'jackshaft' &&
      row.oemNumber === historicalNumber,
  )!;
  const historicalOccurrence = oemDatabase.occurrences.find(
    (occurrence) => occurrence.sourceRowId === historicalRow.id,
  )!;
  const historicalSource = oemDatabase.sources.find((source) => source.id === 'lbx2021')!;
  await page.goto('/?nav=nav.jackshaft.bearings');
  const details = componentInformation(page);
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Jackshaft bearings');
  const references = details.getByTestId('navigation-references');
  await expect(references).not.toHaveAttribute('open', '');
  await references.locator(':scope > summary').click();
  for (const number of [historicalNumber, 'Z-6000-2RS-26-10-08', 'Z-6001-2RS-28-12-08'])
    await expect(
      references.locator('.source-card > summary').filter({ hasText: number }),
    ).toHaveCount(1);

  const historical = references.locator('.source-card').filter({
    has: page.locator('summary').filter({ hasText: historicalNumber }),
  });
  await historical.locator(':scope > summary').click();
  const claims = historical.locator('button.source-claim');
  await expect(claims.filter({ hasText: 'Qty 3' })).toBeVisible();
  await expect(claims.filter({ hasText: 'Qty 1' }).first()).toBeVisible();
  await claims
    .filter({ hasText: historicalSource.title })
    .filter({ hasText: historicalRow.callout! })
    .click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('part'))
    .toBe(historicalOccurrence.id);
  await expect(details.locator('.oem-number')).toHaveText(historicalNumber);
  await expect(details).toContainText(historicalRow.callout!);
  await expect(page.getByTestId('geometry-unassigned')).toBeVisible();
  await page.reload();
  await expect(details.locator('.oem-number')).toHaveText(historicalNumber);
  await expect(page.getByTestId('geometry-unassigned')).toBeVisible();
  await page.goBack();
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Jackshaft bearings');
});

test('mobile curated components and parent navigation work without hover', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Parts', exact: true }).click();
  const tree = page.locator('.parts-tree');
  await tree.getByRole('button', { name: 'Expand Front wheel', exact: true }).click();
  await tree.getByRole('button', { name: 'Wheel bearings', exact: true }).click();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText(
    'Wheel bearings',
  );
  await page.getByRole('button', { name: 'Close component details' }).click();
  await page.getByRole('button', { name: 'Parent assembly', exact: true }).click();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText(
    'Front wheel',
  );
  await page.goBack();
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText(
    'Wheel bearings',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('brake navigation distinguishes physical positions without selecting catalog variants', async ({
  page,
}) => {
  await page.goto('/?nav=brakes');
  const tree = page.locator('.parts-tree');
  await expect(componentInformation(page).getByRole('heading', { level: 2 })).toHaveText('Brakes');
  await expect(tree.getByRole('button', { name: /^Front brake(?:\s*\d+)?$/ })).toBeVisible();
  await expect(tree.getByRole('button', { name: /^Rear brake(?:\s*\d+)?$/ })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Brake pads', exact: true })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Brake levers', exact: true })).toBeVisible();
  await expect(tree.locator('[data-navigation-kind="installed"]')).toHaveCount(0);
  await expect(tree).not.toContainText('Golden Color');
  await expect(tree).not.toContainText('52290-YQ2A-0100');
  await tree.getByRole('button', { name: 'Expand Front brake', exact: true }).click();
  await expect(tree.getByRole('button', { name: 'Front caliper', exact: true })).toBeVisible();
  await expect(tree.getByRole('button', { name: 'Front brake hose', exact: true })).toBeVisible();
});

test('battery slots remain unconfirmed after year filtering and chargers stay outside the motorcycle tree', async ({
  page,
}) => {
  await page.goto('/?nav=nav.battery.pack');
  const details = componentInformation(page);
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Battery pack');
  await expect(details).toContainText('Installed variant not confirmed');
  await expect(page.locator('.parts-tree')).not.toContainText(/Charger|32Ah|38Ah|40Ah|60V/);
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('2021');
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Battery pack');
  await expect(details).toContainText('Installed variant not confirmed');
  await expect(page.locator('.parts-tree [data-navigation-kind="installed"]')).toHaveCount(0);
  const references = details.getByTestId('navigation-references');
  await references.locator(':scope > summary').click();
  await expect(references).not.toContainText(/Charger/i);
  await expect(references.locator('.source-card').first()).toBeVisible();

  await page.getByLabel('Catalog source', { exact: true }).selectOption('lbx2021');
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('2026');
  const emptyReferences = details.getByTestId('navigation-references');
  if ((await emptyReferences.getAttribute('open')) === null)
    await emptyReferences.locator(':scope > summary').click();
  await expect(emptyReferences).toContainText(
    'No source references match the selected source and year',
  );
  await expect(details).toContainText('Installed variant not confirmed');
});

test('decals remain searchable and their existing occurrence links survive reload', async ({
  page,
}) => {
  const occurrence = oemDatabase.occurrences.find(
    (entry) =>
      entry.assemblyId === 'stickers' &&
      oemDatabase.parts.find((part) => part.id === entry.partId)?.oemNumber,
  )!;
  const part = oemDatabase.parts.find((entry) => entry.id === occurrence.partId)!;
  await page.goto('/');
  await expect(page.locator('.parts-tree')).not.toContainText(/Decal|Sticker/i);
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill(part.oemNumber!);
  await page.locator('.search-result').filter({ hasText: part.oemNumber! }).first().click();
  await expect(componentInformation(page).locator('.oem-number')).toHaveText(part.oemNumber!);
  const selectedId = new URL(page.url()).searchParams.get('part');
  expect(oemDatabase.occurrences.find((entry) => entry.id === selectedId)?.partId).toBe(part.id);
  await expect(page.locator('.parts-tree')).not.toContainText(/Decal|Sticker/i);
  const selectionUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(selectionUrl);
  await expect(componentInformation(page).locator('.oem-number')).toHaveText(part.oemNumber!);
  await expect(page.getByTestId('geometry-unassigned')).toBeVisible();

  await page.goto(`/?assembly=stickers&part=${encodeURIComponent(occurrence.id)}`);
  await expect(componentInformation(page).locator('.oem-number')).toHaveText(part.oemNumber!);
  await expect(page.locator('.parts-tree')).not.toContainText(/Decal|Sticker/i);
});
