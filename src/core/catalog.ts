import { z } from 'zod';
import type { Catalog, Part } from './types';
import type { ValidationResult, ValidationIssue } from './validation';

export const verificationSchema = z.enum([
  'unknown',
  'demonstration',
  'source-confirmed',
  'mechanically-verified',
]);
const nullableText = z.string().min(1, 'Use null for an unknown value').nullable();
const identifier = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
    'Use a stable identifier containing letters, digits, periods, underscores or hyphens',
  );
export const partSchema = z.strictObject({
  id: identifier,
  name: z.string().trim().min(1),
  description: z.string(),
  kind: z.enum(['motorcycle', 'assembly', 'component']),
  parentId: identifier.nullable(),
  oemNumber: nullableText,
  genericDesignation: nullableText,
  quantity: z.number().int().positive().nullable(),
  material: nullableText,
  specifications: z.record(z.string(), z.string()),
  dimensions: z.array(
    z.strictObject({
      label: z.string().min(1),
      value: z.number().finite(),
      unit: z.enum(['mm', 'cm', 'm', 'deg']),
    }),
  ),
  compatibility: z.array(
    z.strictObject({
      model: z.string().min(1),
      years: z.array(z.number().int().min(1900).max(2200)),
      verification: verificationSchema,
    }),
  ),
  sources: z.array(
    z.strictObject({
      document: z.string().min(1),
      page: z.string().optional(),
      diagram: z.string().optional(),
      item: z.string().optional(),
      url: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  verification: verificationSchema,
  images: z.array(z.strictObject({ url: z.string().min(1), alt: z.string() })),
  alternatives: z.array(
    z.strictObject({
      id: identifier,
      relation: z.enum(['confirmed-interchangeable', 'similar-specification', 'unverified']),
      notes: z.string(),
    }),
  ),
  crossReferences: z.array(identifier),
});
const catalogSchema = z.strictObject({
  version: z.literal(1),
  motorcycleId: identifier,
  parts: z.array(partSchema).min(1),
});

export function validateCatalog(input: unknown): ValidationResult<Catalog> {
  const parsed = catalogSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  const catalog = parsed.data;
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, Part>();
  catalog.parts.forEach((part, i) => {
    if (byId.has(part.id))
      issues.push({ path: `parts.${i}.id`, message: `Duplicate part ID: ${part.id}` });
    else byId.set(part.id, part);
  });
  const root = byId.get(catalog.motorcycleId);
  if (!root || root.kind !== 'motorcycle' || root.parentId !== null)
    issues.push({
      path: 'motorcycleId',
      message: 'Must identify the root motorcycle with a null parent',
    });
  for (let i = 0; i < catalog.parts.length; i++) {
    const part = catalog.parts[i];
    if (part.id !== catalog.motorcycleId && part.parentId === null)
      issues.push({
        path: `parts.${i}.parentId`,
        message: 'Only the root motorcycle may have no parent',
      });
    if (part.id !== catalog.motorcycleId && part.kind === 'motorcycle')
      issues.push({
        path: `parts.${i}.kind`,
        message: 'A catalog describes one motorcycle; use another catalog for another motorcycle',
      });
    if (part.parentId !== null) {
      const parent = byId.get(part.parentId);
      if (!parent)
        issues.push({ path: `parts.${i}.parentId`, message: `Missing parent: ${part.parentId}` });
      else if (parent.kind === 'component')
        issues.push({
          path: `parts.${i}.parentId`,
          message: 'A component cannot contain children; change its kind to assembly',
        });
    }
    for (const reference of part.crossReferences)
      if (!byId.has(reference))
        issues.push({
          path: `parts.${i}.crossReferences`,
          message: `Missing cross-referenced part: ${reference}`,
        });
  }
  // Iterative walks avoid overflowing the stack on deeply nested imported catalogs.
  const complete = new Set<string>();
  for (const part of catalog.parts) {
    const path = new Set<string>();
    let current: Part | undefined = part;
    while (current && !complete.has(current.id)) {
      if (path.has(current.id)) {
        issues.push({
          path: `parts.${part.id}.parentId`,
          message: `Hierarchy cycle at ${current.id}`,
        });
        break;
      }
      path.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    for (const id of path) complete.add(id);
  }
  return issues.length ? { success: false, issues } : { success: true, data: catalog, issues: [] };
}

export interface CatalogIndex {
  catalog: Catalog;
  byId: Map<string, Part>;
  children: Map<string, Part[]>;
  root: Part;
  searchText: Map<string, string>;
}

export function buildCatalogIndex(catalog: Catalog): CatalogIndex {
  const result = validateCatalog(catalog);
  if (!result.success)
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  const byId = new Map(catalog.parts.map((part) => [part.id, part]));
  const children = new Map<string, Part[]>();
  const searchText = new Map<string, string>();
  for (const part of catalog.parts) {
    if (part.parentId) {
      const siblings = children.get(part.parentId) ?? [];
      siblings.push(part);
      children.set(part.parentId, siblings);
    }
    searchText.set(
      part.id,
      [
        part.name,
        part.id,
        part.oemNumber,
        part.genericDesignation,
        part.description,
        ...Object.entries(part.specifications).flat(),
        ...part.dimensions.map((d) => `${d.label} ${d.value} ${d.unit}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase(),
    );
  }
  return { catalog, byId, children, searchText, root: byId.get(catalog.motorcycleId)! };
}

export function getChildren(index: CatalogIndex, id: string): Part[] {
  return index.children.get(id) ?? [];
}
/** Root first, immediate parent last; excludes the requested part. */
export function getAncestors(index: CatalogIndex, id: string): Part[] {
  const result: Part[] = [];
  let parent = index.byId.get(id)?.parentId;
  while (parent) {
    const part = index.byId.get(parent);
    if (!part) break;
    result.push(part);
    parent = part.parentId;
  }
  return result.reverse();
}
/** Depth-first descendants, excluding the requested part. */
export function getDescendants(index: CatalogIndex, id: string): Part[] {
  const result: Part[] = [];
  const stack = [...getChildren(index, id)].reverse();
  while (stack.length) {
    const part = stack.pop()!;
    result.push(part);
    const children = getChildren(index, part.id);
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return result;
}
/** Assemblies return themselves; components return their nearest parent assembly. */
export function getAssemblyForPart(index: CatalogIndex, id: string): Part {
  const part = index.byId.get(id);
  if (!part) return index.root;
  return part.kind === 'component' ? (index.byId.get(part.parentId!) ?? index.root) : part;
}

export function searchParts(index: CatalogIndex, query: string, limit = 100): Part[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  const terms = normalized.split(/\s+/);
  // Including ancestor text makes searches such as "jackshaft bearing" useful.
  return index.catalog.parts
    .map((part, order) => {
      const own = index.searchText.get(part.id)!;
      const text = `${own} ${getAncestors(index, part.id)
        .map((p) => p.name)
        .join(' ')
        .toLocaleLowerCase()}`;
      const score = terms.every((term) => text.includes(term))
        ? part.id === normalized || part.oemNumber?.toLocaleLowerCase() === normalized
          ? 0
          : part.name.toLocaleLowerCase() === normalized
            ? 1
            : own.includes(normalized)
              ? 2
              : 3
        : -1;
      return { part, score, order };
    })
    .filter((hit) => hit.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((hit) => hit.part);
}
