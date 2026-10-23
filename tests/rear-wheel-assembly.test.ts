import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Box3, Group, Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import assembly from '../data/models/rear-wheel-assembly.json';
import contours from '../data/models/rear-wheel-contours.json';
import { projectParts, projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import { buildCatalogIndex } from '../src/core/catalog';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { buildModeledNavigation, geometrySelectionAssembly } from '../src/navigation/modeled';
import { wrapPartModel } from '../src/viewer/part-models';
import { disposeScene, explosionTargets, prepareScene } from '../src/viewer/scene';

const catalog = withProjectParts(oemCatalog);
const index = buildCatalogIndex(catalog);
const ids = assembly.instances.map((part) => `project-${part.id}`);
const navigation = buildModeledNavigation(
  oemDatabase,
  catalog,
  new Set(projectPartsMapping.mappings.map((m) => m.partId)),
);
const scene = new Group();
const models = new Map<string, Group>();

beforeAll(async () => {
  for (const instance of assembly.instances) {
    const model = projectParts.find((part) => part.id === instance.id)!;
    const bytes = await readFile(`public/parts/${model.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
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

describe('rear wheel built around the existing hub', () => {
  it('opens an eight-group parent before any of its 18 assets can be picked separately', () => {
    const node = navigation.byId.get('nav.rear-wheel.assembly')!;
    expect(node.children.map((child) => child.name)).toEqual([
      'Hub',
      'Rim',
      'Spokes',
      'Rear sprocket',
      'Bolts',
      'Disc',
      'Tire',
      'Inner tube',
    ]);
    expect(new Set(node.modelPartIds)).toEqual(new Set(ids));
    expect(navigation.byId.get('nav.rear-wheel.fasteners')?.modelPartIds).toHaveLength(11);
    expect(node.modelPartIds).not.toContain('project-rear-brake-bracket');
    for (const id of ids) {
      expect(geometrySelectionAssembly(navigation, undefined, id)).toBe(node);
      expect(geometrySelectionAssembly(navigation, navigation.byId.get('rear-wheel'), id)).toBe(
        node,
      );
      expect(geometrySelectionAssembly(navigation, node, id)).toBe(
        id === 'project-rear-hub' ? navigation.byId.get('nav.rear-wheel.hub') : undefined,
      );
    }
  });

  it('preserves the hub and the portal coordinate scale while exporting finite, bounded geometry', () => {
    expect(projectParts.find((part) => part.id === 'rear-hub')?.sha256).toBe(
      '309cdf8af4c2cd84f2b7dc9fe434a0556a789dc32497cbdd392afac6188b527c',
    );
    for (const instance of assembly.instances) {
      const model = projectParts.find((part) => part.id === instance.id)!;
      const wrapper = models.get(instance.id)!;
      const box = new Box3().setFromObject(wrapper, true);
      const [min, max] = model.sourceWorldBounds;
      expect(box.min.distanceTo(new Vector3(min[0], min[2], -max[1]))).toBeLessThan(0.001);
      expect(box.max.distanceTo(new Vector3(max[0], max[2], -min[1]))).toBeLessThan(0.001);
      let triangles = 0;
      wrapper.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        expect([...positions.array].every(Number.isFinite)).toBe(true);
        triangles += (object.geometry.index?.count ?? positions.count) / 3;
      });
      expect(triangles).toBe(model.triangles);
    }
    const rim = new Box3().setFromObject(models.get('rear-rim-18')!, true).getSize(new Vector3());
    expect(rim.y).toBeCloseTo(477, 2);
    expect(rim.x).toBeCloseTo(50, 2);
    const tire = new Box3().setFromObject(models.get('rear-tire-18')!, true).getSize(new Vector3());
    expect(tire.y).toBeGreaterThan(600);
    expect(tire.y).toBeLessThan(612);
  });

  it('keeps actual mounting bores open and places the correct five and six fasteners at them', () => {
    for (const kind of ['sprocket', 'disc'] as const) {
      const part = models.get(kind === 'disc' ? 'rear-disc' : 'rear-sprocket-48t')!;
      expect(assembly.mounts[kind].holes).toHaveLength(kind === 'disc' ? 6 : 5);
      for (const [i, hole] of assembly.mounts[kind].holes.entries()) {
        const [y, z] = hole.centerYZ;
        const ray = new Raycaster(new Vector3(200, z, -y), new Vector3(-1, 0, 0));
        expect(ray.intersectObject(part, true), `${kind} mounting hole ${i + 1}`).toHaveLength(0);
        const bolt = models.get(`rear-${kind}-bolt-${String(i + 1).padStart(2, '0')}`)!;
        const center = new Box3().setFromObject(bolt, true).getCenter(new Vector3());
        expect(center.y).toBeCloseTo(z, 3);
        expect(center.z).toBeCloseTo(-y, 3);
      }
    }
    expect(contours.disc.openings.filter((o) => o.kind === 'window')).toHaveLength(18);
    expect(contours.disc.openings.filter((o) => o.kind === 'vent')).toHaveLength(60);
    expect(assembly.configuration.sprocketTeeth).toBe(48);
    expect(assembly.configuration.spokeCount).toBe(36);
    expect(index.byId.get('project-rear-sprocket-48t')?.oemNumber).toBeNull();
    expect(index.byId.get('project-rear-tire-18')?.verification).toBe('unknown');
  });

  it('separates the manual layers along the axle and restores all positions exactly', () => {
    const records = prepareScene(scene, projectPartsMapping);
    expect(records).toHaveLength(18);
    expect(records.every((record) => !record.automatic)).toBe(true);
    const original = new Map(
      [...models].map(([id, object]) => [id, new Box3().setFromObject(object, true)]),
    );
    for (const amount of [1, 0.5, 0, 1, 0]) {
      explosionTargets(records, index, 'rear-wheel', amount, ids).forEach((position, object) =>
        object.position.copy(position),
      );
      scene.updateMatrixWorld(true);
      for (const instance of assembly.instances) {
        const model = models.get(instance.id)!;
        expect(model.position.toArray()).toEqual([
          amount ? amount * instance.explosionOffsetMm : 0,
          0,
          0,
        ]);
        if (amount === 0) {
          const box = new Box3().setFromObject(model, true);
          expect(box.min.distanceTo(original.get(instance.id)!.min)).toBe(0);
          expect(box.max.distanceTo(original.get(instance.id)!.max)).toBe(0);
        }
      }
    }
  });
});
