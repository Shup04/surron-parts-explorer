import { describe, expect, it } from 'vitest';
import { validateCatalog } from '../src/core/catalog';
import { validateMapping } from '../src/core/mapping';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { buildCuratedNavigation } from '../src/navigation/model';
import {
  projectParts,
  projectPartsAsset,
  projectPartsMapping,
  withProjectParts,
} from '../src/config/project-parts';

describe('supplied project assembly', () => {
  it('maps the styled assembly, hardware, rear wheel and rear shock without pulleys', () => {
    const catalog = withProjectParts(oemCatalog);
    expect(validateCatalog(catalog).success).toBe(true);
    expect(validateMapping(projectPartsMapping, catalog).success).toBe(true);
    expect(projectPartsAsset.models).toHaveLength(88);
    expect(new Set(projectPartsMapping.mappings.map((entry) => entry.objectKey)).size).toBe(88);
    expect(new Set(projectPartsMapping.mappings.map((entry) => entry.partId)).size).toBe(88);
    expect(projectParts.reduce((sum, part) => sum + part.triangles, 0)).toBe(1815043);
    expect(projectParts.some((part) => part.id === 'jackshaft-pulley')).toBe(false);
    expect(projectParts.some((part) => part.id === 'motor-pulley')).toBe(false);
    expect(projectParts.find((part) => part.id === 'main-frame')?.triangles).toBe(60000);
    expect(catalog.parts.filter((part) => part.id.startsWith('project-'))).toHaveLength(88);
    expect(oemCatalog.parts.some((part) => part.id.startsWith('project-'))).toBe(false);
    expect(withProjectParts(catalog)).toEqual(catalog);
  });

  it('makes every supplied part reachable through its physical role', () => {
    const catalog = withProjectParts(oemCatalog);
    const navigation = buildCuratedNavigation(oemDatabase, catalog);
    for (const part of projectParts) {
      const node = navigation.byId.get(part.role);
      expect(node, part.role).toBeDefined();
      expect(node?.modelPartIds).toContain(`project-${part.id}`);
    }
    expect(navigation.byId.get('nav.swingarm.arm')?.modelPartIds).toEqual(['project-swingarm']);
    expect(navigation.byId.get('nav.frame.subframe')?.modelPartIds).toEqual(['project-subframe']);
    expect(navigation.byId.get('nav.frame.fasteners')?.modelPartIds).toHaveLength(2);
    expect(projectParts.find((part) => part.id === 'swingarm')?.materials).toEqual([
      'Deep Purple Metallic',
    ]);
    expect(projectParts.find((part) => part.id === 'subframe')?.materials).toEqual(['Black Metal']);
  });

  it('keeps geometry valid when source filters remove its source assembly', () => {
    const rootOnly = { ...oemCatalog, parts: oemCatalog.parts.filter((part) => !part.parentId) };
    const filtered = withProjectParts(rootOnly);
    expect(validateCatalog(filtered).success).toBe(true);
    expect(validateMapping(projectPartsMapping, filtered).success).toBe(true);
    expect(filtered.parts.filter((part) => part.parentId === filtered.motorcycleId)).toHaveLength(
      88,
    );
  });
});
