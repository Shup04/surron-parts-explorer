import * as THREE from 'three';
import { getObjectKey, validateMapping } from '@/core/mapping';
import type { AssetDefinition, Catalog, MappingConfig, SceneObjectInfo, Vec3 } from '@/core/types';

/** Validate configured registry assets as strictly as editor imports, before rendering. */
export function validateViewerAsset(
  asset: AssetDefinition,
  catalog: Catalog,
  mapping: MappingConfig | undefined,
  scene?: THREE.Object3D | null,
): string | null {
  if (
    typeof asset.id !== 'string' ||
    typeof asset.url !== 'string' ||
    !asset.id.trim() ||
    !asset.url.trim()
  )
    return 'The asset needs a nonempty ID and URL.';
  if (asset.unit !== 'm' || asset.upAxis !== 'Y')
    return 'The asset must declare metres and Y-up coordinates. Correct the source export; the viewer will not rescale it automatically.';
  const assembly = catalog.parts.find((part) => part.id === asset.assemblyId);
  if (!assembly || assembly.kind === 'component')
    return `The asset assembly is not a catalog assembly: ${asset.assemblyId}.`;
  if (!mapping)
    return 'The asset has no mapping configuration. Create and export its catalog mappings in the model editor.';
  const objects: SceneObjectInfo[] | undefined = scene ? [] : undefined;
  scene?.traverse((object) =>
    objects!.push({
      key: getObjectKey(object, scene),
      name: object.name,
      parentKey: object === scene || !object.parent ? null : getObjectKey(object.parent, scene),
      mesh: object instanceof THREE.Mesh,
      position: object.position.toArray() as Vec3,
    }),
  );
  const validation = validateMapping(mapping, catalog, objects);
  if (!validation.success)
    return `Invalid model mapping: ${validation.issues
      .slice(0, 5)
      .map((issue) => issue.message)
      .join('; ')}`;
  if (validation.data.assetId !== asset.id)
    return `Mapping asset ID "${validation.data.assetId}" does not match loaded asset "${asset.id}". Export the mapping for this model.`;
  return null;
}

/** Saved framing belongs to the loaded asset's assembly root, which may be nested. */
export function savedCameraForScope(
  mapping: MappingConfig | undefined,
  asset: AssetDefinition | undefined,
  assemblyId: string,
  motorcycleId: string,
): MappingConfig['camera'] | undefined {
  return assemblyId === (asset?.assemblyId ?? motorcycleId) ? mapping?.camera : undefined;
}
