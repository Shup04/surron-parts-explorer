import * as THREE from 'three';
import type { CatalogIndex } from '@/core/catalog';
import { getAncestors, getDescendants } from '@/core/catalog';
import { automaticExplosion, explodedPosition } from '@/core/explosion';
import type { Explosion, MappingConfig, Vec3 } from '@/core/types';
import { getObjectKey } from '@/core/mapping';

const originalLayers = new WeakMap<THREE.Object3D, number>();
const originalPositions = new WeakMap<THREE.Object3D, Vec3>();

export interface SceneRecord {
  object: THREE.Object3D;
  partId: string;
  original: Vec3;
  explosion?: Explosion;
  automatic: boolean;
}

/** Catalog IDs are external metadata. Names never become a selection identifier. */
export function prepareScene(root: THREE.Object3D, mapping?: MappingConfig): SceneRecord[] {
  const records: SceneRecord[] = [];
  const byKey = new Map<string, MappingConfig['mappings'][number]>();
  const duplicateKeys = new Set<string>();
  const sceneKeys = new Map<THREE.Object3D, string>();
  const seenKeys = new Set<string>();
  root.traverse((object) => {
    const key = getObjectKey(object, root);
    sceneKeys.set(object, key);
    if (seenKeys.has(key)) duplicateKeys.add(key);
    seenKeys.add(key);
  });
  for (const entry of mapping?.mappings ?? []) {
    if (byKey.has(entry.objectKey)) duplicateKeys.add(entry.objectKey);
    else byKey.set(entry.objectKey, entry);
  }
  root.traverse((object) => {
    const original = originalPositions.get(object);
    if (original) object.position.set(...original);
    const key = sceneKeys.get(object)!;
    const entry = byKey.get(key);
    object.userData.viewerMappingAmbiguous = !!mapping && duplicateKeys.has(key);
    const id = mapping
      ? duplicateKeys.has(key)
        ? undefined
        : entry?.partId
      : object.userData.partId;
    if (typeof id === 'string') {
      object.userData.viewerPartId = id;
      const explosion = mapping
        ? entry?.explosion
        : (object.userData.explosion as Explosion | undefined);
      if (!originalPositions.has(object))
        originalPositions.set(object, object.position.toArray() as Vec3);
      records.push({
        object,
        partId: id,
        original: [...originalPositions.get(object)!],
        explosion,
        automatic: !explosion,
      });
    } else delete object.userData.viewerPartId;
  });
  root.updateMatrixWorld(true);
  return records;
}

export function mappedPartId(object: THREE.Object3D): string | null {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node.userData.viewerMappingAmbiguous) return null;
    if (typeof node.userData.viewerPartId === 'string') return node.userData.viewerPartId;
    node = node.parent;
  }
  return null;
}

/** Choose a navigable assembly at the active hierarchy level, or its component. */
export function selectionAtLevel(index: CatalogIndex, partId: string, assemblyId: string): string {
  const ancestors = getAncestors(index, partId);
  const assemblyIndex = ancestors.findIndex((part) => part.id === assemblyId);
  if (assemblyIndex >= 0 && assemblyIndex + 1 < ancestors.length)
    return ancestors[assemblyIndex + 1].id;
  return partId;
}

export function partSet(index: CatalogIndex, id: string): Set<string> {
  return new Set([id, ...getDescendants(index, id).map((part) => part.id)]);
}

/** Mask geometry layers, retaining parent nodes so mapped descendants stay reachable. */
export function updateVisibility(
  root: THREE.Object3D,
  index: CatalogIndex,
  assemblyId: string,
  hiddenIds: string[],
  isolatedId: string | null,
  scopePartIds?: string[],
): number {
  const allowed = scopePartIds
    ? new Set(scopePartIds.flatMap((id) => [...partSet(index, id)]))
    : partSet(index, isolatedId ?? assemblyId);
  const isolated = isolatedId ? partSet(index, isolatedId) : null;
  const hidden = new Set(hiddenIds.flatMap((id) => [...partSet(index, id)]));
  let count = 0;
  root.traverse((object) => {
    if (
      !(
        object instanceof THREE.Mesh ||
        object instanceof THREE.Line ||
        object instanceof THREE.Points
      )
    )
      return;
    const id = mappedPartId(object);
    if (!originalLayers.has(object)) originalLayers.set(object, object.layers.mask);
    const geometryVisible = id
      ? allowed.has(id) && !hidden.has(id) && (!isolated || isolated.has(id))
      : !scopePartIds && assemblyId === index.root.id && !isolatedId;
    // A mesh can also be a parent node. Its geometry must disappear without hiding its children.
    object.visible = geometryVisible || object.children.length > 0;
    object.layers.mask = geometryVisible ? originalLayers.get(object)! : 0;
    if (geometryVisible) count++;
  });
  return count;
}

