import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  validateCatalog,
  buildCatalogIndex,
  searchParts,
  getAssemblyForPart,
} from '../src/core/catalog';
import { buildOemDatabase, catalogPartId } from '../src/oem/reconcile';
import {
  validateExtraction,
  validateOemDatabase,
  validateReviewPatchSet,
} from '../src/oem/validation';
import { toExplorerCatalog } from '../src/oem/adapter';
import { filterOccurrences, getOccurrenceDetails } from '../src/oem/queries';
import {
  applyReviewPatches,
  exportOemDatabase,
  exportReviewPatches,
  importOemDatabase,
} from '../src/oem/review';
import { buildCoverageReport } from '../src/oem/coverage';
import type { SourceExtraction, SourceRow } from '../src/oem/source-types';
import type { OemDatabase } from '../src/oem/types';

const extractionDirectory = path.resolve('data/oem/extracted');
const extractions = readdirSync(extractionDirectory)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map(
    (file): SourceExtraction =>
      JSON.parse(readFileSync(path.join(extractionDirectory, file), 'utf8')),
  );
const database = buildOemDatabase(extractions);
const sourceRows = extractions.flatMap((extraction) => extraction.rows);

function sourceFixture(rows: Partial<SourceRow>[]): SourceExtraction {
  return {
    version: 1,
    source: {
      id: 'fixture',
      title: 'Test evidence',
      filename: 'fixture.pdf',
      localPath: 'reference/fixture.pdf',
      url: 'https://example.org/fixture.pdf',
      sha256: 'a'.repeat(64),
      pageCount: 1,
      edition: null,
      modelYears: [],
      applicabilityNotes: 'No year claim',
      redistribution: 'reference-only',
      retrievedAt: '2026-10-13',
      kind: 'pdf',
    },
    rows: rows.map((row, i) => ({
      id: `fixture-r${i}`,
      sourceId: 'fixture',
      page: 1,
      figure: '1',
      callout: `${i + 1}`,
      rowIndex: i,
      oemNumber: 'Exact-6000-2Z',
      originalDescription: 'Bearing',
      normalizedName: 'Bearing',
      quantity: 1,
      quantityText: '1',
      dimensionsText: null,
      weightText: null,
      material: null,
      notes: [],
      applicability: null,
      modelYears: [],
      itemType: 'component',
      confidence: 'high',
      reviewFlags: [],
      assemblyKey: 'jackshaft',
      assemblyName: 'Midshaft',
      rawText: 'original source row',
      ...row,
    })),
    pages: [
      {
        page: 1,
        figures: ['1'],
        detectedRows: rows.length,
        importedRows: rows.length,
        reviewRowIds: [],
        exceptions: [],
        visualStatus: 'inspected',
        notes: [],
      },
    ],
    notes: [],
  };
}

