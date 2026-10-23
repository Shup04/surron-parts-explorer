import * as THREE from 'three';
import type { InspectionSettings } from '@/core/types';
import tokens from '@/ui/tokens.json';
import { mappedPartId, type SceneRecord } from './scene';
import { copySurfaceFinish } from './surface-finish';

const sceneColors = tokens.scene;

/** Keep section travel independent of selection, clipping, and explosion animation. */
export function assembledScopeBounds(records: SceneRecord[], ids: ReadonlySet<string>): THREE.Box3 {
  const bounds = new THREE.Box3();
  for (const record of records)
    if (ids.has(record.partId) && record.assembledBounds) bounds.union(record.assembledBounds);
  return bounds;
}

export function inspectionPlane(
  bounds: THREE.Box3,
  section: InspectionSettings['section'],
): THREE.Plane | null {
  if (!section || bounds.isEmpty()) return null;
  const { axis, flipped } = section;
  const padding = Math.max(bounds.getSize(new THREE.Vector3()).length() * 0.0001, 0.000001);
  const coordinate = THREE.MathUtils.lerp(
    bounds.min[axis] - padding,
    bounds.max[axis] + padding,
    THREE.MathUtils.clamp(section.position, 0, 1),
  );
  const normal = new THREE.Vector3();
  normal[axis] = flipped ? -1 : 1;
  return new THREE.Plane(normal, -coordinate * normal[axis]);
}

type MaterialVariant = 'normal' | 'selected' | 'hovered' | 'faded';
interface MaterialState {
  selected: ReadonlySet<string>;
  hovered: ReadonlySet<string>;
  solid: ReadonlySet<string>;
  fade: boolean;
  plane: THREE.Plane | null;
  keepSelectedUncut: boolean;
}

/** Own only interaction clones; imported materials and their textures remain untouched. */
export function createInspectionMaterials(root: THREE.Object3D) {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const variants = new Map<THREE.Material, Record<MaterialVariant, THREE.Material>>();
  const raycasts = new Map<
    THREE.Mesh,
    {
      original: THREE.Mesh['raycast'];
      filtered: THREE.Mesh['raycast'];
      plane: THREE.Plane | null;
    }
  >();
  const faded = new Set<THREE.Object3D>();

  function sync() {
    const present = new Set<THREE.Mesh>();
    const usedMaterials = new Set<THREE.Material>();
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      present.add(node);
      const original = originals.get(node) ?? node.material;
      for (const material of Array.isArray(original) ? original : [original])
        usedMaterials.add(material);
      if (originals.has(node)) return;
      originals.set(node, node.material);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (variants.has(material)) continue;
        const copies = {
          normal: material.clone(),
          selected: material.clone(),
          hovered: material.clone(),
          faded: material.clone(),
        };
        if (material instanceof THREE.MeshStandardMaterial)
          Object.values(copies).forEach((copy) =>
            copySurfaceFinish(material, copy as THREE.MeshStandardMaterial),
          );
        for (const [variant, color, strength] of [
          ['selected', sceneColors.selection, 0.13],
          ['hovered', sceneColors.hover, 0.07],
        ] as const) {
          const highlighted = copies[variant];
          const tint = new THREE.Color(color);
          if (highlighted instanceof THREE.MeshStandardMaterial) {
            highlighted.emissive
              .multiplyScalar(highlighted.emissiveIntensity)
              .add(tint.clone().multiplyScalar(strength));
            highlighted.emissiveIntensity = 1;
          }
          if ('color' in highlighted && highlighted.color instanceof THREE.Color)
            highlighted.color.lerp(tint, strength);
        }
        copies.faded.transparent = true;
        copies.faded.opacity = Math.min(material.opacity, 0.08);
        copies.faded.depthWrite = false;
        variants.set(material, copies);
      }
      const entry = {
        original: node.raycast,
        plane: null as THREE.Plane | null,
        filtered: null! as THREE.Mesh['raycast'],
      };
      entry.filtered = function (raycaster, intersections) {
        if (!entry.plane) return entry.original.call(this, raycaster, intersections);
        const hits: THREE.Intersection[] = [];
        entry.original.call(this, raycaster, hits);
        // Filter before R3F keeps the nearest intersection per mesh, so a clipped
        // front surface cannot hide a surviving back surface of that same mesh.
        intersections.push(
          ...hits.filter((hit) => entry.plane!.distanceToPoint(hit.point) >= -1e-8),
        );
      };
      raycasts.set(node, entry);
    });
    originals.forEach((material, mesh) => {
      if (present.has(mesh)) return;
      mesh.material = material;
      mesh.raycast = raycasts.get(mesh)!.original;
      originals.delete(mesh);
      raycasts.delete(mesh);
    });
    variants.forEach((copies, original) => {
      if (usedMaterials.has(original)) return;
      Object.values(copies).forEach((material) => material.dispose());
      variants.delete(original);
    });
  }

  return {
    faded,
    apply(state: MaterialState) {
      sync();
      faded.clear();
      variants.forEach((copies, original) => {
        for (const [name, material] of Object.entries(copies)) {
          const plane = name === 'selected' && state.keepSelectedUncut ? null : state.plane;
          const planes = [...(original.clippingPlanes ?? []), ...(plane ? [plane] : [])];
          const side = plane ? THREE.DoubleSide : original.side;
          if ((material.clippingPlanes?.length ?? 0) !== planes.length || material.side !== side)
            material.needsUpdate = true;
          material.clippingPlanes = planes.length ? planes : null;
          material.side = side;
        }
      });
      originals.forEach((original, mesh) => {
        const id = mappedPartId(mesh);
        const selected = !!id && state.selected.has(id);
        const ghost = state.fade && (!id || !state.solid.has(id));
        const variant: MaterialVariant = selected
          ? 'selected'
          : ghost
            ? 'faded'
            : id && state.hovered.has(id)
              ? 'hovered'
              : 'normal';
        if (ghost && !selected) faded.add(mesh);
        mesh.material =
          variant === 'normal' && !state.plane
            ? original
            : Array.isArray(original)
              ? original.map((material) => variants.get(material)![variant])
              : variants.get(original)![variant];
        const raycast = raycasts.get(mesh)!;
        raycast.plane = selected && state.keepSelectedUncut ? null : state.plane;
        mesh.raycast = raycast.plane ? raycast.filtered : raycast.original;
      });
    },
    dispose() {
      originals.forEach((material, mesh) => {
        mesh.material = material;
        mesh.raycast = raycasts.get(mesh)!.original;
      });
      variants.forEach((copies) => Object.values(copies).forEach((material) => material.dispose()));
      originals.clear();
      variants.clear();
      raycasts.clear();
      faded.clear();
    },
  };
}

/** Transparent shells remain selectable when the pointer misses a solid target. */
export function inspectionHit<T extends THREE.Intersection>(
  intersections: readonly T[],
  faded: ReadonlySet<THREE.Object3D>,
): T | undefined {
  const eligible = intersections.filter(
    (hit) => hit.object.layers.mask !== 0 && mappedPartId(hit.object),
  );
  return eligible.find((hit) => !faded.has(hit.object)) ?? eligible[0];
}
