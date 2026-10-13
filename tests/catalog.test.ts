import { describe, expect, it } from 'vitest';
import { demoCatalog } from '../src/data/catalog';
import {
  buildCatalogIndex,
  getAncestors,
  getAssemblyForPart,
  getChildren,
  getDescendants,
  searchParts,
  validateCatalog,
} from '../src/core/catalog';
import { createExplorerUrl, parseExplorerUrl } from '../src/core/navigation';
import {
  createUnknownPart,
  exportCatalogCsv,
  exportCatalogJson,
  importCatalogCsv,
  importCatalogJson,
  parseCsv,
} from '../src/core/import-export';

const clone = () => structuredClone(demoCatalog);
const index = buildCatalogIndex(demoCatalog);

describe('catalog hierarchy and search', () => {
  it('never assigns mechanical facts to demonstration content', () => {
    expect(validateCatalog(demoCatalog).success).toBe(true);
    for (const part of demoCatalog.parts) {
      expect(part.verification).toBe('demonstration');
      expect([part.oemNumber, part.genericDesignation, part.quantity, part.material]).toEqual([
        null,
        null,
        null,
        null,
      ]);
      expect(part.compatibility).toEqual([]);
      expect(part.dimensions).toEqual([]);
    }
  });
  it('traverses nested assemblies in stable order', () => {
    expect(getAncestors(index, 'bearing-left').map((part) => part.id)).toEqual([
      'lbx',
      'drivetrain',
      'jackshaft',
    ]);
    expect(getChildren(index, 'jackshaft')).toHaveLength(8);
    expect(getDescendants(index, 'drivetrain').map((part) => part.id)).toContain('bearing-left');
    expect(getDescendants(index, 'shaft')).toEqual([]);
    expect(getAssemblyForPart(index, 'bearing-left').id).toBe('jackshaft');
  });
  it('rejects duplicate IDs, orphans and cycles with useful errors', () => {
    const duplicate = clone();
    duplicate.parts.push(duplicate.parts[0]);
    expect(
      validateCatalog(duplicate).issues.some((issue) => issue.message.includes('Duplicate')),
    ).toBe(true);
    const orphan = clone();
    orphan.parts[1].parentId = 'missing';
    expect(
      validateCatalog(orphan).issues.some((issue) => issue.message.includes('Missing parent')),
    ).toBe(true);
    const cycle = clone();
    cycle.parts.find((part) => part.id === 'drivetrain')!.parentId = 'jackshaft';
    expect(validateCatalog(cycle).issues.some((issue) => issue.message.includes('cycle'))).toBe(
      true,
    );
  });
  it('rejects components used as assembly parents and extra roots', () => {
    const data = clone();
    data.parts.find((part) => part.id === 'bearing-left')!.parentId = 'shaft';
    expect(validateCatalog(data).success).toBe(false);
    data.parts[1].parentId = null;
    expect(validateCatalog(data).issues.some((issue) => issue.message.includes('root'))).toBe(true);
  });
  it.each([
    null,
    [],
    {},
    { version: 2 },
    { version: 1, motorcycleId: 'lbx', parts: [{ id: null }] },
  ])('rejects malformed data %#', (value) => expect(validateCatalog(value).success).toBe(false));
  it('indexes thousands of parts without recursive traversal', () => {
    const data = clone();
    for (let i = 0; i < 4000; i++)
      data.parts.push(
        createUnknownPart(
          `extra-${i}`,
          `Extra ${i}`,
          i === 0 ? 'lbx' : `extra-${i - 1}`,
          'assembly',
        ),
      );
    const largeIndex = buildCatalogIndex(data);
    expect(getDescendants(largeIndex, 'extra-0')).toHaveLength(3999);
    expect(getAncestors(largeIndex, 'extra-3999')).toHaveLength(4000);
  });
  it('searches OEM, generic designations, specifications and ancestors', () => {
    const data = clone();
    const part = data.parts.find((part) => part.id === 'bearing-left')!;
    part.oemNumber = 'TEST-ONLY-001';
    part.genericDesignation = 'DEMO-SEALED';
    part.specifications = { surface: 'test-finish' };
    const searchable = buildCatalogIndex(data);
    for (const query of ['TEST-ONLY-001', 'demo-sealed', 'test-finish', 'drivetrain bearing left'])
      expect(searchParts(searchable, query).map((part) => part.id)).toContain('bearing-left');
    expect(searchParts(searchable, '    ')).toEqual([]);
    expect(searchParts(searchable, 'does not exist')).toEqual([]);
  });
});

