import { describe, expect, it } from 'vitest';
import { Group, Mesh } from 'three';
import { demoCatalog } from '../src/data/catalog';
import {
  classifyObjects,
  getObjectKey,
  resolveMapping,
  suggestMappings,
  validateMapping,
} from '../src/core/mapping';
import {
  automaticExplosion,
  easeProgress,
  explodedPosition,
  explosionOffset,
} from '../src/core/explosion';
import type { Explosion, MappingConfig, SceneObjectInfo, Vec3 } from '../src/core/types';
import { exportMappingJson, importMappingJson } from '../src/core/import-export';

const objects: SceneObjectInfo[] = [
  { key: 'id:one', name: 'shaft', parentKey: '$', mesh: true, position: [0, 0, 0] },
  { key: 'id:two', name: 'bearing-left', parentKey: '$', mesh: true, position: [0, 0, 0] },
];
const mapping: MappingConfig = {
  version: 1,
  assetId: 'test-asset',
  units: 'm',
  upAxis: 'Y',
  mappings: [{ objectKey: 'id:one', partId: 'shaft' }],
};

describe('mesh-to-part mapping', () => {
  it('resolves one part from one object and supports many objects per part', () => {
    const config = {
      ...mapping,
      mappings: [...mapping.mappings, { objectKey: 'id:two', partId: 'shaft' }],
    };
    expect(validateMapping(config, demoCatalog, objects).success).toBe(true);
    expect(resolveMapping(config, 'id:two')?.partId).toBe('shaft');
  });
  it('rejects ambiguous mappings and never picks an arbitrary result', () => {
    const config = {
      ...mapping,
      mappings: [...mapping.mappings, { objectKey: 'id:one', partId: 'bearing-left' }],
    };
    expect(validateMapping(config, demoCatalog, objects).success).toBe(false);
    expect(resolveMapping(config, 'id:one')).toBeUndefined();
    expect(classifyObjects(objects, config)[0].status).toBe('ambiguous');
  });
  it('distinguishes mapped and unmapped objects', () =>
    expect(classifyObjects(objects, mapping).map((entry) => entry.status)).toEqual([
      'mapped',
      'unmapped',
    ]));
  it('reports inherited assembly mappings consistently with viewer selection', () => {
    const hierarchy: SceneObjectInfo[] = [
      { key: '$', name: 'Root', parentKey: null, mesh: false, position: [0, 0, 0] },
      ...objects,
    ];
    const groupMapping = {
      ...mapping,
      mappings: [{ objectKey: '$', partId: 'jackshaft' }, ...mapping.mappings],
    };
    const result = classifyObjects(hierarchy, groupMapping, demoCatalog, true);
    expect(result.map((entry) => entry.status)).toEqual(['mapped', 'mapped', 'mapped']);
    expect(result[1].partIds).toEqual(['shaft']);
    expect(result[2].partIds).toEqual(['jackshaft']);
    expect(classifyObjects(hierarchy, groupMapping, demoCatalog)[2].status).toBe('unmapped');
  });
  it('detects stale references and duplicate persistent object IDs', () => {
    expect(validateMapping(mapping, demoCatalog, []).success).toBe(false);
    expect(validateMapping(mapping, demoCatalog, [...objects, objects[0]]).success).toBe(false);
    expect(
      validateMapping(
        { ...mapping, mappings: [{ objectKey: 'id:one', partId: 'missing' }] },
        demoCatalog,
      ).success,
    ).toBe(false);
  });
  it('preserves object keys across mounting, duplicate names and persistent-ID renaming', () => {
    const root = new Group(),
      outer = new Group(),
      a = new Mesh(),
      b = new Mesh();
    a.name = b.name = 'washer';
    root.add(a, b);
    expect(getObjectKey(a, root)).toBe('$/0:washer');
    expect(getObjectKey(b, root)).toBe('$/1:washer');
    outer.add(root);
    expect(getObjectKey(a, root)).toBe('$/0:washer');
    a.userData.objectId = 'stable-one';
    a.name = 'renamed';
    expect(getObjectKey(a, root)).toBe('id:stable-one');
  });
  it('requires accepting proposed exact-name matches rather than mutating mappings', () => {
    expect(suggestMappings(objects, demoCatalog)[0]).toEqual({
      objectKey: 'id:one',
      partIds: ['shaft'],
      exact: true,
    });
    expect(mapping.mappings).toHaveLength(1);
  });
  it('rejects invalid directions, units and camera positions', () => {
    expect(validateMapping({ ...mapping, units: 'mm' }).success).toBe(false);
    expect(
      validateMapping({
        ...mapping,
        mappings: [
          {
            ...mapping.mappings[0],
            explosion: { direction: [0, 0, 0], distance: 1, verification: 'unknown' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      validateMapping({ ...mapping, camera: { position: [0, 0, 0], target: [0, 0, 0] } }).success,
    ).toBe(false);
  });
  it('round trips mapping configuration exactly', () =>
    expect(importMappingJson(exportMappingJson(mapping), demoCatalog)).toEqual({
      success: true,
      data: mapping,
      issues: [],
    }));
});

describe('exploded transforms', () => {
  const axial: Explosion = { direction: [0, 0, -4], distance: 0.25, verification: 'demonstration' };
  it('normalizes configurable axial directions and honours fractional distance', () =>
    expect(explosionOffset(axial, 0.4)).toEqual([0, 0, -0.1]));
  it('preserves original transforms through repeated explode/reassemble cycles', () => {
    const original: Vec3 = [0.01, -0.002, 0.3];
    for (let cycle = 0; cycle < 100; cycle++) {
      expect(explodedPosition(original, axial, 1)).toEqual([0.01, -0.002, 0.04999999999999999]);
      expect(explodedPosition(original, axial, 0)).toEqual(original);
    }
    expect(original).toEqual([0.01, -0.002, 0.3]);
  });
  it('clamps control range and tolerates absent mappings', () => {
    expect(explosionOffset(axial, -10)).toEqual([0, 0, -0]);
    expect(explodedPosition([1, 2, 3], undefined, 1)).toEqual([1, 2, 3]);
    expect(explosionOffset(axial, 2)).toEqual([0, 0, -0.25]);
  });
  it('labels automatic layout as a demonstration and handles coincident centres', () => {
    const auto = automaticExplosion([0, 0, 0], [0, 0, 0], 0);
    expect(auto.verification).toBe('demonstration');
    expect(Math.hypot(...auto.direction)).toBeGreaterThan(0);
  });
  it('provides finite, endpoint-correct timing curves', () => {
    for (const easing of ['linear', 'smooth', 'cubic'] as const) {
      expect(easeProgress(0, easing)).toBe(0);
      expect(easeProgress(1, easing)).toBe(1);
      expect(easeProgress(0.5, easing)).toBeCloseTo(0.5);
    }
    expect(easeProgress(NaN)).toBe(0);
  });
});