describe('complete source transcription and catalog reconciliation', () => {
  it('validates every source extraction and the reconciled database', () => {
    for (const extraction of extractions)
      expect(validateExtraction(extraction), extraction.source.id).toMatchObject({ success: true });
    expect(validateOemDatabase(database)).toMatchObject({ success: true });
  });

  it('preserves every row with exactly one occurrence and exact OEM characters and quantities', () => {
    expect(database.occurrences).toHaveLength(sourceRows.length);
    expect(new Set(database.occurrences.map((o) => o.sourceRowId)).size).toBe(sourceRows.length);
    for (const row of sourceRows) {
      const detail = getOccurrenceDetails(database, `occ-${row.id}`)!;
      expect(detail.sourceRow).toEqual(row);
      expect(detail.part.oemNumber).toBe(row.oemNumber);
      expect(detail.occurrence.quantity).toBe(row.quantity);
      expect(detail.source.id).toBe(row.sourceId);
    }
  });

  it('covers every PDF page and reconciles table row counts or names explicit exceptions', () => {
    for (const extraction of extractions.filter((source) => source.source.kind === 'pdf')) {
      expect(extraction.pages.map((page) => page.page).sort((a, b) => a - b)).toEqual(
        Array.from({ length: extraction.source.pageCount }, (_, i) => i + 1),
      );
      for (const page of extraction.pages) {
        expect(extraction.rows.filter((row) => row.page === page.page)).toHaveLength(
          page.importedRows,
        );
        expect(page.detectedRows).toBeGreaterThanOrEqual(page.importedRows);
        if (page.detectedRows > page.importedRows)
          expect(page.exceptions.length).toBeGreaterThan(0);
      }
    }
  });

  it('retains missing OEM rows as separate identities', () => {
    const missing = database.sourceRows.filter((row) => row.oemNumber === null);
    expect(missing.length).toBeGreaterThan(0);
    const ids = missing.map((row) => getOccurrenceDetails(database, `occ-${row.id}`)!.part.id);
    expect(new Set(ids).size).toBe(missing.length);
  });

  it('deduplicates exact OEM identities but retains every assembly/source occurrence', () => {
    const numbers = database.parts.flatMap((part) =>
      part.oemNumber === null ? [] : [part.oemNumber],
    );
    expect(new Set(numbers).size).toBe(numbers.length);
    const bearing = database.parts.find((part) => part.oemNumber === 'Z-6000-2Z-26-10-08')!;
    const occurrences = database.occurrences.filter((o) => o.partId === bearing.id);
    expect(occurrences.length).toBeGreaterThan(3);
    expect(new Set(occurrences.map((o) => o.assemblyId))).toEqual(
      new Set(['swingarm', 'jackshaft']),
    );
  });

  it('preserves the historical midshaft reference rows and differing bearing source quantities', () => {
    const references = [
      ['17_02', '61234-YQ2A-0000', 1],
      ['17_03', 'B3-003-06-025-F3', 6],
      ['17_04', 'B7-001-15-24-7', 1],
      ['17_05', '13105-YQ2A-0000', 1],
      ['17_07', 'Z-6000-2Z-26-10-08', 3],
      ['17_08', '61282-YQ2A-0000', 1],
      ['17_11', '13202-YQ2A-0100', 1],
    ];
    for (const [callout, number, quantity] of references) {
      expect(
        database.sourceRows.find((row) => row.sourceId === 'lbx2021' && row.callout === callout),
      ).toMatchObject({ oemNumber: number, quantity });
    }
    const bearing = database.parts.find((part) => part.oemNumber === 'Z-6000-2Z-26-10-08')!;
    const conflict = database.conflicts.find(
      (item) => item.kind === 'quantity' && item.partIds.includes(bearing.id),
    )!;
    expect(new Set(conflict.claims.map((claim) => claim.value))).toEqual(new Set(['1', '3']));
    expect(
      conflict.occurrenceIds.every(
        (id) => getOccurrenceDetails(database, id)!.assembly.id === 'jackshaft',
      ),
    ).toBe(true);
    expect(
      filterOccurrences(database, { assemblyId: 'swingarm', text: bearing.oemNumber! }).every(
        (occurrence) => occurrence.quantity === 4,
      ),
    ).toBe(true);
  });

  it('never conflates bearing designations or punctuation changes', () => {
    const fixture = buildOemDatabase([
      sourceFixture([
        { oemNumber: 'Z-6000-2Z-26-10-08' },
        { oemNumber: 'Z-6000-2RS-26-10-08' },
        { oemNumber: 'Z-6001-2RS' },
        { oemNumber: 'Z 6001 2RS' },
      ]),
    ]);
    expect(fixture.parts).toHaveLength(4);
    expect(catalogPartId('A-B', 'x')).not.toBe(catalogPartId('A B', 'x'));
  });

  it('is deterministic and idempotent across repeated PDF imports and input order', () => {
    expect(buildOemDatabase([...extractions, ...extractions])).toEqual(database);
    expect(buildOemDatabase([...extractions].reverse())).toEqual(database);
    const checkedIn = JSON.parse(readFileSync('data/oem/catalog.json', 'utf8'));
    expect(checkedIn).toEqual(database);
  });

  it('rejects duplicate raw row IDs and changed documents reusing a source ID', () => {
    const fixture = sourceFixture([{ id: 'same' }, { id: 'same' }]);
    expect(validateExtraction(fixture).success).toBe(false);
    expect(() => buildOemDatabase([fixture])).toThrow('Duplicate source row ID');
    const original = sourceFixture([{}]);
    const changed = structuredClone(original);
    changed.source.sha256 = 'b'.repeat(64);
    expect(() => buildOemDatabase([original, changed])).toThrow('Source ID reused');
  });

  it('does not equate multiple legitimate occurrences of one bolt by their part number', () => {
    const first = sourceFixture([{ quantity: 2 }, { quantity: 6 }]);
    const second = structuredClone(first);
    second.source.id = 'second';
    second.source.sha256 = 'c'.repeat(64);
    second.rows = second.rows.map((row, i) => ({
      ...row,
      id: `second-r${i}`,
      sourceId: 'second',
      quantity: 8,
    }));
    expect(
      buildOemDatabase([first, second]).conflicts.filter(
        (conflict) => conflict.kind === 'quantity',
      ),
    ).toHaveLength(0);
  });

  it('rejects orphaned callouts, identity corruption and misassociated quantities', () => {
    const missing = structuredClone(database);
    missing.occurrences.pop();
    expect(validateOemDatabase(missing).success).toBe(false);
    const corrupted = structuredClone(database);
    corrupted.parts[0].oemNumber += '-changed';
    expect(validateOemDatabase(corrupted).success).toBe(false);
    const quantity = structuredClone(database);
    quantity.occurrences[0].quantity = 999;
    expect(validateOemDatabase(quantity).success).toBe(false);
    const fitment = structuredClone(database);
    fitment.variants[0].years = [2026];
    expect(validateOemDatabase(fitment).success).toBe(false);
    const interchange = structuredClone(database);
    interchange.relationships.push({
      fromPartId: interchange.parts[0].id,
      toPartId: interchange.parts[1].id,
      kind: 'confirmed-interchangeable',
      sourceRowIds: [],
      reviewStatus: 'unreviewed',
      notes: 'No supporting source',
    });
    expect(validateOemDatabase(interchange).success).toBe(false);
  });
});

