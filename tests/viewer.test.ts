import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { demoCatalog } from '../src/data/catalog';
import { oemCatalog } from '../src/data/oem';
import { buildCatalogIndex } from '../src/core/catalog';
import { getObjectKey } from '../src/core/mapping';
import { createDemoScene } from '../src/viewer/demo-scene';
import { savedCameraForScope, validateViewerAsset } from '../src/viewer/asset-validation';
import {
  disposeScene,
  cameraRangeForBounds,
  explosionTargets,
  frameBounds,
  mappedPartId,
  prepareScene,
  selectionAtLevel,
  updateVisibility,
  visibleBounds,
} from '../src/viewer/scene';
import type { AssetDefinition, MappingConfig } from '../src/core/types';

const index = buildCatalogIndex(demoCatalog);

describe('real Three.js scene integration', () => {
  it('spreads shared-origin imported parts at their geometry scale and restores them without drift', () => {
    const scene = new THREE.Group();
    scene.scale.setScalar(0.001);
    const groups = ['shaft', 'bearing-left', 'bearing-right'].map((id, i) => {
      const group = new THREE.Group();
      group.userData.partId = id;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 100, 100));
      mesh.position.z = (i - 1) * 150;
      group.add(mesh);
      scene.add(group);
      return group;
    });
    const records = prepareScene(scene);
    const ids = records.map((record) => record.partId);
    const targets = explosionTargets(records, index, 'jackshaft', 1, ids);
    expect(targets.get(groups[0])!.z).toBeLessThan(-100);
    expect(targets.get(groups[2])!.z).toBeGreaterThan(100);
    targets.forEach((position, object) => object.position.copy(position));
    const repeated = explosionTargets(records, index, 'jackshaft', 1, ids);
    targets.forEach((position, object) =>
      expect(repeated.get(object)!.toArray()).toEqual(position.toArray()),
    );
    const originals = explosionTargets(records, index, 'jackshaft', 0, ids);
    originals.forEach((position) => expect(position.toArray()).toEqual([0, 0, 0]));
    disposeScene(scene);
  });

  it('keeps large imported geometry inside the camera range after framing and zooming', () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-250, -35, -90),
      new THREE.Vector3(250, 35, 90),
    );
    const framing = frameBounds(bounds, 1.5, 38, new THREE.Vector3(0.75, 0.37, 1));
    const range = cameraRangeForBounds(bounds, framing.position, framing.target);
    const distance = framing.position.distanceTo(framing.target);
    const radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    expect(distance).toBeGreaterThan(100);
    expect(range.far).toBeGreaterThan(distance + radius);
    expect(range.far).toBeGreaterThan(range.maxDistance + radius);
    expect(range.maxDistance).toBeGreaterThan(distance);
    expect(range.near).toBeLessThan(range.minDistance);
    const focus = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.01, 0.01, 0.01));
    expect(cameraRangeForBounds(bounds, framing.position, framing.target, focus).near).toBeLessThan(
      0.0001,
    );
  });

  it('shows and explodes curated seats across source assemblies while excluding unrelated geometry', () => {
    const catalog = buildCatalogIndex(oemCatalog);
    const scene = new THREE.Group();
    const ids = ['occ-emotobykes-p12-r7', 'occ-lbx2021-p10-r4', 'body', null];
    const meshes = ids.map((id) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
      if (id) mesh.userData.partId = id;
      scene.add(mesh);
      return mesh;
    });
    const records = prepareScene(scene);
    const scope = ids.slice(0, 2) as string[];
    expect(updateVisibility(scene, catalog, 'body', [], null, scope)).toBe(2);
    expect(meshes.map((mesh) => mesh.layers.mask !== 0)).toEqual([true, true, false, false]);
    expect(mappedPartId(meshes[1])).toBe('occ-lbx2021-p10-r4');
    const exploded = explosionTargets(records, catalog, 'body', 1, scope);
    expect(exploded.get(meshes[1])!.length()).toBeGreaterThan(0);
    expect(exploded.get(meshes[2])!.length()).toBe(0);
    const assembled = explosionTargets(records, catalog, 'body', 0, scope);
    expect(assembled.get(meshes[1])!.toArray()).toEqual([0, 0, 0]);
    expect(updateVisibility(scene, catalog, 'body', [scope[0]], null, scope)).toBe(1);
    expect(updateVisibility(scene, catalog, 'body', [], scope[1], scope)).toBe(1);
    expect(meshes[1].layers.mask).not.toBe(0);
    disposeScene(scene);
  });

  it('keeps flat imported meshes of one component together in approximate mode', () => {
    const scene = new THREE.Group();
    const meshes = [new THREE.Mesh(), new THREE.Mesh(), new THREE.Mesh()];
    meshes[0].position.x = 0.01;
    meshes[1].position.x = -0.01;
    meshes.forEach((mesh, i) => {
      mesh.userData.partId = i < 2 ? 'bearing-left' : 'bearing-right';
      scene.add(mesh);
    });
    const records = prepareScene(scene);
    const targets = explosionTargets(records, index, 'jackshaft', 1);
    const leftOffset = targets.get(meshes[0])!.clone().sub(meshes[0].position);
    expect(
      targets.get(meshes[1])!.clone().sub(meshes[1].position).distanceTo(leftOffset),
    ).toBeLessThan(1e-10);
    expect(
      targets.get(meshes[2])!.clone().sub(meshes[2].position).distanceTo(leftOffset),
    ).toBeGreaterThan(0.1);
    disposeScene(scene);
  });

  it('fits all box corners within a narrow perspective camera without changing its angle', () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, -0.4, -0.2), new THREE.Vector3(1, 0.4, 0.2));
    const direction = new THREE.Vector3(0.75, 0.37, 1);
    const framing = frameBounds(box, 0.5, 38, direction);
    const camera = new THREE.PerspectiveCamera(38, 0.5, 0.001, 100);
    camera.position.copy(framing.position);
    camera.lookAt(framing.target);
    camera.updateMatrixWorld();
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1.000001);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1.000001);
        }
    expect(
      framing.position.clone().sub(framing.target).normalize().distanceTo(direction.normalize()),
    ).toBeLessThan(1e-10);
  });

  it('provides separately selectable demo geometry for every catalog item except the root', () => {
    const scene = createDemoScene();
    const records = prepareScene(scene);
    const ids = new Set(records.map((record) => record.partId));
    for (const part of demoCatalog.parts)
      if (part.id !== demoCatalog.motorcycleId) expect(ids.has(part.id), part.id).toBe(true);
    const shaft = scene.getObjectByName('shaft')!;
    expect(mappedPartId(shaft.children[0])).toBe('shaft');
    expect(visibleBounds(scene).isEmpty()).toBe(false);
    disposeScene(scene);
  });

  it('selects the immediate assembly until internal components are opened', () => {
    expect(selectionAtLevel(index, 'bearing-left', 'lbx')).toBe('drivetrain');
    expect(selectionAtLevel(index, 'bearing-left', 'drivetrain')).toBe('jackshaft');
    expect(selectionAtLevel(index, 'bearing-left', 'jackshaft')).toBe('bearing-left');
  });

  it('isolates nested assemblies and removes unrelated meshes from raycasting', () => {
    const scene = createDemoScene();
    prepareScene(scene);
    updateVisibility(scene, index, 'jackshaft', [], null);
    const wheel = scene.getObjectByName('front-wheel')!.children[0];
    const shaft = scene.getObjectByName('shaft')!.children[0];
    expect(wheel.visible).toBe(false);
    expect(wheel.layers.mask).toBe(0);
    expect(shaft.visible).toBe(true);
    expect(shaft.layers.mask).toBe(1);
    updateVisibility(scene, index, 'lbx', [], null);
    expect(wheel.visible).toBe(true);
    expect(wheel.layers.mask).toBe(1);
    disposeScene(scene);
  });

  it('keeps child components visible when their imported parent is itself a hidden mesh', () => {
    const scene = new THREE.Group();
    const parent = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    parent.userData.partId = 'drivetrain';
    const child = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    child.userData.partId = 'shaft';
    parent.add(child);
    scene.add(parent);
    prepareScene(scene);
    updateVisibility(scene, index, 'jackshaft', [], null);
    expect(parent.visible).toBe(true);
    expect(parent.layers.mask).toBe(0);
    expect(child.visible).toBe(true);
    expect(child.layers.mask).toBe(1);
    expect(visibleBounds(scene).getSize(new THREE.Vector3()).x).toBeCloseTo(0.1);
    disposeScene(scene);
  });

  it('combines descendant hiding with individual component isolation', () => {
    const scene = createDemoScene();
    prepareScene(scene);
    updateVisibility(scene, index, 'jackshaft', [], 'bearing-left');
    expect(scene.getObjectByName('bearing-left')!.children[0].visible).toBe(true);
    expect(scene.getObjectByName('bearing-right')!.children[0].visible).toBe(false);
    updateVisibility(scene, index, 'lbx', ['drivetrain'], null);
    expect(scene.getObjectByName('bearing-left')!.children[0].visible).toBe(false);
    expect(scene.getObjectByName('front-wheel')!.children[0].visible).toBe(true);
    disposeScene(scene);
  });

  it('explodes the mechanical sample axially and restores exact original transforms', () => {
    const scene = createDemoScene();
    const records = prepareScene(scene);
    const left = records.find((record) => record.partId === 'bearing-left')!;
    const right = records.find((record) => record.partId === 'bearing-right')!;
    const targets = explosionTargets(records, index, 'jackshaft', 1);
    expect(targets.get(left.object)!.toArray()).toEqual([0, 0, left.original[2] - 0.12]);
    expect(targets.get(right.object)!.toArray()).toEqual([0, 0, right.original[2] + 0.12]);
    targets.forEach((position, object) => object.position.copy(position));
    const originals = explosionTargets(records, index, 'jackshaft', 0);
    originals.forEach((position, object) => object.position.copy(position));
    for (const record of records) expect(record.object.position.toArray()).toEqual(record.original);
    disposeScene(scene);
  });

  it('does not accumulate drift or move child objects twice', () => {
    const scene = createDemoScene();
    const records = prepareScene(scene);
    const targets = explosionTargets(records, index, 'drivetrain', 1);
    const shaft = records.find((record) => record.partId === 'shaft')!;
    const jack = records.find((record) => record.partId === 'jackshaft')!;
    expect(targets.get(shaft.object)!.toArray()).toEqual(shaft.original);
    expect(targets.get(jack.object)!.toArray()).not.toEqual(jack.original);
    targets.forEach((position, object) => object.position.copy(position));
    const refreshed = prepareScene(scene);
    expect(refreshed.find((record) => record.partId === 'jackshaft')!.original).toEqual(
      jack.original,
    );
    disposeScene(scene);
  });

  it('maps replacement geometry by external keys, independent of mesh names', () => {
    const scene = new THREE.Group();
    const object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    object.name = 'Arbitrary imported mesh';
    object.userData.objectId = 'persistent-shaft';
    scene.add(object);
    const mapping: MappingConfig = {
      version: 1,
      assetId: 'replacement',
      units: 'm',
      upAxis: 'Y',
      mappings: [{ objectKey: getObjectKey(object, scene), partId: 'shaft' }],
    };
    const records = prepareScene(scene, mapping);
    expect(records[0].partId).toBe('shaft');
    expect(mappedPartId(object)).toBe('shaft');
    const mountedParent = new THREE.Group();
    mountedParent.add(scene);
    expect(prepareScene(scene, mapping)[0].partId).toBe('shaft');
    disposeScene(scene);
  });

  it('rejects ambiguous mesh mappings instead of choosing one silently', () => {
    const scene = new THREE.Group();
    const object = new THREE.Mesh();
    scene.add(object);
    const key = getObjectKey(object, scene);
    const mapping: MappingConfig = {
      version: 1,
      assetId: 'ambiguous',
      units: 'm',
      upAxis: 'Y',
      mappings: [
        { objectKey: key, partId: 'shaft' },
        { objectKey: key, partId: 'sprocket' },
      ],
    };
    expect(prepareScene(scene, mapping)).toHaveLength(0);
    expect(mappedPartId(object)).toBeNull();
  });

  it('does not resolve duplicate persistent object identifiers', () => {
    const scene = new THREE.Group();
    const first = new THREE.Mesh();
    const second = new THREE.Mesh();
    first.userData.objectId = 'duplicate';
    second.userData.objectId = 'duplicate';
    scene.add(first, second);
    const mapping: MappingConfig = {
      version: 1,
      assetId: 'invalid',
      units: 'm',
      upAxis: 'Y',
      mappings: [{ objectKey: 'id:duplicate', partId: 'shaft' }],
    };
    expect(prepareScene(scene, mapping)).toHaveLength(0);
    expect(mappedPartId(first)).toBeNull();
    expect(mappedPartId(second)).toBeNull();
    disposeScene(scene);
  });

  it('computes component framing from visible geometry including instanced wheel tread', () => {
    const scene = createDemoScene();
    prepareScene(scene);
    updateVisibility(scene, index, 'front-wheel', [], null);
    const bounds = visibleBounds(scene, 'front-wheel', index);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(0.65);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeLessThan(0.75);
    updateVisibility(scene, index, 'jackshaft', [], 'bearing-left');
    expect(visibleBounds(scene).getSize(new THREE.Vector3()).x).toBeLessThan(0.12);
    disposeScene(scene);
  });
});

