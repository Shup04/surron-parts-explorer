import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix3, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { projectPartsMapping, withProjectParts } from '../src/config/project-parts';
import { buildCatalogIndex } from '../src/core/catalog';
import type { Explosion, Part } from '../src/core/types';
import { oemCatalog, oemDatabase } from '../src/data/oem';
import {
  buildModeledNavigation,
  closedAssemblyGroups,
  geometrySelectionAssembly,
} from '../src/navigation/modeled';
import { navigationForOccurrence } from '../src/navigation/model';
import { disposeScene, explosionTargets, prepareScene } from '../src/viewer/scene';

const catalog = withProjectParts(oemCatalog);
const mapped = new Set(projectPartsMapping.mappings.map((mapping) => mapping.partId));
const navigation = buildModeledNavigation(oemDatabase, catalog, mapped);
// Test-only future internals verify the hierarchy without publishing placeholder parts.
const internals: Part[] = ['bearing-left', 'bearing-right', 'seal-left', 'seal-right'].map(
  (name) => ({
    ...catalog.parts.find((part) => part.id === 'project-rear-hub')!,
    id: `future-hub-${name}`,
    name,
    specifications: {
      'Model role': name.startsWith('bearing') ? 'nav.rear-wheel.bearings' : 'nav.rear-wheel.seals',
    },
  }),
);
const futureCatalog = { ...catalog, parts: [...catalog.parts, ...internals] };
const future = buildModeledNavigation(
  oemDatabase,
  futureCatalog,
  new Set([...mapped, ...internals.map((part) => part.id)]),
);

describe('nested rear hub assembly', () => {
  it('keeps the hub as an assembly even while only its body has geometry', () => {
    const wheel = navigation.byId.get('nav.rear-wheel.assembly')!;
    const hub = navigation.byId.get('nav.rear-wheel.hub')!;
    expect(hub.parentId).toBe(wheel.id);
    expect(hub.occurrenceId).toBeUndefined();
    expect(hub.selectAsAssembly).toBe(true);
    expect(hub.children.map((child) => child.name)).toEqual(['Hub body']);
    expect(geometrySelectionAssembly(navigation, undefined, 'project-rear-hub')).toBe(wheel);
    expect(geometrySelectionAssembly(navigation, wheel, 'project-rear-hub')).toBe(hub);
    expect(geometrySelectionAssembly(navigation, hub, 'project-rear-hub')).toBeUndefined();
    expect(closedAssemblyGroups(navigation, wheel)).toEqual([
      { id: hub.id, partIds: ['project-rear-hub'], anchorPartId: 'project-rear-hub' },
    ]);
    expect(closedAssemblyGroups(navigation, hub)).toEqual([]);
  });

  it('puts future seals and bearings under the hub and requires the next selection to enter it', () => {
    const wheel = future.byId.get('nav.rear-wheel.assembly')!;
    const hub = future.byId.get('nav.rear-wheel.hub')!;
    expect(wheel.children).toHaveLength(8);
    expect(hub.modelPartIds).toEqual(['project-rear-hub', ...internals.map((part) => part.id)]);
    for (const part of internals) {
      expect(geometrySelectionAssembly(future, undefined, part.id)).toBe(wheel);
      expect(geometrySelectionAssembly(future, wheel, part.id)).toBe(hub);
      expect(geometrySelectionAssembly(future, hub, part.id)).toBeUndefined();
      expect(navigationForOccurrence(future, part.id)).toBeDefined();
    }
    expect(closedAssemblyGroups(future, wheel)[0].anchorPartId).toBe('project-rear-hub');
    expect(closedAssemblyGroups(future, hub)).toEqual([]);
  });

  it.each([0, 32, undefined])(
    'keeps the hub rigid outside its own view (anchor offset %s), including rotated and scaled imports',
    (distance) => {
      const wheel = future.byId.get('nav.rear-wheel.assembly')!;
      const hub = future.byId.get('nav.rear-wheel.hub')!;
      const index = buildCatalogIndex(futureCatalog);
      const scene = new Group();
      const objects = new Map<string, Mesh>();
      const members = [...hub.modelPartIds!, 'project-rear-rim-18'];
      members.forEach((id, i) => {
        const parent = new Group();
        parent.rotation.z = i * 0.3;
        parent.scale.set(1 + i * 0.1, 2, 1);
        parent.position.set(i * 5, 0, 0);
        const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial());
        mesh.position.set(i, i * 2, 1);
        mesh.userData.partId = id;
        const amount = i === 0 ? distance : (i % 2 ? -1 : 1) * (20 + i * 5);
        if (amount !== undefined)
          mesh.userData.explosion = {
            direction: [1, 0, 0],
            distance: amount,
            verification: 'unknown',
          } satisfies Explosion;
        parent.add(mesh);
        scene.add(parent);
        objects.set(id, mesh);
      });
      const records = prepareScene(scene);
      const originals = new Map(
        [...objects].map(([id, object]) => [id, object.getWorldPosition(new Vector3())]),
      );
      const offsets = (scope: typeof hub) => {
        explosionTargets(
          records,
          index,
          'rear-wheel',
          1,
          scope.modelPartIds,
          closedAssemblyGroups(future, scope),
        ).forEach((position, object) => object.position.copy(position));
        scene.updateMatrixWorld(true);
        return new Map(
          [...objects].map(([id, object]) => [
            id,
            object.getWorldPosition(new Vector3()).sub(originals.get(id)!),
          ]),
        );
      };
      for (let cycle = 0; cycle < 2; cycle++) {
        const closed = offsets(wheel);
        const body = closed.get('project-rear-hub')!;
        for (const id of hub.modelPartIds!)
          expect(closed.get(id)!.distanceTo(body)).toBeLessThan(1e-8);
        if (distance !== undefined) expect(body.length()).toBeCloseTo(distance, 8);
        const opened = offsets(hub);
        for (const part of internals) {
          const record = records.find((entry) => entry.partId === part.id)!;
          const matrix = record.parentWorldInverse?.clone().invert() ?? new Matrix4();
          const expected = new Vector3(...record.explosion!.direction)
            .normalize()
            .multiplyScalar(record.explosion!.distance)
            .applyMatrix3(new Matrix3().setFromMatrix4(matrix));
          expect(opened.get(part.id)!.distanceTo(expected)).toBeLessThan(1e-8);
        }
      }
      explosionTargets(
        records,
        index,
        'rear-wheel',
        0,
        wheel.modelPartIds,
        closedAssemblyGroups(future, wheel),
      ).forEach((position, object) => object.position.copy(position));
      scene.updateMatrixWorld(true);
      for (const [id, object] of objects)
        expect(object.getWorldPosition(new Vector3()).distanceTo(originals.get(id)!)).toBeLessThan(
          1e-8,
        );
      disposeScene(scene);
    },
  );
});