describe('existing explorer adapter, search and model-year constraints', () => {
  it('keeps every unmapped row selectable and compatible with the existing catalog protocol', () => {
    const catalog = toExplorerCatalog(database);
    expect(validateCatalog(catalog)).toMatchObject({ success: true });
    expect(catalog.parts.filter((part) => part.kind === 'component')).toHaveLength(
      sourceRows.length,
    );
    expect(
      database.occurrences.every((occurrence) => occurrence.geometryMappingIds.length === 0),
    ).toBe(true);
  });

  it('finds an OEM part, its source assembly and intermediate-shaft aliases with no geometry', () => {
    const index = buildCatalogIndex(toExplorerCatalog(database));
    const results = searchParts(index, 'Z-6000-2Z-26-10-08');
    expect(results.length).toBeGreaterThan(0);
    const midshaft = results.find((part) => part.parentId === 'jackshaft')!;
    expect(getAssemblyForPart(index, midshaft.id).id).toBe('jackshaft');
    expect(
      searchParts(index, 'jackshaft bearing').some((part) => part.parentId === 'jackshaft'),
    ).toBe(true);
    expect(
      searchParts(index, 'intermediate shaft bearing').some(
        (part) => part.parentId === 'jackshaft',
      ),
    ).toBe(true);
    expect(
      filterOccurrences(database, { text: 'intermediate shaft bearing' }).length,
    ).toBeGreaterThan(0);
  });

  it('keeps unknown, MY25 and MY26 source applicability distinct without extending fitment', () => {
    const year25 = filterOccurrences(database, { modelYear: 2025 });
    const year26 = filterOccurrences(database, { modelYear: 2026 });
    const unknown = filterOccurrences(database, { modelYear: 'unknown' });
    expect(year25.length).toBeGreaterThan(0);
    expect(year26.length).toBeGreaterThan(0);
    expect(unknown.length).toBeGreaterThan(0);
    expect(
      year26.every((row) =>
        getOccurrenceDetails(database, row.id)!.sourceRow.modelYears.includes(2026),
      ),
    ).toBe(true);
    expect(
      year25.some(
        (row) => getOccurrenceDetails(database, row.id)!.part.oemNumber === '61280-YQ2A-Z2',
      ),
    ).toBe(true);
    expect(
      year26.some(
        (row) => getOccurrenceDetails(database, row.id)!.part.oemNumber === '61280-Y029E-Z2',
      ),
    ).toBe(true);
    expect(
      unknown.every(
        (row) => getOccurrenceDetails(database, row.id)!.sourceRow.modelYears.length === 0,
      ),
    ).toBe(true);
    expect(
      toExplorerCatalog(database, { modelYear: 2026 }).parts.every((part) =>
        part.compatibility.every((claim) => claim.verification === 'unknown'),
      ),
    ).toBe(true);
  });

  it('reports complete source coverage without claiming geometry or mechanical verification', () => {
    const report = buildCoverageReport(database);
    expect(report.totals.pdfDocuments).toBe(3);
    expect(report.totals.importedOccurrences).toBe(sourceRows.length);
    expect(report.totals.mappedCatalogParts).toBe(0);
    expect(report.totals.awaitingMappingCatalogParts).toBe(database.parts.length);
    expect(
      report.sources.every((source) => source.requiringReview === source.importedRecords),
    ).toBe(true);
  });
});

