import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Box3,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import assembly from '../data/models/rear-shock-assembly.json';
import { projectParts, projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import { buildCatalogIndex } from '../src/core/catalog';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { buildCuratedNavigation } from '../src/navigation/model';
import { wrapPartModel } from '../src/viewer/part-models';
import { disposeScene, explosionTargets, prepareScene } from '../src/viewer/scene';

const catalog = withProjectParts(oemCatalog);
const index = buildCatalogIndex(catalog);
const scene = new Group();
const models = new Map<string, Group>();
const documents = new Map<string, { bytes: Buffer; json: any; binary: Buffer }>();
const gltfPoint = ([x, y, z]: readonly number[]) => new Vector3(x, z, -y);

beforeAll(async () => {
  const ids = [...assembly.instances.map((part) => part.id), 'main-frame'];
  ids.push(projectParts.find((part) => part.role === 'nav.rear-suspension.link')!.id);
  for (const id of ids) {
    const model = projectParts.find((part) => part.id === id)!;
    const bytes = await readFile(`public/parts/${model.file}`);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
    const length = bytes.readUInt32LE(12);
    documents.set(id, {
      bytes,
      json: JSON.parse(bytes.subarray(20, 20 + length).toString()),
      binary: bytes.subarray(28 + length),
    });
    // Node has no image decoder. Verify embedded PNGs below; browser tests decode
    // the actual textures. Geometry and material loading still use GLTFLoader.
    const loader = new GLTFLoader().register(() => ({
      name: 'geometry-test-textures',
      loadTexture: async () => new Texture(),
    }));
    const gltf = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    const wrapper = wrapPartModel(gltf.scene, id);
    models.set(id, wrapper);
    scene.add(wrapper);
  }
  scene.updateMatrixWorld(true);
});
afterAll(() => disposeScene(scene));

describe('mounted rear shock', () => {
  it('registers three independently selectable parts under the existing rear-shock role', () => {
    const navigation = buildCuratedNavigation(oemDatabase, catalog);
    const node = navigation.byId.get('nav.rear-suspension.shock')!;
    expect(node.kind).toBe('group');
    expect(node.children.map((part) => part.name)).toEqual(['Main body', 'Spring', 'Preload nut']);
    expect(node.modelPartIds).toEqual(assembly.instances.map((part) => `project-${part.id}`));
    for (const instance of assembly.instances) {
      const part = index.byId.get(`project-${instance.id}`)!;
      expect(part.parentId).toBe('rear-suspension');
      expect(part.oemNumber).toBeNull();
      expect(part.verification).toBe('unknown');
      expect(navigation.byId.get(instance.role)?.modelPartIds).toEqual([part.id]);
    }
  });

  it('exports finite geometry at bike scale with the baked source finishes', () => {
    for (const instance of assembly.instances) {
      const model = projectParts.find((part) => part.id === instance.id)!;
      expect(documents.get(instance.id)!.bytes.byteLength).toBe(model.bytes);
      const wrapper = models.get(instance.id)!;
      const box = new Box3().setFromObject(wrapper, true);
      const [min, max] = model.sourceWorldBounds;
      expect(box.min.distanceTo(new Vector3(min[0], min[2], -max[1]))).toBeLessThan(0.001);
      expect(box.max.distanceTo(new Vector3(max[0], max[2], -min[1]))).toBeLessThan(0.001);
      let triangles = 0;
      wrapper.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const name of ['position', 'normal'])
          expect([...object.geometry.getAttribute(name).array].every(Number.isFinite)).toBe(true);
        triangles +=
          (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
      });
      expect(triangles).toBe(model.triangles);
    }
    const { json, binary } = documents.get('rear-shock-body')!;
    expect(json.materials).toHaveLength(7);
    expect(json.images).toHaveLength(3);
    for (const image of json.images) {
      expect(image.uri).toBeUndefined();
      expect(image.mimeType).toBe('image/png');
      const view = json.bufferViews[image.bufferView];
      const png = binary.subarray(view.byteOffset, view.byteOffset + view.byteLength);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(png.readUInt32BE(16)).toBe(2048);
      expect(png.readUInt32BE(20)).toBe(2048);
    }
    for (const material of json.materials) {
      expect(material.pbrMetallicRoughness.baseColorTexture).toBeDefined();
      expect(material.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
      expect(material.normalTexture).toBeDefined();
    }
    models.get('rear-shock-spring')!.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const material = object.material as MeshStandardMaterial;
      expect(material.color.r).toBeGreaterThan(0.85);
      expect(material.color.g).toBeGreaterThan(0.85);
      expect(material.color.b).toBeGreaterThan(0.85);
      expect(material.metalness).toBe(0);
    });
  });

  it('aligns both actual mounting bores without scaling the approved shock', () => {
    const transform = new Matrix4().set(
      ...(assembly.placement.standaloneToBikeMatrix.flat() as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]),
    );
    expect(transform.determinant()).toBeCloseTo(1, 8);
    const body = models.get('rear-shock-body')!;
    const link = projectParts.find((part) => part.role === 'nav.rear-suspension.link')!.id;
    for (const [i, target] of assembly.placement.targetEyeCenters.entries()) {
      const center = gltfPoint(target);
      expect(center.distanceTo(gltfPoint(assembly.placement.placedEyeCenters[i]))).toBeLessThan(
        0.5,
      );
      const support = models.get(i === 0 ? link : 'main-frame')!;
      for (const object of [body, support]) {
        const throughBore = new Raycaster(
          new Vector3(180, center.y, center.z),
          new Vector3(-1, 0, 0),
        );
        expect(throughBore.intersectObject(object, true)).toHaveLength(0);
        const throughRing = new Raycaster(
          new Vector3(180, center.y + 6, center.z),
          new Vector3(-1, 0, 0),
        );
        expect(throughRing.intersectObject(object, true).length).toBeGreaterThan(0);
      }
    }
  });

  it('separates the spring and preload ring and restores the mounted positions exactly', () => {
    const ids = assembly.instances.map((part) => `project-${part.id}`);
    const records = prepareScene(scene, projectPartsMapping);
    const original = new Map(
      [...models].map(([id, object]) => [id, new Box3().setFromObject(object, true)]),
    );
    for (const amount of [1, 0.5, 0, 1, 0]) {
      explosionTargets(records, index, 'rear-suspension', amount, ids).forEach(
        (position, object) => {
          object.position.copy(position);
        },
      );
      scene.updateMatrixWorld(true);
      for (const part of assembly.instances) {
        const object = models.get(part.id)!;
        expect(
          object.position.distanceTo(
            new Vector3(...(part.explosionOffset as [number, number, number])).multiplyScalar(
              amount,
            ),
          ),
        ).toBeLessThan(1e-8);
        if (amount === 0) {
          const box = new Box3().setFromObject(object, true);
          expect(box.min.distanceTo(original.get(part.id)!.min)).toBe(0);
          expect(box.max.distanceTo(original.get(part.id)!.max)).toBe(0);
        }
      }
      expect(models.get('main-frame')!.position.length()).toBe(0);
    }
  });
});
