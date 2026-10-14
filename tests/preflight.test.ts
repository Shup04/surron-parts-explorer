import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { inspectGltfDocument } from '../src/core/model-validation';
import { inspectImport, preflightImportedModel } from '../src/editor/preflight';

const mesh = (name = 'component') => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  object.name = name;
  return object;
};
afterEach(() => vi.unstubAllGlobals());

describe('import preflight', () => {
  it('counts loaded meshes, shared geometry and hierarchy, with bounds in metres', () => {
    const scene = new THREE.Group();
    const assembly = new THREE.Group();
    const first = mesh('first');
    const second = new THREE.Mesh(first.geometry);
    second.position.x = 2;
    assembly.position.y = 4;
    assembly.add(first, second);
    scene.add(assembly);
    const report = inspectImport(scene);
    expect(report).toMatchObject({
      objects: 3,
      meshes: 2,
      triangles: 24,
      roots: 1,
      depth: 2,
      mappableMeshes: 2,
      dimensions: [3, 1, 1],
      scaleRange: [1, 1],
    });
    second.position.x = 20;
    expect(report.dimensions).toEqual([3, 1, 1]); // Snapshot does not follow explosion preview.
  });

  it('checks original exported names even when the loader renames objects', () => {
    const scene = new THREE.Group();
    scene.add(mesh('bearing'), mesh('bearing_1'), mesh('mesh_0'));
    const source = inspectGltfDocument({
      asset: { version: '2.0' },
      scenes: [{ nodes: [0, 1, 2] }],
      nodes: [
        { name: 'bearing', mesh: 0 },
        { name: 'bearing', mesh: 0 },
        { mesh: 0 },
        { name: 'unused' },
      ],
      meshes: [{ primitives: [{ attributes: {} }] }],
    });
    const report = inspectImport(scene, source);
    expect(report).toMatchObject({
      namedObjectsChecked: 3,
      unnamed: 1,
      duplicateNamed: 2,
      mappableMeshes: 3,
    });
    expect(report.warnings.join(' ')).toContain('unique names in Blender');
  });

  it('distinguishes duplicate names from ambiguous mapping keys', () => {
    const scene = new THREE.Group();
    const a = mesh('bearing');
    const b = mesh('bearing');
    a.userData.objectId = b.userData.objectId = 'duplicated-id';
    scene.add(a, b);
    expect(inspectImport(scene).mappableMeshes).toBe(0);
    expect(inspectImport(scene).warnings.join(' ')).toContain(
      '2 objects have ambiguous mapping identifiers',
    );
    b.userData.objectId = 'right-bearing';
    expect(inspectImport(scene).mappableMeshes).toBe(2);
    expect(inspectImport(scene).duplicateNamed).toBe(2);
  });

  it('reports negative, inherited extreme, nonuniform and zero scales without fixing them', () => {
    const scene = new THREE.Group();
    const parent = new THREE.Group();
    const part = mesh();
    parent.scale.set(0.001, 0.001, 0.001);
    part.scale.set(-1, 2, 0);
    parent.add(part);
    scene.add(parent);
    const report = inspectImport(scene);
    const warnings = report.warnings.join(' ');
    expect(report.scaleRange).toEqual([0, 0.002]);
    expect(warnings).toContain('negative or mirrored');
    expect(warnings).toContain('inherited scale factors');
    expect(warnings).toContain('unequal effective axis scales');
    expect(warnings).toContain('zero or non-finite');
    expect(parent.scale.toArray()).toEqual([0.001, 0.001, 0.001]);
    expect(part.scale.toArray()).toEqual([-1, 2, 0]);
  });

  it('checks matrix-authored transforms as well as ordinary TRS transforms', () => {
    const scene = new THREE.Group();
    const part = mesh();
    part.matrixAutoUpdate = false;
    part.matrix.makeScale(-101, 1, 1);
    const original = part.matrix.toArray();
    scene.add(part);
    const warnings = inspectImport(scene).warnings.join(' ');
    expect(warnings).toContain('negative or mirrored');
    expect(warnings).toContain('above 100');
    expect(part.matrix.toArray()).toEqual(original);
  });

  it('flags far local origins but not legitimately positioned components, without editing geometry', () => {
    const scene = new THREE.Group();
    const positioned = mesh('positioned');
    positioned.position.set(100, 20, 30);
    const offset = mesh('offset');
    offset.geometry.translate(10, 0, 0);
    const vertices = Array.from(offset.geometry.getAttribute('position').array);
    scene.add(positioned, offset);
    const report = inspectImport(scene);
    expect(report.warnings.join(' ')).toContain('1 static mesh origins');
    expect(report.warnings.join(' ')).toContain('may be intentional');
    expect(positioned.position.toArray()).toEqual([100, 20, 30]);
    expect(offset.name).toBe('offset');
    expect(Array.from(offset.geometry.getAttribute('position').array)).toEqual(vertices);
  });

  it('counts unindexed and instanced triangles while identifying instance-selection limits', () => {
    const scene = new THREE.Group();
    const instances = new THREE.InstancedMesh(new THREE.BoxGeometry().toNonIndexed(), undefined, 3);
    instances.userData.objectId = 'bolts';
    scene.add(instances);
    const report = inspectImport(scene);
    expect(report).toMatchObject({ meshes: 1, triangles: 36, mappableMeshes: 1 });
    expect(report.warnings.join(' ')).toContain('individual GPU instances are not selectable');
  });

  it('reports empty bounds and keeps scale warnings advisory', () => {
    expect(inspectImport(new THREE.Group()).dimensions).toBeNull();
    const scene = new THREE.Group();
    const part = mesh();
    part.scale.setScalar(2000);
    scene.add(part);
    expect(inspectImport(scene).dimensions).toEqual([2000, 2000, 2000]);
    expect(inspectImport(scene).warnings.join(' ')).toContain(
      'does not establish incorrect physical dimensions',
    );
  });

  it('falls back to loaded geometry if original metadata cannot be read', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unavailable')));
    const scene = new THREE.Group();
    scene.add(mesh());
    const report = await preflightImportedModel(scene, 'blob:local-model');
    expect(report.meshes).toBe(1);
    expect(report.warnings[0]).toContain('Original file names could not be inspected');
  });
});
