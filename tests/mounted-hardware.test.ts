import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import hardware from '../data/models/mounted-hardware.json';
import { projectParts, projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import { buildModeledNavigation } from '../src/navigation/modeled';

const catalog = withProjectParts(oemCatalog);
const specs = hardware.specs as Record<string, (typeof hardware.specs)['peg-m8x20']>;

describe('sourced mounted hardware', () => {
  it('shows the correct drive sizes and keeps unplaced suspension bolts out of the portal', () => {
    expect(hardware.instances).toHaveLength(9);
    const expectedKeys = { 'peg-m8x20': 6, 'motor-cover-m6x10': 4, 'jackshaft-cover-m5x10': 3 };
    for (const instance of hardware.instances) {
      const spec = specs[instance.spec];
      const part = catalog.parts.find((entry) => entry.id === `project-${instance.id}`)!;
      expect(part.oemNumber).toBe(spec.oemNumber);
      expect(part.specifications['Allen key']).toBe(
        `${expectedKeys[instance.spec as keyof typeof expectedKeys]} mm`,
      );
      expect(part.specifications.Finish).toBe('Raw aluminum');
      expect(part.material).toBeNull(); // A requested finish does not establish an alloy.
      expect(part.sources.some((source) => source.item && source.page)).toBe(true);
      expect(part.sources.some((source) => source.url)).toBe(true);
      expect(part.verification).toBe('source-confirmed');
    }
    for (const entry of hardware.unplaced)
      expect(projectParts.some((model) => model.id === entry.id)).toBe(false);
    expect(projectParts.filter((model) => 'hardwareSpec' in model)).toHaveLength(9);
  });

  it('explodes each mounting assembly together with its own fasteners', () => {
    const navigation = buildModeledNavigation(
      oemDatabase,
      catalog,
      new Set(projectPartsMapping.mappings.map((mapping) => mapping.partId)),
    );
    for (const [role, prefix, total] of [
      ['nav.footpegs-stand.brackets', 'bolt-peg-', 6],
      ['nav.motor.guard', 'bolt-motor-cover-', 4],
      ['nav.swingarm.guard', 'bolt-jackshaft-cover-', 4],
    ] as const) {
      const ids = navigation.byId.get(role)!.modelPartIds!;
      expect(ids).toHaveLength(total);
      const screws = hardware.instances.filter((entry) => entry.id.startsWith(prefix));
      for (const screw of screws) expect(ids).toContain(`project-${screw.id}`);
    }
  });

  for (const instance of hardware.instances) {
    it(`exports ${instance.id} with its dimensions, hex socket and mounted transform`, async () => {
      const model = projectParts.find((entry) => entry.id === instance.id)!;
      const spec = specs[instance.spec];
      const bytes = await readFile(`public/parts/${model.file}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(model.sha256);
      expect(bytes.length).toBe(model.bytes);
      const gltf = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      );
      const meshes: Mesh[] = [];
      gltf.scene.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object);
      });
      expect(meshes).toHaveLength(1);
      const mesh = meshes[0];
      expect((mesh.material as MeshStandardMaterial).name).toBe('Raw aluminum');
      expect((mesh.material as MeshStandardMaterial).metalness).toBe(1);
      expect(mesh.userData.allen_key_mm).toBe(spec.allenKeyMm);
      const position = mesh.geometry.getAttribute('position');
      mesh.geometry.computeBoundingBox();
      const local = mesh.geometry.boundingBox!;
      expect(local.max.y).toBeCloseTo(spec.lengthMm, 4);
      expect(local.min.y).toBeCloseTo(-spec.headHeightMm, 4);
      expect(local.max.x - local.min.x).toBeCloseTo(spec.headDiameterMm, 4);
      // Recess walls must contain all six actual flats, not a painted hexagon.
      const socketY = -spec.headHeightMm + spec.visualSocketDepthMm;
      const ring: Vector3[] = [];
      for (let i = 0; i < position.count; i++) {
        const p = new Vector3().fromBufferAttribute(position, i);
        if (Math.abs(p.y - socketY) < 0.0001 && Math.hypot(p.x, p.z) > 0.1) ring.push(p);
      }
      expect(ring.length).toBeGreaterThanOrEqual(72);
      for (let side = 0; side < 6; side++) {
        const angle = Math.PI / 6 + (side * Math.PI) / 3;
        const projections = ring.map((p) => p.x * Math.cos(angle) - p.z * Math.sin(angle));
        expect(Math.max(...projections) - Math.min(...projections)).toBeCloseTo(spec.allenKeyMm, 4);
      }
      gltf.scene.updateMatrixWorld(true);
      const bounds = new Box3().setFromObject(gltf.scene, true);
      const [min, max] = model.sourceWorldBounds;
      const expectedMin = [min[0], min[2], -max[1]];
      const expectedMax = [max[0], max[2], -min[1]];
      bounds.min.toArray().forEach((value, i) => expect(value).toBeCloseTo(expectedMin[i], 3));
      bounds.max.toArray().forEach((value, i) => expect(value).toBeCloseTo(expectedMax[i], 3));
      const seat = new Vector3(...instance.seatMm);
      expect(
        mesh.getWorldPosition(new Vector3()).distanceTo(new Vector3(seat.x, seat.z, -seat.y)),
      ).toBeLessThan(0.001);
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    });
  }
});
