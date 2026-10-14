import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const bushingId = 'occ-lbx2021-p15-r16';
const bushingNumber = '61234-YQ2A-0000';
const sourceName = 'Sur-Ron Light Bee X Spare Parts Catalog (2021 reference)';

async function selectHistoricalReference(page: Page) {
  await page.getByLabel('Catalog source', { exact: true }).selectOption('lbx2021');
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('2021');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill(bushingNumber);
  await page.locator('.search-result').filter({ hasText: bushingNumber }).click();
}

async function selectReviewBushing(page: Page) {
  await page.getByLabel('Filter source', { exact: true }).selectOption('lbx2021');
  await page.getByLabel('Filter model year', { exact: true }).selectOption('2021');
  await page.getByRole('textbox', { name: 'Search OEM records' }).fill(bushingNumber);
  await page
    .getByRole('table')
    .getByRole('button', { name: new RegExp(bushingNumber) })
    .click();
}

test('real OEM lookup works without geometry and retains source page, quantity and shareable selection', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await selectHistoricalReference(page);
  await expect(page).toHaveURL(new RegExp(`part=${bushingId}`));
  await expect(
    page
      .getByRole('complementary', { name: 'Component information' })
      .getByRole('heading', { level: 2 }),
  ).toHaveText('Midshaft right bushing');
  const details = page.getByRole('complementary', { name: 'Component information' });
  await expect(details).toContainText(bushingNumber);
  await expect(details).toContainText('No 3D representation assigned');
  await expect(details).toContainText(sourceName);
  await expect(details).toContainText('17_02');
  await expect(details).toContainText('15');
  const link = page.url();
  await page.reload();
  await expect(
    page
      .getByRole('complementary', { name: 'Component information' })
      .getByRole('heading', { level: 2 }),
  ).toHaveText('Midshaft right bushing');
  await expect(page).toHaveURL(link);
  await expect(page.getByLabel('Catalog source', { exact: true })).toHaveValue('lbx2021');
  await expect(page.getByLabel('Catalog model year', { exact: true })).toHaveValue('2021');
  expect(errors).toEqual([]);
});

test('source filters, occurrence navigation and browser history retain historical and MY26 separation', async ({
  page,
}) => {
  await page.goto('/');
  await selectHistoricalReference(page);
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('B3-003-06-025-F3');
  await page.locator('.search-result').filter({ hasText: 'B3-003-06-025-F3' }).click();
  await expect(page).toHaveURL(/part=occ-lbx2021-p15-r17/);
  await page.goBack();
  await expect(
    page
      .getByRole('complementary', { name: 'Component information' })
      .getByRole('heading', { level: 2 }),
  ).toHaveText('Midshaft right bushing');
  await page.goForward();
  await expect(page).toHaveURL(/part=occ-lbx2021-p15-r17/);
  await page.getByLabel('Catalog source', { exact: true }).selectOption('');
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('2026');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('61280-Y029E-Z2');
  const result = page.locator('.search-result').filter({ hasText: '61280-Y029E-Z2' });
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(page.getByRole('complementary', { name: 'Component information' })).toContainText(
    '61280-Y029E-Z2',
  );
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('2025');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill('61280-Y029E-Z2');
  await expect(page.locator('.search-result').filter({ hasText: '61280-Y029E-Z2' })).toHaveCount(0);
  await page.getByLabel('Catalog model year', { exact: true }).selectOption('unknown');
  await page.getByRole('textbox', { name: 'Search parts', exact: true }).fill(bushingNumber);
  await expect(page.locator('.search-result').first()).toBeVisible();
});

test('mobile browser history restores a selected part and its detail sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?assembly=jackshaft&part=${bushingId}&source=lbx2021&year=2021`);
  const details = page.getByRole('complementary', { name: 'Component information' });
  await expect(details).toHaveClass(/mobile-open/);
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Midshaft right bushing');
  await details
    .getByRole('navigation', { name: 'Part hierarchy' })
    .getByRole('button', { name: /^Motorcycle/ })
    .click();
  await expect(details).toBeHidden();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`part=${bushingId}`));
  await expect(details).toHaveClass(/mobile-open/);
  await expect(details.getByRole('heading', { level: 2 })).toHaveText('Midshaft right bushing');
  await expect(page.getByLabel('Catalog source', { exact: true })).toHaveValue('lbx2021');
  await expect(page.getByLabel('Catalog model year', { exact: true })).toHaveValue('2021');
  await page.goForward();
  await expect(details).toBeHidden();
});