describe('configured production asset validation', () => {
  const asset: AssetDefinition = {
    id: 'jackshaft-model',
    assemblyId: 'jackshaft',
    label: 'Detailed jackshaft',
    url: '/models/jackshaft.glb',
    unit: 'm',
    upAxis: 'Y',
  };
  const mapping: MappingConfig = {
    version: 1,
    assetId: asset.id,
    units: 'm',
    upAxis: 'Y',
    mappings: [{ objectKey: 'id:shaft', partId: 'shaft' }],
    camera: { position: [1, 1, 1], target: [0, 0, 0] },
  };
  function fixture() {
    const scene = new THREE.Group();
    const shaft = new THREE.Mesh();
    shaft.userData.objectId = 'shaft';
    scene.add(shaft);
    return scene;
  }

  it('uses a saved camera for a dedicated assembly model and not for its descendants', () => {
    expect(savedCameraForScope(mapping, asset, 'jackshaft', 'lbx')).toEqual(mapping.camera);
    expect(savedCameraForScope(mapping, asset, 'shaft', 'lbx')).toBeUndefined();
    expect(
      savedCameraForScope(mapping, { ...asset, assemblyId: 'lbx' }, 'jackshaft', 'lbx'),
    ).toBeUndefined();
    expect(savedCameraForScope(mapping, undefined, 'lbx', 'lbx')).toEqual(mapping.camera);
  });

  it('accepts a valid mapped assembly and rejects mismatched model IDs', () => {
    const scene = fixture();
    expect(validateViewerAsset(asset, demoCatalog, mapping, scene)).toBeNull();
    expect(
      validateViewerAsset(asset, demoCatalog, { ...mapping, assetId: 'wrong-model' }, scene),
    ).toContain('does not match loaded asset');
    disposeScene(scene);
  });

  it('rejects catalog and scene references that are absent from the loaded model', () => {
    const scene = fixture();
    expect(
      validateViewerAsset(
        asset,
        demoCatalog,
        { ...mapping, mappings: [{ objectKey: 'id:shaft', partId: 'unknown-part' }] },
        scene,
      ),
    ).toContain('Unknown catalog part');
    expect(
      validateViewerAsset(
        asset,
        demoCatalog,
        { ...mapping, mappings: [{ objectKey: 'id:missing', partId: 'shaft' }] },
        scene,
      ),
    ).toContain('Missing model object');
    const duplicate = new THREE.Mesh();
    duplicate.userData.objectId = 'shaft';
    scene.add(duplicate);
    expect(validateViewerAsset(asset, demoCatalog, mapping, scene)).toContain(
      'Duplicate model object identifier',
    );
    disposeScene(scene);
  });

  it('reports absent mappings, invalid assembly roots and unsafe coordinate declarations', () => {
    expect(validateViewerAsset(asset, demoCatalog, undefined)).toContain(
      'no mapping configuration',
    );
    expect(validateViewerAsset({ ...asset, assemblyId: 'shaft' }, demoCatalog, mapping)).toContain(
      'not a catalog assembly',
    );
    expect(
      validateViewerAsset(
        { ...asset, unit: 'mm' } as unknown as AssetDefinition,
        demoCatalog,
        mapping,
      ),
    ).toContain('metres and Y-up');
  });
});
