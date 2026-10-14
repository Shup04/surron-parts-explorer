import type { SourceDocument, SourceRow } from './source-types';
import type {
  Assembly,
  CatalogFilters,
  CatalogPart,
  OemDatabase,
  PartOccurrence,
  ReviewPatch,
} from './types';

interface OemIndex {
  parts: Map<string, CatalogPart>;
  rows: Map<string, SourceRow>;
  sources: Map<string, SourceDocument>;
  assemblies: Map<string, Assembly>;
  occurrences: Map<string, PartOccurrence>;
  patches: Map<string, ReviewPatch>;
  conflicts: Map<string, OemDatabase['conflicts']>;
  occurrenceCounts: Map<string, number>;
}
const indexes = new WeakMap<OemDatabase, OemIndex>();

export function buildOemIndex(database: OemDatabase): OemIndex {
  const cached = indexes.get(database);
  if (cached) return cached;
  const conflicts = new Map<string, OemDatabase['conflicts']>();
  for (const conflict of database.conflicts)
    for (const id of conflict.occurrenceIds) {
      const list = conflicts.get(id) ?? [];
      list.push(conflict);
      conflicts.set(id, list);
    }
  const occurrenceCounts = new Map<string, number>();
  for (const occurrence of database.occurrences)
    occurrenceCounts.set(occurrence.partId, (occurrenceCounts.get(occurrence.partId) ?? 0) + 1);
  const index: OemIndex = {
    parts: new Map(database.parts.map((p) => [p.id, p])),
    rows: new Map(database.sourceRows.map((p) => [p.id, p])),
    sources: new Map(database.sources.map((p) => [p.id, p])),
    assemblies: new Map(database.assemblies.map((p) => [p.id, p])),
    occurrences: new Map(database.occurrences.map((p) => [p.id, p])),
    patches: new Map(database.reviewPatches.map((p) => [p.occurrenceId, p])),
    conflicts,
    occurrenceCounts,
  };
  indexes.set(database, index);
  return index;
}

/** Effective display values include explicit local review overrides; sourceRow stays immutable. */
export function getOccurrenceDetails(database: OemDatabase, occurrenceId: string) {
  const index = buildOemIndex(database);
  const original = index.occurrences.get(occurrenceId);
  if (!original) return null;
  const originalPart = index.parts.get(original.partId)!;
  const sourceRow = index.rows.get(original.sourceRowId)!;
  const patch = index.patches.get(occurrenceId);
  const occurrence = {
    ...original,
    assemblyId: patch?.assemblyId ?? original.assemblyId,
    reviewStatus: patch?.reviewStatus ?? original.reviewStatus,
    quantity: patch && 'quantity' in patch ? patch.quantity! : original.quantity,
  };
  const part = {
    ...originalPart,
    normalizedName: patch?.normalizedName ?? sourceRow.normalizedName,
    oemNumber: patch && 'oemNumber' in patch ? patch.oemNumber! : originalPart.oemNumber,
  };
  return {
    occurrence,
    part,
    sourceRow,
    source: index.sources.get(original.sourceId)!,
    assembly: index.assemblies.get(occurrence.assemblyId)!,
    conflicts: index.conflicts.get(occurrenceId) ?? [],
    patch,
  };
}

export function filterOccurrences(
  database: OemDatabase,
  filters: CatalogFilters = {},
): PartOccurrence[] {
  const index = buildOemIndex(database);
  const terms = filters.text?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  return database.occurrences.flatMap((original) => {
    const detail = getOccurrenceDetails(database, original.id)!;
    const { occurrence, sourceRow, part, assembly } = detail;
    if (filters.sourceId && occurrence.sourceId !== filters.sourceId) return [];
    if (filters.assemblyId && occurrence.assemblyId !== filters.assemblyId) return [];
    if (filters.modelYear === 'unknown' && sourceRow.modelYears.length) return [];
    if (typeof filters.modelYear === 'number' && !sourceRow.modelYears.includes(filters.modelYear))
      return [];
    const checked =
      occurrence.reviewStatus === 'source-checked' ||
      occurrence.reviewStatus === 'mechanically-verified';
    if (filters.issue === 'missing-oem' && part.oemNumber !== null) return [];
    if (filters.issue === 'missing-quantity' && occurrence.quantity !== null) return [];
    if (
      filters.issue === 'dimensions' &&
      (!sourceRow.dimensionsText || occurrence.reviewStatus === 'mechanically-verified')
    )
      return [];
    if (filters.issue === 'conflicts' && !detail.conflicts.length) return [];
    if (
      filters.issue === 'duplicate-oem' &&
      (part.oemNumber === null || (index.occurrenceCounts.get(part.id) ?? 0) < 2)
    )
      return [];
    if (filters.issue === 'needs-review' && checked) return [];
    if (filters.issue === 'unmapped' && occurrence.geometryMappingIds.length) return [];
    const synonyms = assembly.id === 'jackshaft' ? 'midshaft intermediate shaft jackshaft' : '';
    const text = [
      part.normalizedName,
      part.oemNumber,
      ...part.aliases,
      sourceRow.originalDescription,
      sourceRow.dimensionsText,
      sourceRow.material,
      sourceRow.weightText,
      sourceRow.callout,
      assembly.name,
      ...assembly.aliases,
      ...sourceRow.notes,
      synonyms,
    ]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    if (terms.some((term) => !text.includes(term))) return [];
    return [occurrence];
  });
}

export function availableModelYears(database: OemDatabase): number[] {
  return [...new Set(database.sourceRows.flatMap((row) => row.modelYears))].sort((a, b) => a - b);
}
