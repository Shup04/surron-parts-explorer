import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  assembledScopeBounds,
  createInspectionMaterials,
  inspectionHit,
  inspectionPlane,
} from '../src/viewer/inspection';
import { prepareScene } from '../src/viewer/scene';

function fixture() {
  const root = new THREE.Group();
  const source = new THREE.MeshStandardMaterial({ color: '#989898', roughness: 0.4 });
  const shell = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), source);
  const bearing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), source);
  shell.userData.partId = 'shell';
  bearing.userData.partId = 'bearing';
  root.add(shell, bearing);
  const records = prepareScene(root);
  const materials = createInspectionMaterials(root);
  const state = {
    selected: new Set<string>(),
    hovered: new Set<string>(),
    solid: new Set(['shell', 'bearing']),
    fade: false,
    plane: null as THREE.Plane | null,
    keepSelectedUncut: false,
  };
  return { root, source, shell, bearing, records, materials, state };
}

describe('assembled internal inspection', () => {
  it('moves the section across each full scope and reverses the retained half when flipped', () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-2, 3, 5), new THREE.Vector3(4, 9, 7));
    for (const axis of ['x', 'y', 'z'] as const) {
      const start = inspectionPlane(bounds, { axis, position: 0, flipped: false })!;
      const end = inspectionPlane(bounds, { axis, position: 1, flipped: false })!;
      expect(start.distanceToPoint(bounds.min)).toBeGreaterThan(0);
      expect(end.distanceToPoint(bounds.max)).toBeLessThan(0);
      const middle = inspectionPlane(bounds, { axis, position: 0.5, flipped: false })!;
      const reversed = inspectionPlane(bounds, { axis, position: 0.5, flipped: true })!;
      expect(middle.distanceToPoint(bounds.getCenter(new THREE.Vector3()))).toBeCloseTo(0);
      expect(reversed.distanceToPoint(bounds.min)).toBeCloseTo(-middle.distanceToPoint(bounds.min));
    }
    expect(
      inspectionPlane(new THREE.Box3(), { axis: 'x', position: 0.5, flipped: false }),
    ).toBeNull();
    expect(inspectionPlane(bounds, null)).toBeNull();
  });

  it('uses the assembled scope bounds after parts move and excludes surrounding models', () => {
    const { records, shell, bearing } = fixture();
    shell.position.set(20, 20, 20);
    bearing.position.set(-10, -10, -10);
    const bounds = assembledScopeBounds(records, new Set(['bearing']));
    expect(bounds.getCenter(new THREE.Vector3()).toArray()).toEqual([0, 0, 0]);
    expect(bounds.getSize(new THREE.Vector3()).x).toBeCloseTo(0.3);
  });

  it('preserves source materials, keeps the selected bearing uncut, and restores materials and raycasts', () => {
    const { source, shell, bearing, materials, state } = fixture();
    const sourceDispose = vi.spyOn(source, 'dispose');
    const raycast = shell.raycast;
    const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
    materials.apply({
      ...state,
      selected: new Set(['bearing']),
      solid: new Set(['bearing']),
      fade: true,
      plane,
      keepSelectedUncut: true,
    });
    const ghost = shell.material as THREE.MeshStandardMaterial;
    expect(ghost.transparent).toBe(true);
    expect(ghost.depthWrite).toBe(false);
    expect(ghost.opacity).toBe(0.08);
    expect(ghost.roughness).toBe(source.roughness);
    expect(ghost.clippingPlanes).toEqual([plane]);
    expect((bearing.material as THREE.Material).clippingPlanes).toBeNull();
    expect(source.transparent).toBe(false);
    expect(source.clippingPlanes).toBeNull();
    materials.apply({ ...state, selected: new Set(['bearing']) });
    expect(shell.material).toBe(source);
    expect(shell.raycast).toBe(raycast);
    expect(bearing.material).not.toBe(source);
    expect((bearing.material as THREE.Material).clippingPlanes).toBeNull();
    materials.apply(state);
    expect(shell.material).toBe(source);
    expect(bearing.material).toBe(source);
    expect(shell.raycast).toBe(raycast);
    expect((shell.material as THREE.Material).opacity).toBe(1);
    expect((shell.material as THREE.Material).clippingPlanes).toBeNull();
    expect((shell.material as THREE.Material).side).toBe(source.side);
    materials.dispose();
    expect(shell.material).toBe(source);
    expect(bearing.material).toBe(source);
    expect(shell.raycast).toBe(raycast);
    expect(sourceDispose).not.toHaveBeenCalled();
  });

  it('keeps a surviving back-surface hit after clipping away the nearest surface of that mesh', () => {
    const { shell, materials, state } = fixture();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    materials.apply({ ...state, plane });
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 1));
    const hits = ray.intersectObject(shell);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.point.z === 1)).toBe(true);
    materials.apply({ ...state, selected: new Set(['shell']), plane, keepSelectedUncut: true });
    expect(ray.intersectObject(shell)[0].point.z).toBe(-1);
    materials.dispose();
  });

  it('picks a solid target through faded shells and keeps faded parts selectable as a fallback', () => {
    const { shell, bearing, materials, state } = fixture();
    materials.apply({ ...state, solid: new Set(['bearing']), fade: true });
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, -3), new THREE.Vector3(0, 0, 1));
    const hits = ray.intersectObjects([shell, bearing]);
    expect(inspectionHit(hits, materials.faded)?.object).toBe(bearing);
    expect(
      inspectionHit(
        hits.filter((hit) => hit.object === shell),
        materials.faded,
      )?.object,
    ).toBe(shell);
    bearing.layers.mask = 0;
    expect(inspectionHit(hits, materials.faded)?.object).toBe(shell);
    materials.dispose();
  });

  it('applies inspection to late arrivals and releases replaced overrides without disposing loader resources', () => {
    const { root, bearing, materials, state } = fixture();
    const inspected = {
      ...state,
      selected: new Set(['bearing']),
      solid: new Set(['bearing']),
      fade: true,
      plane: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      keepSelectedUncut: true,
    };
    materials.apply(inspected);
    const highlight = bearing.material;
    const source = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const sourceDispose = vi.spyOn(source, 'dispose');
    const textureDispose = vi.spyOn(source.map!, 'dispose');
    const arriving = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), source);
    arriving.userData.partId = 'arriving';
    const originalRaycast = arriving.raycast;
    root.add(arriving);
    materials.apply(inspected);
    const ghost = arriving.material as THREE.Material;
    const ghostDispose = vi.spyOn(ghost, 'dispose');
    expect(ghost.opacity).toBe(0.08);
    expect(ghost.clippingPlanes).toEqual([inspected.plane]);
    expect(bearing.material).toBe(highlight);

    root.remove(arriving);
    materials.apply(inspected);
    expect(arriving.material).toBe(source);
    expect(arriving.raycast).toBe(originalRaycast);
    expect(ghostDispose).toHaveBeenCalledOnce();
    expect(materials.faded.has(arriving)).toBe(false);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
    expect(bearing.material).toBe(highlight);
    materials.dispose();
    expect(ghostDispose).toHaveBeenCalledOnce();
  });

  it('can restart after effect cleanup without reusing disposed material clones', () => {
    const { shell, materials, state } = fixture();
    const faded = { ...state, fade: true, solid: new Set<string>() };
    materials.apply(faded);
    const previous = shell.material;
    materials.dispose();
    materials.apply(faded);
    expect(shell.material).not.toBe(previous);
    expect((shell.material as THREE.Material).opacity).toBe(0.08);
    materials.dispose();
  });
});