describe('review edits and portable exports', () => {
  const occurrenceId = 'occ-lbx2021-p15-r21';
  const updatedAt = '2026-10-13T20:00:00.000Z';
  it('keeps source-checked dimensions pending mechanical verification', () => {
    const sourceChecked = applyReviewPatches(database, {
      version: 1,
      patches: [
        {
          occurrenceId,
          reviewStatus: 'source-checked',
          note: 'Printed dimensions checked',
          updatedAt,
        },
      ],
    });
    expect(
      filterOccurrences(sourceChecked, { issue: 'dimensions' }).some(
        (occurrence) => occurrence.id === occurrenceId,
      ),
    ).toBe(true);
    const mechanicallyVerified = applyReviewPatches(sourceChecked, {
      version: 1,
      patches: [
        {
          occurrenceId,
          reviewStatus: 'mechanically-verified',
          note: 'Dimensions measured',
          updatedAt,
        },
      ],
    });
    expect(
      filterOccurrences(mechanicallyVerified, { issue: 'dimensions' }).some(
        (occurrence) => occurrence.id === occurrenceId,
      ),
    ).toBe(false);
  });

  it('edits human names, relationships, quantities and verification without rewriting evidence', () => {
    const before = JSON.stringify(database.sourceRows);
    const edited = applyReviewPatches(database, {
      version: 1,
      patches: [
        {
          occurrenceId,
          normalizedName: 'Reviewed bearing',
          assemblyId: 'motor',
          quantity: 2,
          oemNumber: 'REVIEW-CORRECTION',
          reviewStatus: 'source-checked',
          note: 'Example reviewer evidence for a local correction',
          updatedAt,
        },
      ],
    });
    const detail = getOccurrenceDetails(edited, occurrenceId)!;
    expect(detail.part.normalizedName).toBe('Reviewed bearing');
    expect(detail.part.oemNumber).toBe('REVIEW-CORRECTION');
    expect(detail.occurrence).toMatchObject({
      quantity: 2,
      assemblyId: 'motor',
      reviewStatus: 'source-checked',
    });
    expect(detail.sourceRow).toMatchObject({ quantity: 3, oemNumber: 'Z-6000-2Z-26-10-08' });
    expect(JSON.stringify(edited.sourceRows)).toBe(before);
    expect(getOccurrenceDetails(database, occurrenceId)!.occurrence.quantity).toBe(3);
    expect(validateOemDatabase(edited)).toMatchObject({ success: true });
    expect(toExplorerCatalog(edited).parts.find((part) => part.id === occurrenceId)).toMatchObject({
      name: 'Reviewed bearing',
      parentId: 'motor',
      quantity: 2,
      oemNumber: 'REVIEW-CORRECTION',
    });
  });

  it('requires evidence notes for factual corrections and rejects dangling references', () => {
    expect(
      validateReviewPatchSet({
        version: 1,
        patches: [{ occurrenceId, quantity: 2, note: '', updatedAt }],
      }).success,
    ).toBe(false);
    expect(() =>
      applyReviewPatches(database, {
        version: 1,
        patches: [{ occurrenceId: 'missing', note: '', updatedAt }],
      }),
    ).toThrow('Unknown occurrence');
    expect(() =>
      applyReviewPatches(database, {
        version: 1,
        patches: [{ occurrenceId, assemblyId: 'missing', note: '', updatedAt }],
      }),
    ).toThrow('Unknown assembly');
  });

  it('round-trips the complete database and bulk review edits with source provenance', () => {
    const edited = applyReviewPatches(database, {
      version: 1,
      patches: database.occurrences.slice(0, 4).map((occurrence) => ({
        occurrenceId: occurrence.id,
        reviewStatus: 'source-checked',
        note: 'Checked source page',
        updatedAt,
      })),
    });
    const imported: OemDatabase = importOemDatabase(exportOemDatabase(edited));
    expect(imported).toEqual(edited);
    expect(exportReviewPatches(imported).patches).toHaveLength(4);
    expect(() => importOemDatabase('{"version":1}')).toThrow();
  });
});
