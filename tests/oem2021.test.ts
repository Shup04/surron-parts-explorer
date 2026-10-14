import { describe, expect, it } from 'vitest';
import extractionJson from '../data/oem/extracted/lbx2021.json';
import type { SourceExtraction } from '../src/oem/source-types';

const extraction = extractionJson as SourceExtraction;
const rows = extraction.rows;
const byCallout = (callout: string) => rows.filter((row) => row.callout === callout);
const byNumber = (oem: string) => rows.filter((row) => row.oemNumber === oem);

describe('complete 2021 PDF transcription', () => {
  it('covers every physical table row on all twenty audited pages', () => {
    const independentlyAuditedRows = [
      23, 18, 21, 18, 26, 24, 22, 31, 29, 11, 7, 27, 25, 27, 32, 13, 11, 5, 15, 7,
    ];
    expect(rows).toHaveLength(392);
    expect(extraction.pages).toHaveLength(20);
    expect(extraction.pages.map((page) => page.detectedRows)).toEqual(independentlyAuditedRows);
    expect(extraction.pages.map((page) => page.importedRows)).toEqual(independentlyAuditedRows);
    for (const page of extraction.pages) {
      expect(rows.filter((row) => row.page === page.page)).toHaveLength(page.detectedRows);
      expect(page.visualStatus).toBe('inspected');
    }
  });

  it.each([
    ['17_02', '61234-YQ2A-0000', 1],
    ['17_03', 'B3-003-06-025-F3', 6],
    ['17_04', 'B7-001-15-24-7', 1],
    ['17_05', '13105-YQ2A-0000', 1],
    ['17_07', 'Z-6000-2Z-26-10-08', 3],
    ['17_08', '61282-YQ2A-0000', 1],
    ['17_11', '13202-YQ2A-0100', 1],
  ])(
    'preserves the reference midshaft callout %s and its exact quantity',
    (callout, oem, quantity) => {
      expect(byCallout(String(callout))).toHaveLength(1);
      expect(byCallout(String(callout))[0]).toMatchObject({
        oemNumber: oem,
        quantity,
        page: 15,
        figure: '17',
        assemblyKey: 'jackshaft',
      });
    },
  );

  it('preserves raw OEM characters, physical row identity and source provenance', () => {
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row.id).toBe(`lbx2021-p${row.page}-r${row.rowIndex}`);
      expect(row.sourceId).toBe(extraction.source.id);
      expect(row.oemNumber).toBe(row.rawText.split(' | ')[1] || null);
      expect(row.originalDescription).toBe(row.rawText.split(' | ')[2]);
      expect(row.quantityText).toBe(row.rawText.split(' | ')[5] || null);
      expect(row.bounds).toHaveLength(4);
      expect(row.figure).toBeTruthy();
    }
    expect(byNumber('0402140402')).toHaveLength(1);
    expect(byNumber('B4-001-6-F1')).toHaveLength(1);
  });

  it('retains missing OEM, blank callouts and missing quantities without filling them down', () => {
    expect(byCallout('2_01')[0]).toMatchObject({ oemNumber: null, quantity: 1 });
    expect(rows.filter((row) => row.oemNumber === null)).toHaveLength(1);
    expect(rows.filter((row) => row.callout === null)).toHaveLength(8);
    expect(rows.filter((row) => row.quantity === null)).toHaveLength(17);
    expect(byCallout('17_06')[0].quantity).toBeNull();
    expect(byNumber('31325-YQ2A-0000')[0]).toMatchObject({ callout: null, figure: '11' });
    expect(byNumber('52200-YQ2B-0300')[0]).toMatchObject({
      callout: null,
      figure: '16',
      quantity: null,
    });
  });

  it('propagates only actually merged cells across all variant rows', () => {
    expect(byCallout('1_01')).toHaveLength(9);
    expect(byCallout('1_01').every((row) => row.dimensionsText === '200.5×692.5×440.5')).toBe(true);
    expect(byNumber('41100-YQ2B-0000-Y11')[0].quantity).toBeNull();
    expect(byCallout('4_10')).toHaveLength(5);
    expect(byCallout('4_10').every((row) => row.weightText === '2,106')).toBe(true);
    expect(byNumber('51300-YQ2A-0200')[0].dimensionsText).toBeNull();
  });

  it('retains repeated physical parts as separate source occurrences', () => {
    const repeated = byNumber('B3-002-05-010-F0');
    expect(repeated.length).toBeGreaterThan(4);
    expect(new Set(repeated.map((row) => row.id)).size).toBe(repeated.length);
    expect(byCallout('15_34')).toHaveLength(2);
    expect(byCallout('15_34').map((row) => row.oemNumber)).toEqual([
      'B3-001-05-014-F0',
      'B3-001-05-014-F0',
    ]);
    // Left/right covers share a drawing label but are two distinct parts.
    expect(new Set(byCallout('15_35').map((row) => row.oemNumber)).size).toBe(2);
  });

  it('keeps source anomalies and non-metric count cells available for review', () => {
    expect(byCallout('3_04')[0]).toMatchObject({
      oemNumber: 'B3-002-05-010-F0',
      originalDescription: 'Screw (M5*12)',
    });
    expect(byCallout('8_14')[0].dimensionsText).toBe('16O×92×75');
    expect(byCallout('17_15')[0].dimensionsText).toBe('13齿');
    expect(byCallout('17_17')[0].dimensionsText).toBe('42节');
    expect(byCallout('24_04')[0].dimensionsText).toBe('17inches, 25×1');
    expect(byCallout('22_15')[0]).toMatchObject({ figure: '24', assemblyKey: 'supermoto' });
    expect(byCallout('22_15')[0].reviewFlags).toContain('callout-figure-conflict');
  });

  it('retains the printed measurement units without converting counts to millimetres', () => {
    expect(byCallout('17_07')[0]).toMatchObject({
      dimensionsText: '26×26×8',
      dimensionUnitText: 'mm (column heading; explicit cell units take precedence)',
      weightText: '0,0035',
      weightUnitText: 'kg (column heading)',
    });
    expect(byCallout('17_15')[0].dimensionsText).toBe('13齿');
    expect(byCallout('17_15')[0]).toHaveProperty(
      'dimensionUnitText',
      'mm (column heading; explicit cell units take precedence)',
    );
    expect(byCallout('25_1')[0]).not.toHaveProperty('dimensionUnitText');
    expect(byCallout('25_1')[0]).not.toHaveProperty('weightUnitText');
  });

  it('reconciles the clipped brake-pad cell across the page boundary', () => {
    expect(byCallout('16_03').map((row) => [row.page, row.oemNumber, row.quantity])).toEqual([
      [14, '52191-YQ2A-0100', 4],
      [15, '52191-YQ2B-0100', 4],
    ]);
  });

  it('records diagram-only callouts as explicit exceptions rather than invented rows', () => {
    expect(extraction.pages.flatMap((page) => page.exceptions.map((item) => item.callout))).toEqual(
      ['4_09', '10_31', '10_32'],
    );
    expect(byCallout('4_09')).toEqual([]);
    expect(byCallout('10_31')).toEqual([]);
    expect(byCallout('10_32')).toEqual([]);
  });

  it('identifies historical edition context without claiming later-model fitment', () => {
    expect(extraction.source.modelYears).toEqual([2021]);
    expect(extraction.source.applicabilityNotes).toContain(
      'not an explicit production-year fitment',
    );
    expect(rows.every((row) => row.modelYears.length === 1 && row.modelYears[0] === 2021)).toBe(
      true,
    );
    expect(
      rows.every((row) => row.applicability?.includes('cross-year fitment are unverified')),
    ).toBe(true);
    expect(byCallout('23_04')[0].itemType).toBe('optional');
    expect(byCallout('25_1')[0].itemType).toBe('optional');
  });
});