/** Do not displace a child twice when a mapped ancestor already represents that component. */
export function explosionTargets(
  records: SceneRecord[],
  index: CatalogIndex,
  assemblyId: string,
  amount: number,
  scopePartIds?: string[],
): Map<THREE.Object3D, THREE.Vector3> {
  const targets = new Map<THREE.Object3D, THREE.Vector3>();
  const recordObjects = new Set(records.map((record) => record.object));
  const allowed = scopePartIds
    ? new Set(scopePartIds.flatMap((id) => [...partSet(index, id)]))
    : partSet(index, assemblyId);
  const scoped = records.map((record) => {
    const active = allowed.has(record.partId) && record.partId !== assemblyId;
    let mappedParent = record.object.parent;
    let movesWithAncestor = false;
    while (mappedParent) {
      if (recordObjects.has(mappedParent)) {
        const id = mappedParent.userData.viewerPartId as string;
        if (id !== assemblyId && allowed.has(id)) movesWithAncestor = true;
      }
      mappedParent = mappedParent.parent;
    }
    return {
      record,
      scopeId: scopePartIds ? record.partId : selectionAtLevel(index, record.partId, assemblyId),
      active: active && !movesWithAncestor,
    };
  });
  // Flat imported scenes still move each catalog component together in automatic mode.
  const centers = new Map<string, { sum: THREE.Vector3; count: number; ordinal: number }>();
  scoped.forEach(({ record, scopeId, active }) => {
    if (!active) return;
    const entry = centers.get(scopeId) ?? {
      sum: new THREE.Vector3(),
      count: 0,
      ordinal: centers.size,
    };
    entry.sum.add(new THREE.Vector3(...record.original));
    entry.count++;
    centers.set(scopeId, entry);
  });
  scoped.forEach(({ record, scopeId, active }) => {
    const entry = centers.get(scopeId);
    const center = entry
      ? (entry.sum.clone().divideScalar(entry.count).toArray() as Vec3)
      : record.original;
    const fallback = automaticExplosion(center, [0, 0, 0], entry?.ordinal ?? 0);
    const config = record.partId === scopeId ? (record.explosion ?? fallback) : fallback;
    targets.set(
      record.object,
      new THREE.Vector3(...explodedPosition(record.original, config, active ? amount : 0)),
    );
  });
  return targets;
}

export function visibleBounds(
  root: THREE.Object3D,
  selectedId?: string | null,
  index?: CatalogIndex,
): THREE.Box3 {
  const box = new THREE.Box3();
  const filter = selectedId && index ? partSet(index, selectedId) : null;
  root.updateMatrixWorld(true);
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || object.layers.mask === 0) return;
    if (filter && !filter.has(mappedPartId(object) ?? '')) return;
    if (object instanceof THREE.InstancedMesh) {
      object.computeBoundingBox();
      if (object.boundingBox)
        box.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
    } else {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      if (object.geometry.boundingBox)
        box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
    }
  });
  return box;
}

export function disposeScene(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

/** Perspective fit without changing the viewing angle; works for narrow mobile aspects. */
export function frameBounds(
  bounds: THREE.Box3,
  aspect: number,
  verticalFov: number,
  direction: THREE.Vector3,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const target = bounds.getCenter(new THREE.Vector3());
  const forward = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const tangent = Math.tan(THREE.MathUtils.degToRad(verticalFov / 2));
  let distance = 0.04;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).sub(target);
        const depth = point.dot(forward);
        distance = Math.max(
          distance,
          Math.abs(point.dot(right)) / (tangent * Math.max(0.1, aspect)) + depth,
          Math.abs(point.dot(up)) / tangent + depth,
        );
      }
  return { position: target.clone().addScaledVector(forward, distance), target };
}

/** Keep framed geometry inside the clipping planes throughout the allowed zoom range. */
export function cameraRangeForBounds(
  bounds: THREE.Box3,
  position: THREE.Vector3,
  target: THREE.Vector3,
  focusBounds = bounds,
): { near: number; far: number; minDistance: number; maxDistance: number } {
  const radius = Math.max(focusBounds.getSize(new THREE.Vector3()).length() / 2, 0.00001);
  const sceneRadius = bounds.getSize(new THREE.Vector3()).length() / 2;
  const maxDistance = Math.max(position.distanceTo(target) * 20, sceneRadius * 40, 20);
  return {
    near: Math.max(radius / 1000, 0.000001),
    far:
      Math.max(
        maxDistance + target.distanceTo(bounds.getCenter(new THREE.Vector3())) + sceneRadius,
        100,
      ) * 2,
    minDistance: Math.max(radius / 100, 0.00001),
    maxDistance,
  };
}
