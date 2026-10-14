import { validateCatalog } from '@/core/catalog';
import type { Catalog, Part } from '@/core/types';
import type { EditorProject } from './storage';

export interface CatalogSearchEntry {
  part: Part;
  text: string;
}

/** Build once for large catalogs; searches include both physical identity and occurrence. */
export function indexCatalogTargets(catalog: Catalog): CatalogSearchEntry[] {
  const byId = new Map(catalog.parts.map((part) => [part.id, part]));
  return catalog.parts.map((part) => ({
    part,
    text: [
      part.id,
      part.name,
      part.description,
      part.oemNumber,
      part.genericDesignation,
      part.parentId && byId.get(part.parentId)?.name,
      ...Object.values(part.specifications),
      ...part.sources.flatMap((source) => [
        source.document,
        source.page,
        source.diagram,
        source.item,
      ]),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
  }));
}

export function searchCatalogTargets(index: CatalogSearchEntry[], query: string): Part[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return index
    .filter((entry) => terms.every((term) => entry.text.includes(term)))
    .map((entry) => entry.part);
}

/** Additive migration: a saved project owns its existing IDs and geometry mappings. */
export function mergeCatalogIntoProject(project: EditorProject, incoming: Catalog) {
  if (project.catalog.motorcycleId !== incoming.motorcycleId)
    throw new Error(
      'The OEM catalog belongs to a different motorcycle. Merge into a Light Bee workspace.',
    );
  const existing = new Map(project.catalog.parts.map((part) => [part.id, part]));
  const added = incoming.parts.filter((part) => !existing.has(part.id));
  const retainedDifferences = incoming.parts
    .filter((part) => {
      const local = existing.get(part.id);
      return local && JSON.stringify(local) !== JSON.stringify(part);
    })
    .map((part) => part.id);
  const result = validateCatalog({
    ...project.catalog,
    parts: [...project.catalog.parts, ...added],
  });
  if (!result.success)
    throw new Error(
      `Catalog merge cannot preserve these relationships: ${result.issues.map((issue) => issue.message).join('; ')}`,
    );
  return {
    project: { ...project, catalog: result.data },
    addedCount: added.length,
    retainedDifferences,
  };
}