test('changing review filters clears bulk selections before reviewing another record', async ({
  page,
}) => {
  await page.goto('/catalog');
  await selectReviewBushing(page);
  await page.getByRole('checkbox', { name: 'Select lbx2021-p15-r16', exact: true }).check();
  await expect(page.locator('.review-bulk')).toContainText('1 selected');
  await page.getByRole('textbox', { name: 'Search OEM records' }).fill('B3-003-06-025-F3');
  await expect(page.locator('.review-bulk')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Select lbx2021-p15-r17', exact: true }).check();
  await page.getByRole('button', { name: 'Apply status', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export edits', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.patches.map((patch: { occurrenceId: string }) => patch.occurrenceId)).toEqual([
    'occ-lbx2021-p15-r17',
  ]);
});

test('local catalog review persists corrections, exports original claims and appears in the explorer', async ({
  page,
}) => {
  await page.goto('/catalog');
  await selectReviewBushing(page);
  const inspector = page.getByRole('complementary', { name: 'Source record editor' });
  await inspector.getByLabel('Normalized English name').fill('Reviewed midshaft bushing');
  await inspector.getByLabel('Quantity override').fill('2');
  await inspector.getByLabel('Verification status').selectOption('source-checked');
  await inspector
    .getByLabel('Review notes / correction evidence')
    .fill('Browser test: local reviewer correction; original quantity is retained.');
  await inspector.getByRole('button', { name: 'Save reviewed occurrence' }).click();
  await expect(page.getByRole('status', { name: 'Catalog review status' })).toContainText(
    'Original source claims are unchanged',
  );
  const original = inspector
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Original source claim', exact: true }) });
  await expect(original.getByText('1', { exact: true })).toBeVisible();
  await expect(original).toContainText(bushingNumber);
  await page.reload();
  await selectReviewBushing(page);
  await expect(inspector.getByLabel('Normalized English name')).toHaveValue(
    'Reviewed midshaft bushing',
  );
  await expect(inspector.getByLabel('Quantity override')).toHaveValue('2');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export complete catalog', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(
    exported.sourceRows.find((row: { id: string }) => row.id === 'lbx2021-p15-r16'),
  ).toMatchObject({ oemNumber: bushingNumber, quantity: 1 });
  expect(
    exported.reviewPatches.find(
      (patch: { occurrenceId: string }) => patch.occurrenceId === bushingId,
    ),
  ).toMatchObject({ normalizedName: 'Reviewed midshaft bushing', quantity: 2 });
  await inspector.getByRole('link', { name: 'Open in explorer' }).click();
  await expect(
    page
      .getByRole('complementary', { name: 'Component information' })
      .getByRole('heading', { level: 2 }),
  ).toHaveText('Reviewed midshaft bushing');
  await expect(page.getByRole('complementary', { name: 'Component information' })).toContainText(
    'No 3D representation assigned',
  );
});

test('review filters retain missing-number rows and reject invalid patches and mismatched PDFs', async ({
  page,
}) => {
  await page.goto('/catalog');
  await page.getByLabel('Filter review issues').selectOption('missing-oem');
  await expect(page.getByRole('table').getByText('No OEM number in source').first()).toBeVisible();
  await page.getByLabel('Filter review issues').selectOption('');
  await selectReviewBushing(page);
  await page.getByLabel('Import review JSON').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        patches: [
          {
            occurrenceId: 'does-not-exist',
            note: 'invalid reference',
            updatedAt: '2026-10-13T20:00:00.000Z',
          },
        ],
      }),
    ),
  });
  await expect(page.locator('.review-error[role=alert]')).toContainText('Unknown occurrence');
  await page.getByLabel('Attach local source PDF').setInputFiles({
    name: 'wrong.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 wrong source'),
  });
  await expect(page.locator('.review-error[role=alert]')).toContainText(
    'does not match the audited source fingerprint',
  );
});

test('opens an available original PDF locally at its audited page without uploading it', async ({
  page,
}) => {
  const pdfPath = 'reference/parts-catalogue/katalog-zapchastej-surron-light-bee-2021.pdf';
  test.skip(
    !existsSync(pdfPath),
    'Copyrighted reference PDFs are local inputs, not distributed with the repository.',
  );
  await page.goto('/catalog');
  await selectReviewBushing(page);
  await page.getByLabel('Attach local source PDF').setInputFiles(pdfPath);
  await expect(page.getByRole('link', { name: 'Open local PDF at page 15' })).toHaveAttribute(
    'href',
    /^blob:.*#page=15$/,
  );
  await expect(page.getByRole('status', { name: 'Catalog review status' })).toContainText(
    'No document was uploaded or published',
  );
});
