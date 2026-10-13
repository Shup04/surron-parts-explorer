import { z } from 'zod';
import type { Catalog, MappingConfig, ObjectMapping, SceneObjectInfo } from './types';
import { verificationSchema } from './catalog';
import type { ValidationIssue, ValidationResult } from './validation';

const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
export const mappingSchema = z.strictObject({
  version: z.literal(1),
  assetId: z.string().min(1),
  units: z.literal('m'),
  upAxis: z.literal('Y'),
  mappings: z.array(
    z.strictObject({
      objectKey: z.string().min(1),
      partId: z.string().min(1),
      explosion: z
        .strictObject({
          direction: vector.refine(
            (value) => Math.hypot(...value) > 0,
            'Explosion direction must be nonzero',
          ),
          distance: z.number().finite().nonnegative(),
          duration: z.number().finite().positive().optional(),
          easing: z.enum(['linear', 'smooth', 'cubic']).optional(),
          verification: verificationSchema,
        })
        .optional(),
    }),
  ),
  camera: z.strictObject({ position: vector, target: vector }).optional(),
});

export function validateMapping(
  input: unknown,
  catalog?: Catalog,
  objects?: SceneObjectInfo[],
): ValidationResult<MappingConfig> {
  const result = mappingSchema.safeParse(input);
  if (!result.success)
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  const issues: ValidationIssue[] = [];
  const knownParts = catalog ? new Set(catalog.parts.map((part) => part.id)) : null;
  const knownObjects = objects ? new Set(objects.map((object) => object.key)) : null;
  const keys = new Set<string>();
  result.data.mappings.forEach((mapping, i) => {
    if (keys.has(mapping.objectKey))
      issues.push({
        path: `mappings.${i}.objectKey`,
        message: `Ambiguous object mapping: ${mapping.objectKey}`,
      });
    keys.add(mapping.objectKey);
    if (knownParts && !knownParts.has(mapping.partId))
      issues.push({
        path: `mappings.${i}.partId`,
        message: `Unknown catalog part: ${mapping.partId}`,
      });
    if (knownObjects && !knownObjects.has(mapping.objectKey))
      issues.push({
        path: `mappings.${i}.objectKey`,
        message: `Missing model object: ${mapping.objectKey}`,
      });
  });
  if (objects) {
    const seen = new Set<string>();
    for (const object of objects) {
      if (seen.has(object.key))
        issues.push({
          path: 'objects',
          message: `Duplicate model object identifier: ${object.key}`,
        });
      seen.add(object.key);
    }
  }
  if (
    result.data.camera &&
    result.data.camera.position.every((value, axis) => value === result.data.camera!.target[axis])
  )
    issues.push({ path: 'camera', message: 'Camera position and target must differ' });
  return issues.length
    ? { success: false, issues }
    : { success: true, data: result.data, issues: [] };
}

interface KeyedObject {
  name: string;
  userData?: Record<string, unknown>;
  parent: KeyedObject | null;
  children: KeyedObject[];
}
/** Object IDs exported in glTF extras survive renames. Indexed paths are a fallback. */
export function getObjectKey(object: KeyedObject, root?: KeyedObject): string {
  const persistent = object.userData?.objectId;
  if (typeof persistent === 'string' && persistent.length) return `id:${persistent}`;
  const path: string[] = [];
  let current = object;
  while (current.parent && current !== root) {
    const name = typeof current.userData?.name === 'string' ? current.userData.name : current.name;
    path.push(
      `${current.parent.children.indexOf(current)}:${encodeURIComponent(name || 'object')}`,
    );
    current = current.parent;
  }
  return `$${path
    .reverse()
    .map((segment) => `/${segment}`)
    .join('')}`;
}

/** Ambiguous objects are deliberately not resolved to an arbitrary part. */
export function resolveMapping(config: MappingConfig, key: string): ObjectMapping | undefined {
  const matches = config.mappings.filter((mapping) => mapping.objectKey === key);
  return matches.length === 1 ? matches[0] : undefined;
}

export interface ClassifiedObject {
  object: SceneObjectInfo;
  status: 'mapped' | 'unmapped' | 'ambiguous';
  partIds: string[];
}
export function classifyObjects(
  objects: SceneObjectInfo[],
  config: MappingConfig,
  catalog?: Catalog,
  includeInherited = false,
): ClassifiedObject[] {
  const mappingIndex = new Map<string, string[]>();
  const occurrences = new Map<string, number>();
  const partIds = catalog ? new Set(catalog.parts.map((part) => part.id)) : null;
  for (const mapping of config.mappings)
    mappingIndex.set(mapping.objectKey, [
      ...(mappingIndex.get(mapping.objectKey) ?? []),
      mapping.partId,
    ]);
  for (const object of objects) occurrences.set(object.key, (occurrences.get(object.key) ?? 0) + 1);
  const classified: ClassifiedObject[] = objects.map((object) => {
    const matches = mappingIndex.get(object.key) ?? [];
    const ambiguous =
      matches.length > 1 ||
      occurrences.get(object.key)! > 1 ||
      matches.some((id) => partIds && !partIds.has(id));
    return {
      object,
      status: ambiguous ? 'ambiguous' : matches.length ? 'mapped' : 'unmapped',
      partIds: matches,
    };
  });
  if (!includeInherited) return classified;
  const byKey = new Map(classified.map((entry) => [entry.object.key, entry]));
  return classified.map((entry) => {
    if (entry.status !== 'unmapped') return entry;
    const visited = new Set([entry.object.key]);
    let parentKey = entry.object.parentKey;
    while (parentKey && !visited.has(parentKey)) {
      visited.add(parentKey);
      const ancestor = byKey.get(parentKey);
      if (!ancestor) break;
      if (ancestor.status !== 'unmapped')
        return { ...entry, status: ancestor.status, partIds: ancestor.partIds };
      parentKey = ancestor.object.parentKey;
    }
    return entry;
  });
}

/** Suggestions never mutate mappings: even exact-name matches must be accepted. */
export function suggestMappings(
  objects: SceneObjectInfo[],
  catalog: Catalog,
): { objectKey: string; partIds: string[]; exact: boolean }[] {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return objects
    .filter((object) => object.mesh)
    .map((object) => {
      const exact = catalog.parts.filter((part) => part.id === object.name);
      const candidates = exact.length
        ? exact
        : catalog.parts.filter(
            (part) =>
              normalize(part.id) === normalize(object.name) ||
              normalize(part.name) === normalize(object.name),
          );
      return {
        objectKey: object.key,
        partIds: candidates.map((part) => part.id),
        exact: exact.length === 1,
      };
    })
    .filter((suggestion) => suggestion.partIds.length);
}
