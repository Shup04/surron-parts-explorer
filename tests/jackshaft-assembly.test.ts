import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import assembly from '../data/models/jackshaft-assembly.json';
import { projectParts, projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import { buildCatalogIndex } from '../src/core/catalog';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { createProjectWorkspace } from '../src/editor/project-workspace';
import { assemblyExplosion, buildModeledNavigation } from '../src/navigation/modeled';
import { navigationAncestors } from '../src/navigation/model';
import { wrapPartModel } from '../src/viewer/part-models';
import {
  disposeScene,
  explosionTargets,
  prepareScene,
  updateVisibility,
} from '../src/viewer/scene';

const catalog = withProjectParts(oemCatalog);
const index = buildCatalogIndex(catalog);
const ids = assembly.instances
  .filter((part) => part.spec !== 'pivot-washer')
  .map((part) => `project-${part.id}`);
const navigation = buildModeledNavigation(
  oemDatabase,
  catalog,
  new Set(projectPartsMapping.mappings.map((entry) => entry.partId)),
);
const scene = new Group();
const models = new Map<string, Group>();

beforeAll(async () => {
  for (const instance of assembly.instances) {
    const model = projectParts.find((part) => part.id === instance.id)!;
    const bytes = await readFile(`public/parts/${model.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
    expect(bytes.length).toBe(model.bytes);
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    const wrapper = wrapPartModel(gltf.scene, instance.id);
    models.set(instance.id, wrapper);
    scene.add(wrapper);
  }
  scene.updateMatrixWorld(true);
});
afterAll(() => disposeScene(scene));

describe('manual-based jackshaft assembly', () => {
  it('groups all 21 jackshaft parts, keeps the pivot washer with the swingarm, and uses the same mapping in the editor', () => {
    const node = navigation.byId.get('nav.jackshaft.assembly')!;
    expect(new Set(node.modelPartIds)).toEqual(new Set(ids));
    expect(assemblyExplosion(node)).toBe(1);
    expect(navigation.byId.get('nav.jackshaft.bearings')?.modelPartIds).toHaveLength(3);
    expect(navigation.byId.get('nav.jackshaft.sprocket-bolts')?.modelPartIds).toHaveLength(6);
    expect(navigation.byId.get('nav.jackshaft.pulley-bolts')?.modelPartIds).toHaveLength(6);
    expect(navigationAncestors(navigation, 'nav.jackshaft.inner-spacer')).toEqual([
      'jackshaft',
      node.id,
    ]);
    expect(navigation.byId.get('nav.swingarm.pivot-washer')?.parentId).toBe('swingarm');
    expect(node.modelPartIds).not.toContain('project-swingarm-pivot-washer');
    expect(createProjectWorkspace(oemCatalog).mapping).toEqual(projectPartsMapping);
    const bearing = index.byId.get('project-jackshaft-bearing-left')!;
    expect(bearing.oemNumber).toBeNull();
    expect(bearing.genericDesignation).toContain('2RS');
    expect(bearing.specifications['Catalog reference']).toContain('2Z');
    expect(bearing.verification).toBe('unknown');
  });

  it('exports the actual parts at the pivot axis, preserves the axial stack, and uses the correct bolt circles', () => {
    const bounds = (id: string) => new Box3().setFromObject(models.get(`jackshaft-${id}`)!, true);
    expect(bounds('right-spacer').max.x).toBeCloseTo(bounds('bearing-right-outer').min.x, 3);
    expect(bounds('bearing-right-outer').max.x).toBeCloseTo(bounds('bearing-right-inner').min.x, 3);
    expect(bounds('bearing-right-inner').max.x).toBeCloseTo(bounds('inner-spacer').min.x, 3);
    expect(bounds('inner-spacer').max.x).toBeCloseTo(bounds('bearing-left').min.x, 3);
    expect(bounds('bearing-left').max.x).toBeCloseTo(bounds('left-spacer').min.x, 3);
    for (const instance of assembly.instances) {
      const wrapper = models.get(instance.id)!;
      let physical: Object3D | undefined;
      wrapper.traverse((object) => {
        if (object.userData.source_object === instance.sourceObject) physical = object;
      });
      expect(physical, instance.id).toBeDefined();
      const [x, y, z] = instance.positionMm;
      expect(
        physical!.getWorldPosition(new Vector3()).distanceTo(new Vector3(x, z, -y)),
      ).toBeLessThan(0.0001);
      const axis = new Vector3(0, 1, 0).transformDirection(physical!.matrixWorld);
      expect(axis.distanceTo(new Vector3(...instance.axis))).toBeLessThan(0.0001);
      wrapper.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const coordinates = object.geometry.getAttribute('position');
        expect([...coordinates.array].every(Number.isFinite)).toBe(true);
      });
      if (instance.spec.endsWith('-bolt')) {
        const center = new Box3().setFromObject(wrapper, true).getCenter(new Vector3());
        expect(
          Math.hypot(center.y - assembly.axis.centerMm[2], center.z + assembly.axis.centerMm[1]),
        ).toBeCloseTo(instance.spec === 'sprocket-bolt' ? 17.5 : 21, 3);
      }
    }
  });

  it('explodes coaxially in manual order, keeps each bolt set together, and reassembles without drift', () => {
    const records = prepareScene(scene, projectPartsMapping);
    expect(records).toHaveLength(22);
    expect(records.every((record) => !record.automatic)).toBe(true);
    expect(updateVisibility(scene, index, 'jackshaft', [], null, ids)).toBe(25);
    const before = new Map(
      [...models].map(([id, object]) => [id, new Box3().setFromObject(object, true)]),
    );
    for (const amount of [1, 0.4, 1, 0, 1, 0]) {
      const targets = explosionTargets(records, index, 'jackshaft', amount, ids);
      targets.forEach((position, object) => object.position.copy(position));
      scene.updateMatrixWorld(true);
      for (const instance of assembly.instances) {
        const model = models.get(instance.id)!;
        expect(model.position.toArray()).toEqual([
          instance.spec === 'pivot-washer' || amount === 0
            ? 0
            : instance.explosionOffsetMm * amount,
          0,
          0,
        ]);
        if (amount === 0) {
          const restored = new Box3().setFromObject(model, true);
          expect(restored.min.distanceTo(before.get(instance.id)!.min)).toBe(0);
          expect(restored.max.distanceTo(before.get(instance.id)!.max)).toBe(0);
        }
      }
      if (amount === 1) {
        const spacer = new Box3().setFromObject(models.get('jackshaft-right-spacer')!, true);
        for (const instance of assembly.instances.filter((part) => part.spec === 'sprocket-bolt')) {
          const bolt = new Box3().setFromObject(models.get(instance.id)!, true);
          const seal = new Box3().setFromObject(models.get('jackshaft-right-seal')!, true);
          expect(spacer.max.x).toBeLessThan(bolt.min.x);
          expect(bolt.max.x).toBeLessThan(seal.min.x);
        }
        const order = [
          'right-spacer',
          'right-seal',
          'bearing-right-outer',
          'bearing-right-inner',
          'inner-spacer',
          'body',
          'bearing-left',
          'left-seal',
          'left-spacer',
        ];
        for (let i = 1; i < order.length; i++) {
          const previous = new Box3().setFromObject(models.get(`jackshaft-${order[i - 1]}`)!, true);
          const current = new Box3().setFromObject(models.get(`jackshaft-${order[i]}`)!, true);
          expect(previous.max.x).toBeLessThan(current.min.x);
        }
      }
    }
  });
});
