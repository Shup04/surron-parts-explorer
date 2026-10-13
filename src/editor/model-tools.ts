import * as THREE from 'three';
import type { Catalog, MappingConfig, SceneObjectInfo } from '@/core/types';
import { getObjectKey } from '@/core/mapping';
export { disposeScene } from '@/viewer/scene';

export function inspectScene(scene: THREE.Object3D): SceneObjectInfo[] {
  scene.updateMatrixWorld(true);
  const result: SceneObjectInfo[] = [];
  scene.traverse((object) => {
    const position = object.getWorldPosition(new THREE.Vector3());
    result.push({
      key: getObjectKey(object, scene),
      name: object.name || '(unnamed object)',
      parentKey: object !== scene && object.parent ? getObjectKey(object.parent, scene) : null,
      mesh: object instanceof THREE.Mesh,
      position: position.toArray(),
    });
  });
  return result;
}

export interface MappingProposal {
  objectKey: string;
  partId: string;
  confidence: 'exact' | 'suggestion';
}
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function proposeMappings(
  objects: SceneObjectInfo[],
  catalog: Catalog,
  mapping: MappingConfig,
): MappingProposal[] {
  const mapped = new Set(mapping.mappings.map((entry) => entry.objectKey));
  return objects
    .filter((object) => object.mesh && !mapped.has(object.key))
    .flatMap<MappingProposal>((object) => {
      const exact = catalog.parts.find(
        (part) => part.id === object.name || `part__${part.id}` === object.name,
      );
      if (exact) return [{ objectKey: object.key, partId: exact.id, confidence: 'exact' as const }];
      const name = normalized(object.name.replace(/^part__/, ''));
      return catalog.parts
        .filter((part) => normalized(part.name) === name || normalized(part.id) === name)
        .map((part) => ({
          objectKey: object.key,
          partId: part.id,
          confidence: 'suggestion' as const,
        }));
    });
}

export function assignMappings(
  mapping: MappingConfig,
  objectKeys: string[],
  partId: string,
): MappingConfig {
  const keys = new Set(objectKeys);
  const existing = new Map(mapping.mappings.map((entry) => [entry.objectKey, entry]));
  return {
    ...mapping,
    mappings: [
      ...mapping.mappings.filter((entry) => !keys.has(entry.objectKey)),
      ...objectKeys.map((objectKey) => ({
        objectKey,
        partId,
        ...(existing.get(objectKey)?.explosion
          ? { explosion: existing.get(objectKey)!.explosion }
          : {}),
      })),
    ],
  };
}

export function sceneWarnings(scene: THREE.Object3D): string[] {
  const warnings: string[] = [];
  const names = new Map<string, number>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      if (!object.name) warnings.push('An unnamed mesh was found. Give it a stable export name.');
      else names.set(object.name, (names.get(object.name) ?? 0) + 1);
    }
  });
  for (const [name, count] of names)
    if (count > 1)
      warnings.push(
        `Duplicate mesh name "${name}" (${count} objects). Hierarchy keys distinguish them, but renaming or reordering will require review.`,
      );
  const size = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(longest) || longest === 0)
    warnings.push('The model has empty or invalid bounds.');
  else if (longest > 10)
    warnings.push(
      `Largest dimension is ${longest.toFixed(2)} m. Check millimetre-to-metre conversion before mapping.`,
    );
  else if (longest < 0.001)
    warnings.push(`Largest dimension is ${(longest * 1000).toFixed(3)} mm. Check source scale.`);
  warnings.push(
    'Units and Y-up orientation require your confirmation. This tool preserves source transforms and does not rescale or rotate geometry.',
  );
  return warnings;
}
