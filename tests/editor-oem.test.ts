import { describe, expect, it } from 'vitest';
import { demoCatalog } from '../src/data/catalog';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { toExplorerCatalog } from '../src/oem/adapter';
import { applyReviewPatches } from '../src/oem/review';
import {
  indexCatalogTargets,
  mergeCatalogIntoProject,
  searchCatalogTargets,
} from '../src/editor/catalog-tools';
import { parseEditorProject, type EditorProject } from '../src/editor/storage';

const project = (): EditorProject => ({
  version: 1,
  catalog: structuredClone(demoCatalog),
  mapping: {
    version: 1,
    assetId: 'precise.glb',
    units: 'm',
    upAxis: 'Y',
    mappings: [{ objectKey: '$/shaft[0]', partId: 'shaft' }],
  },
  assetFileName: 'precise.glb',
});

describe('OEM mapping target catalog', () => {
  it('finds all source occurrences by OEM without collapsing physical identity', () => {
    const matches = searchCatalogTargets(indexCatalogTargets(oemCatalog), 'Z-6000-2Z-26-10-08');
    expect(matches.length).toBeGreaterThan(2);
    expect(matches.every((part) => part.oemNumber === 'Z-6000-2Z-26-10-08')).toBe(true);
    expect(new Set(matches.map((part) => part.id)).size).toBe(matches.length);
    const occurrence = matches.find((part) => part.parentId === 'jackshaft')!;
    expect(searchCatalogTargets(indexCatalogTargets(oemCatalog), occurrence.id)).toEqual([
      occurrence,
    ]);
    expect(
      searchCatalogTargets(indexCatalogTargets(oemCatalog), 'Z-6000-2Z-26-10-08 midshaft'),
    ).toContainEqual(occurrence);
  });

  it('applies saved review names to targets while retaining immutable source and identity', () => {
    const occurrenceId = oemDatabase.occurrences[0].id;
    const reviewed = toExplorerCatalog(
      applyReviewPatches(oemDatabase, {
        version: 1,
        patches: [
          {
            occurrenceId,
            normalizedName: 'Reviewed custom frame terminology',
            note: 'Source checked',
            updatedAt: '2026-10-14T00:00:00Z',
          },
        ],
      }),
    );
    const entry = searchCatalogTargets(
      indexCatalogTargets(reviewed),
      'Reviewed custom frame terminology',
    )[0];
    const original = oemCatalog.parts.find((part) => part.id === occurrenceId)!;
    expect(entry.id).toBe(original.id);
    expect(entry.specifications['Catalog identity']).toBe(
      original.specifications['Catalog identity'],
    );
    expect(entry.description).toBe(original.description);
    expect(entry.sources).toEqual(original.sources);
  });

  it('merges additively without replacing custom records, mappings, or geometry', () => {
    const input = project();
    input.catalog.parts.find((part) => part.id === 'frame')!.name = 'My precisely modeled frame';
    const before = structuredClone(input);
    const result = mergeCatalogIntoProject(input, oemCatalog);
    expect(result.addedCount).toBeGreaterThan(1000);
    expect(result.retainedDifferences).toContain('frame');
    expect(result.project.mapping).toBe(input.mapping);
    expect(result.project.assetFileName).toBe('precise.glb');
    for (const part of before.catalog.parts)
      expect(result.project.catalog.parts.find((entry) => entry.id === part.id)).toEqual(part);
    expect(input).toEqual(before);
    expect(() => parseEditorProject(result.project)).not.toThrow();
    expect(mergeCatalogIntoProject(result.project, oemCatalog).addedCount).toBe(0);
  });

  it('rejects merging a different motorcycle without changing the project', () => {
    const input = project();
    const before = structuredClone(input);
    expect(() =>
      mergeCatalogIntoProject(input, { ...oemCatalog, motorcycleId: 'other-bike' }),
    ).toThrow('different motorcycle');
    expect(input).toEqual(before);
  });
});