describe('deep links', () => {
  it('round trips a selected part in its assembly', () => {
    const location = { assemblyId: 'jackshaft', partId: 'bearing-left' };
    expect(parseExplorerUrl(createExplorerUrl(location), demoCatalog)).toEqual(location);
  });
  it('selecting a part without an assembly focuses its parent', () =>
    expect(parseExplorerUrl('?part=shaft', demoCatalog)).toEqual({
      assemblyId: 'jackshaft',
      partId: 'shaft',
    }));
  it('repairs incompatible assembly/part combinations', () =>
    expect(parseExplorerUrl('?assembly=battery&part=shaft', demoCatalog).assemblyId).toBe(
      'jackshaft',
    ));
  it('preserves an intentionally selected parent assembly', () =>
    expect(parseExplorerUrl('?assembly=drivetrain&part=shaft', demoCatalog).assemblyId).toBe(
      'drivetrain',
    ));
  it('falls back safely for missing objects and other motorcycles', () => {
    expect(parseExplorerUrl('?assembly=missing&part=missing', demoCatalog)).toEqual({
      assemblyId: 'lbx',
      partId: null,
    });
    expect(parseExplorerUrl('?motorcycle=other&part=shaft', demoCatalog)).toEqual({
      assemblyId: 'lbx',
      partId: null,
    });
    expect(parseExplorerUrl('?assembly=shaft&part=shaft', demoCatalog)).toEqual({
      assemblyId: 'jackshaft',
      partId: 'shaft',
    });
  });
});

describe('catalog import/export', () => {
  it('JSON and CSV preserve source punctuation, multiline notes, unknown values and metadata', () => {
    const data = clone();
    data.parts[1].description = 'A comma, a "quote"\nand a newline';
    data.parts[1].sources = [
      { document: 'User-supplied drawing', page: '1', notes: 'Exact "quoted" source, retained' },
    ];
    data.parts[1].oemNumber = '000123-TEST';
    expect(importCatalogJson(exportCatalogJson(data))).toEqual({ success: true, data, issues: [] });
    expect(importCatalogCsv(exportCatalogCsv(data))).toEqual({ success: true, data, issues: [] });
  });
  it('rejects malformed JSON and malformed CSV quoting', () => {
    expect(importCatalogJson('{bad').success).toBe(false);
    expect(importCatalogCsv('"unterminated').success).toBe(false);
    expect(() => parseCsv('"value"x,next')).toThrow();
  });
  it('rejects duplicate or missing CSV headers instead of silently losing data', () => {
    expect(
      importCatalogCsv('id,id\na,b').issues.some((issue) => issue.message.includes('Duplicate')),
    ).toBe(true);
    expect(
      importCatalogCsv('id,name\na,b').issues.some((issue) => issue.message.includes('Missing')),
    ).toBe(true);
  });
  it('validates imported hierarchy, including references to absent parts', () => {
    const data = clone();
    data.parts[1].crossReferences = ['not-present'];
    expect(importCatalogCsv(exportCatalogCsv(data)).success).toBe(false);
  });
  it('rejects unsupported nested source fields instead of silently deleting provenance', () => {
    const data = clone();
    const malformed = {
      ...data,
      parts: data.parts.map((part, i) =>
        i
          ? part
          : { ...part, sources: [{ document: 'Factory drawing', edition: 'unrecognized field' }] },
      ),
    };
    const imported = importCatalogJson(JSON.stringify(malformed));
    expect(imported.success).toBe(false);
    expect(imported.issues.some((issue) => issue.path === 'parts.0.sources.0')).toBe(true);
  });
});
