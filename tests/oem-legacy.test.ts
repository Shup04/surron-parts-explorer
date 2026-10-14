import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SourceExtraction } from '../src/oem/source-types';

const read = (source: string): SourceExtraction =>
  JSON.parse(readFileSync(`data/oem/extracted/${source}.json`, 'utf8'));
const motorino = read('motorino');
const emotobykes = read('emotobykes');

describe('complete legacy PDF transcription', () => {
  it.each([
    [motorino, 31, 22, 326],
    [emotobykes, 28, 21, 282],
  ] as const)(
    'covers all audited pages and physical rows in $source.id',
    (data, pages, figures, rows) => {
      const audit = JSON.parse(
        readFileSync(`data/oem/audits/${data.source.id}-visual-audit.json`, 'utf8'),
      );
      expect(data.source.sha256).toBe(audit.sha256);
      expect(data.source.pageCount).toBe(pages);
      expect(data.pages).toHaveLength(pages);
      expect(data.rows).toHaveLength(rows);
      expect(new Set(data.rows.map((row) => row.figure)).size).toBe(figures);
      expect(new Set(data.rows.map((row) => row.id)).size).toBe(rows);
      for (const page of data.pages) {
        const actual = data.rows.filter((row) => row.page === page.page);
        expect(actual).toHaveLength(audit.tableRowCounts[page.page - 1]);
        expect(page.detectedRows).toBe(actual.length);
        expect(page.importedRows).toBe(actual.length);
        expect(page.reviewRowIds).toEqual(
          actual.filter((row) => row.reviewFlags.length).map((row) => row.id),
        );
        expect(actual.map((row) => row.rowIndex)).toEqual(actual.map((_, i) => i + 1));
      }
    },
  );

  it('keeps provenance, source characters, and unknown years for every row', () => {
    for (const source of [motorino, emotobykes]) {
      expect(source.source.modelYears).toEqual([]);
      expect(source.source.edition).toBeNull();
      expect(source.source.redistribution).toBe('reference-only');
      for (const row of source.rows) {
        expect(row.sourceId).toBe(source.source.id);
        expect(row.id).toBe(`${row.sourceId}-p${row.page}-r${row.rowIndex}`);
        expect(row.figure).toMatch(/^\d+$/);
        expect(row.modelYears).toEqual([]);
        expect(row.weightText).toBeNull();
        if (row.callout) expect(row.rawText).toContain(row.callout);
        if (row.oemNumber) expect(row.rawText).toContain(row.oemNumber);
        expect(row.rawText).toContain(row.originalDescription);
        expect(row.bounds).toHaveLength(4);
      }
    }
  });

  it('does not drop rows with blank identifiers, descriptions or quantities', () => {
    expect(motorino.rows.filter((row) => row.oemNumber === null)).toHaveLength(4);
    expect(motorino.rows.filter((row) => row.callout === null)).toHaveLength(38);
    const bothBlank = motorino.rows.find((row) => row.id === 'motorino-p21-r22')!;
    expect([bothBlank.callout, bothBlank.oemNumber, bothBlank.quantity]).toEqual([null, null, 6]);
    expect(bothBlank.originalDescription).toBe('Mounting Screw, Absorber Protection Plate (FAST)');
    const billboard = motorino.rows.find((row) => row.oemNumber === '81181-YQ2A-0001')!;
    expect(billboard.quantity).toBeNull();
    expect(billboard.quantityText).toBeNull();
    expect(billboard.notes).toContain('English Version');
    expect(emotobykes.rows.filter((row) => row.oemNumber === null)).toHaveLength(5);
    const unnamed = emotobykes.rows.find((row) => row.callout === '18_06')!;
    expect(unnamed.originalDescription).toBe('');
    expect([unnamed.oemNumber, unnamed.quantity]).toEqual(['41591-YQ2B-0000', 1]);
    expect(unnamed.reviewFlags).toContain('missing-description');
  });

  it('keeps variant quantities paired to their actual printed row', () => {
    const washers = motorino.rows.filter((row) => row.oemNumber === '51195-YQ2A-0000');
    expect(washers.map((row) => [row.originalDescription, row.quantity])).toEqual([
      ['Handle Bar Stem Washer (RST)', 2],
      ['Handle Bar Stem Washer (FAST)', 2],
      ['Handle Bar Stem Washer (DNM)', 1],
    ]);
    expect(
      motorino.rows.filter((row) => row.callout === '3_07').map((row) => row.oemNumber),
    ).toEqual(['21700-YQ2A-0800', '21700-YQ2A-1000', '21700-YQ2A-1200', '21700-YQ2A-1400']);
    expect(motorino.rows.filter((row) => row.callout === '14_07')).toHaveLength(2);
    expect(motorino.rows.filter((row) => row.callout === '14_06')).toHaveLength(2);
  });

  it('retains both the historical bearing claim and warnings about disagreement', () => {
    for (const source of [motorino, emotobykes]) {
      const bearing = source.rows.find((row) => row.callout === '15_08')!;
      expect(bearing.oemNumber).toBe('Z-6000-2Z-26-10-08');
      expect(bearing.quantity).toBe(1);
      expect(bearing.assemblyKey).toBe('jackshaft');
      expect(bearing.reviewFlags).toContain('source-quantity-needs-review');
    }
    const motorinoBearing = motorino.rows.find((row) => row.callout === '15_08')!;
    expect(motorinoBearing.reviewFlags).toContain('diagram-quantity-disagreement');
  });

  it('preserves source spellings and does not silently repair suspect part numbers', () => {
    const axle = motorino.rows.find((row) => row.oemNumber === '5250-YQ2A-0300')!;
    expect(axle.reviewFlags).toContain('source-number-needs-review');
    expect(emotobykes.rows.find((row) => row.callout === '13_08')!.oemNumber).toBe(
      '51250-YQ2A-0300',
    );
    expect(emotobykes.rows.find((row) => row.callout === '16_01-01')!.oemNumber).toBe(
      '22950-YQ2B-0000',
    );
    expect(emotobykes.rows.find((row) => row.callout === '20_1')!.oemNumber).toBe(
      '25100-YQ2B-0000',
    );
    expect(emotobykes.rows.find((row) => row.callout === '21_1')!.quantity).toBe(1);
    expect(motorino.rows.find((row) => row.callout === '4_16')!.originalDescription).toBe(
      'Bolt (M8*20)',
    );
    expect(motorino.rows.find((row) => row.callout === '4_16')!.oemNumber).toBe('B3-001-08-025-F0');
  });

  it('keeps continuation tables under the correct figure on mixed pages', () => {
    expect(emotobykes.rows.filter((row) => row.page === 5).map((row) => row.figure)).toEqual([
      '4',
      '4',
      '4',
      '4',
      '4',
      '4',
      '5',
      '5',
      '5',
    ]);
    expect(emotobykes.rows.filter((row) => row.page === 28).map((row) => row.figure)).toEqual([
      '20',
      '20',
      '20',
      '20',
      '20',
      '20',
      '20',
      '20',
      '20',
      '20',
      '21',
    ]);
    expect(motorino.rows.find((row) => row.id === 'motorino-p21-r1')!.figure).toBe('13');
  });

  it('explicitly records visible illustration callouts missing from the source tables', () => {
    const missing = (data: SourceExtraction) =>
      data.pages
        .flatMap((page) => page.exceptions)
        .filter((issue) => issue.callout !== null)
        .map((issue) => issue.callout);
    expect(missing(motorino)).toEqual(['3_06', '8_08', '8_10', '8_12', '8_13', '8_24']);
    expect(missing(emotobykes)).toEqual(['14_06', '14_07']);
    expect(
      emotobykes.pages.flatMap((page) => page.exceptions).filter((issue) => issue.callout === null),
    ).toHaveLength(13);
  });
});
