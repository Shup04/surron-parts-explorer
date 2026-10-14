import * as THREE from 'three';
import { getObjectKey } from '@/core/mapping';
import { inspectGltfDocument, parseGltfBytes, type ModelInspection } from '@/core/model-validation';
import type { Vec3 } from '@/core/types';

export interface ImportPreflight {
  objects: number;
  meshes: number;
  triangles: number;
  roots: number;
  depth: number;
  namedObjectsChecked: number;
  unnamed: number;
  duplicateNamed: number;
  mappableMeshes: number;
  dimensions: Vec3 | null;
  scaleRange: [number, number] | null;
  warnings: string[];
}

/** Run once, before the imported scene is animated. Only derived matrix/bounds caches change. */
export function inspectImport(scene: THREE.Object3D, source?: ModelInspection): ImportPreflight {
  scene.updateMatrixWorld(true);
  const objects: THREE.Object3D[] = [];
  scene.traverse((object) => objects.push(object));
  const meshes = objects.filter((object): object is THREE.Mesh => object instanceof THREE.Mesh);
  const keys = new Map<string, number>();
  for (const object of objects) {
    const key = getObjectKey(object, scene);
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  // GLTFLoader sanitizes and uniquifies names; use original glTF nodes when available.
  const names = source?.objects.length
    ? source.objects.slice(1).map((object) => object.name)
    : objects.slice(1).map((object) => object.name);
  const nameCounts = new Map<string, number>();
  for (const name of names) if (name.trim()) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  const duplicateNamed = [...nameCounts.values()].reduce((sum, n) => sum + (n > 1 ? n : 0), 0);
  const unnamed = names.filter((name) => !name.trim()).length;
  const warnings: string[] = [];
  if (unnamed)
    warnings.push(
      `${unnamed} exported objects have no name. Name each component in Blender so it is recognizable in the object tree.`,
    );
  if (duplicateNamed)
    warnings.push(
      `${duplicateNamed} exported objects share names. Give independently selectable components unique names in Blender; the loader may display renamed copies.`,
    );
  const fallback = objects
    .slice(1)
    .filter((object) => !getObjectKey(object, scene).startsWith('id:')).length;
  if (fallback)
    warnings.push(
      `${fallback} loaded objects use hierarchy-path identifiers. Add unique string objectId custom properties to component objects and assembly empties before mapping, and export Custom Properties. Reordering or renaming fallback paths can break mappings.`,
    );
  const collisions = [...keys.values()].filter((count) => count > 1).reduce((a, b) => a + b, 0);
  if (collisions)
    warnings.push(
      `${collisions} objects have ambiguous mapping identifiers. Give duplicated Blender objects different objectId values before mapping.`,
    );

  let depth = 0;
  let smallestScale = Infinity,
    largestScale = 0;
  const depths = new Map<THREE.Object3D, number>([[scene, 0]]);
  let negative = 0,
    extreme = 0,
    nonuniform = 0,
    invalid = 0,
    farOrigins = 0;
  for (const object of objects) {
    const level = object === scene ? 0 : (depths.get(object.parent!) ?? 0) + 1;
    depths.set(object, level);
    depth = Math.max(depth, level);
    const worldScale = new THREE.Vector3().setFromMatrixScale(object.matrixWorld).toArray();
    const localScale = new THREE.Vector3().setFromMatrixScale(object.matrix).toArray();
    if (object !== scene && worldScale.every(Number.isFinite)) {
      smallestScale = Math.min(smallestScale, ...worldScale);
      largestScale = Math.max(largestScale, ...worldScale);
    }
    if (!object.matrixWorld.elements.every(Number.isFinite) || worldScale.some((v) => v === 0))
      invalid++;
    if (object.scale.toArray().some((v) => v < 0) || object.matrix.determinant() < 0) negative++;
    // Deliberately broad review thresholds, not physical-size requirements.
    if ([...localScale, ...worldScale].some((v) => v > 100 || (v > 0 && v < 0.01))) extreme++;
    if (Math.max(...worldScale) - Math.min(...worldScale) > Math.max(...worldScale) * 1e-5)
      nonuniform++;
    if (
      object instanceof THREE.Mesh &&
      !(object instanceof THREE.SkinnedMesh) &&
      !(object instanceof THREE.InstancedMesh) &&
      !object.morphTargetInfluences
    ) {
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox;
      if (box && !box.isEmpty()) {
        const diagonal = box.getSize(new THREE.Vector3()).length();
        if (diagonal > 0 && box.distanceToPoint(new THREE.Vector3()) > diagonal * 2) farOrigins++;
      }
    }
  }
  if (invalid)
    warnings.push(
      `${invalid} objects have zero or non-finite effective transforms. Inspect their transforms and parent scales in Blender; collapsed geometry cannot be inspected reliably.`,
    );
  if (negative)
    warnings.push(
      `${negative} objects have negative or mirrored local scales. Check normals and handedness in Blender; apply transforms only after checking modifiers and parenting.`,
    );
  if (extreme)
    warnings.push(
      `${extreme} objects have local or inherited scale factors below 0.01 or above 100. Check unit conversion and parent scales against a known measurement; these factors may be intentional.`,
    );
  if (nonuniform)
    warnings.push(
      `${nonuniform} objects have unequal effective axis scales. Parent scale and axes affect explosion direction and travel. Review them before configuring distances in metres.`,
    );
  if (farOrigins)
    warnings.push(
      `${farOrigins} static mesh origins lie more than two bounding-box diagonals outside their geometry. This may be intentional; review component origins in Blender before choosing assembly pivots. Translation-only explosions do not require centered origins.`,
    );
  const instanced = meshes.filter((mesh) => mesh instanceof THREE.InstancedMesh).length;
  if (instanced)
    warnings.push(
      `${instanced} instanced mesh objects map as whole groups. Export separate objects if each repeated component needs its own catalog mapping; individual GPU instances are not selectable separately here.`,
    );
  if (meshes.some((mesh) => mesh instanceof THREE.SkinnedMesh || mesh.morphTargetInfluences))
    warnings.push(
      'Skinned or morphing geometry is present. Bounds describe the imported pose; pivot checks skip these meshes. Prefer rigid component objects for mechanical exploded views.',
    );
  if (meshes.length === 1)
    warnings.push(
      'Only one mesh is available. If it contains several physical components, separate them into objects in Blender before exporting; this editor cannot select faces as separate catalog parts.',
    );
  if (!meshes.length)
    warnings.push(
      'No triangle meshes are available for individual component mapping. Export the intended component meshes from Blender.',
    );
  const bounds = new THREE.Box3().setFromObject(scene);
  const size = bounds.getSize(new THREE.Vector3());
  const dimensions =
    !bounds.isEmpty() && size.toArray().every(Number.isFinite) ? size.toArray() : null;
  if (!dimensions)
    warnings.push(
      'Scene bounds are empty or invalid. Check exported geometry and transforms in Blender.',
    );
  else if (Math.max(...dimensions) > 10 || Math.max(...dimensions) < 0.001)
    warnings.push(
      'Scene bounds are very large or small (longest axis above 10 m or below 0.001 m). Check a known measurement and export units; this does not establish incorrect physical dimensions.',
    );
  return {
    objects: objects.length - 1,
    meshes: meshes.length,
    triangles: meshes.reduce(
      (sum, mesh) =>
        sum +
        Math.floor(
          (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3,
        ) *
          (mesh instanceof THREE.InstancedMesh ? mesh.count : 1),
      0,
    ),
    roots: scene.children.length,
    depth,
    namedObjectsChecked: names.length,
    unnamed,
    duplicateNamed,
    mappableMeshes: meshes.filter((mesh) => keys.get(getObjectKey(mesh, scene)) === 1).length,
    dimensions,
    scaleRange: Number.isFinite(smallestScale) ? [smallestScale, largestScale] : null,
    warnings,
  };
}

/** Source inspection is advisory and must not make a successfully loaded model unusable. */
export async function preflightImportedModel(
  scene: THREE.Object3D,
  url: string,
): Promise<ImportPreflight> {
  let source: ModelInspection | undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Source unavailable');
    source = inspectGltfDocument(parseGltfBytes(new Uint8Array(await response.arrayBuffer())));
    if (!source.objects.length) source = undefined;
  } catch {
    /* Keep the loaded scene available for inspection. */
  }
  const report = inspectImport(scene, source);
  if (!source)
    report.warnings.unshift(
      'Original file names could not be inspected. Naming counts use loaded objects, which the importer may rename; check Blender names manually.',
    );
  return report;
}
