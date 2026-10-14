import type { SourceExtraction, SourceRow } from './source-types';
import type {
  Assembly,
  CatalogConflict,
  CatalogPart,
  ModelVariant,
  OemDatabase,
  PartOccurrence,
} from './types';

/** Deterministic UTF-8-independent ID hash; collisions are checked during validation. */
export function stableHash(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 0x01000193);
    b = Math.imul(b ^ value.charCodeAt(i), 0x85ebca6b);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

function slug(value: string): string {
  return (
    value
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'record'
  );
}

export function catalogPartId(oemNumber: string | null, rowIdentity: string): string {
  return oemNumber === null
    ? `unidentified-${stableHash(rowIdentity)}`
    : `oem-${slug(oemNumber)}-${stableHash(oemNumber)}`;
}

// Source extractors explicitly identify these equivalent figure groups. No physical nesting
// is inferred from component descriptions or from the demonstration model.
const assemblyAliases: Record<string, string> = {
  footpegs: 'footpegs-stand',
  decals: 'stickers',
  'suspension-adapter': 'rear-suspension-adapter',
  'intermediate-shaft': 'jackshaft',
  midshaft: 'jackshaft',
};

export function assemblyIdForKey(key: string): string {
  return assemblyAliases[key] ?? slug(key);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function valuesByOccurrence(
  rows: Map<string, SourceRow>,
  occurrences: PartOccurrence[],
  pick: (row: SourceRow) => string | null,
): { occurrenceId: string; value: string }[] {
  return occurrences.flatMap((occurrence) => {
    const value = pick(rows.get(occurrence.sourceRowId)!);
    return value === null ? [] : [{ occurrenceId: occurrence.id, value }];
  });
}

/** Discrepancies remain independent claims; this never chooses a winning source. */
export function detectConflicts(database: OemDatabase): CatalogConflict[] {
  const rows = new Map(database.sourceRows.map((row) => [row.id, row]));
  const byPart = new Map<string, PartOccurrence[]>();
  for (const occurrence of database.occurrences) {
    const group = byPart.get(occurrence.partId) ?? [];
    group.push(occurrence);
    byPart.set(occurrence.partId, group);
  }
  const conflicts: CatalogConflict[] = [];
  const add = (
    kind: CatalogConflict['kind'],
    occurrences: PartOccurrence[],
    claims: CatalogConflict['claims'],
    explanation: string,
  ) => {
    if (new Set(claims.map((claim) => claim.value.trim().toLowerCase())).size < 2) return;
    conflicts.push({
      id: `conflict-${stableHash(
        `${kind}:${claims
          .map((c) => `${c.occurrenceId}:${c.value}`)
          .sort()
          .join('|')}`,
      )}`,
      kind,
      partIds: unique(occurrences.map((o) => o.partId)),
      occurrenceIds: claims.map((c) => c.occurrenceId),
      claims,
      explanation,
      status: 'review-required',
    });
  };
  for (const occurrences of byPart.values()) {
    if (unique(occurrences.map((o) => o.sourceId)).length < 2) continue;
    for (const field of ['dimensions', 'material', 'description'] as const) {
      const claims = valuesByOccurrence(rows, occurrences, (row) =>
        field === 'dimensions'
          ? row.dimensionsText
          : field === 'material'
            ? row.material
            : row.normalizedName,
      );
      add(
        field,
        occurrences,
        claims,
        field === 'description'
          ? 'Sources use different descriptions for this exact OEM number. This can be a terminology difference; review before treating it as a physical revision.'
          : `Sources report different ${field} text for this exact OEM number. Units, formatting, measurement meaning and applicability require review.`,
      );
    }
    for (const assemblyId of unique(occurrences.map((o) => o.assemblyId))) {
      const assemblyOccurrences = occurrences.filter((o) => o.assemblyId === assemblyId);
      const sourceIds = assemblyOccurrences.map((o) => o.sourceId);
      // Several uses of the same bolt in one figure cannot be equated by name or OEM alone.
      if (unique(sourceIds).length < 2 || unique(sourceIds).length !== sourceIds.length) continue;
      add(
        'quantity',
        assemblyOccurrences,
        valuesByOccurrence(rows, assemblyOccurrences, (row) => row.quantity?.toString() ?? null),
        'Different source quantities for one occurrence of this OEM number in the same source assembly group. Historical editions may differ; do not sum or silently resolve these claims.',
      );
    }
  }
  // Compare source-local figure/callout positions only when figure labels also agree.
  // A callout alone is never a physical identity and shifted figure numbering is not equated.
  const positions = new Map<string, PartOccurrence[]>();
  for (const occurrence of database.occurrences) {
    const row = rows.get(occurrence.sourceRowId)!;
    if (!row.callout || row.oemNumber === null) continue;
    const key = `${occurrence.assemblyId}:${row.figure}:${row.callout}`;
    const group = positions.get(key) ?? [];
    group.push(occurrence);
    positions.set(key, group);
  }
  for (const occurrences of positions.values()) {
    if (unique(occurrences.map((o) => o.sourceId)).length < 2) continue;
    const claimsBySource = new Map<string, Set<string>>();
    for (const occurrence of occurrences) {
      const values = claimsBySource.get(occurrence.sourceId) ?? new Set<string>();
      values.add(rows.get(occurrence.sourceRowId)!.oemNumber!);
      claimsBySource.set(occurrence.sourceId, values);
    }
    // Several color/fork/optional variants may legitimately share a callout. Identical
    // alternative sets in two editions are agreement, not conflicting part identities.
    if (
      new Set([...claimsBySource.values()].map((values) => [...values].sort().join('|'))).size < 2
    )
      continue;
    add(
      'oem-callout',
      occurrences,
      valuesByOccurrence(rows, occurrences, (row) => row.oemNumber),
      'The same figure/callout label within a source assembly group has different OEM numbers in different documents. This is a candidate discrepancy, not proof of interchangeability or of an extraction error.',
    );
  }
  return conflicts;
}

export function buildOemDatabase(input: SourceExtraction[]): OemDatabase {
  const fingerprints = new Set<string>();
  const sourceIds = new Map<string, string>();
  const extractions: SourceExtraction[] = [];
  for (const extraction of [...input].sort((a, b) => a.source.id.localeCompare(b.source.id))) {
    const fingerprint =
      extraction.source.sha256 ?? `${extraction.source.kind}:${extraction.source.url}`;
    const prior = sourceIds.get(extraction.source.id);
    if (prior && prior !== fingerprint)
      throw new Error(`Source ID reused for changed document: ${extraction.source.id}`);
    sourceIds.set(extraction.source.id, fingerprint);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    extractions.push(extraction);
  }
  const parts = new Map<string, CatalogPart>();
  const assemblies = new Map<string, Assembly>();
  const variants = new Map<string, ModelVariant>();
  const sourceRows: SourceRow[] = [];
  const rowIds = new Set<string>();
  const occurrences: PartOccurrence[] = [];
  for (const extraction of extractions) {
    for (const row of extraction.rows) {
      if (rowIds.has(row.id)) throw new Error(`Duplicate source row ID: ${row.id}`);
      if (row.sourceId !== extraction.source.id)
        throw new Error(`Row ${row.id} belongs to another source`);
      rowIds.add(row.id);
      sourceRows.push(row);
      const partId = catalogPartId(
        row.oemNumber,
        `${extraction.source.sha256 ?? extraction.source.url}:${row.id}`,
      );
      const existing = parts.get(partId);
      if (existing && existing.oemNumber !== row.oemNumber)
        throw new Error(`Catalog identity collision: ${partId}`);
      if (existing) {
        existing.sourceRowIds.push(row.id);
        existing.aliases = unique([
          ...existing.aliases,
          row.normalizedName,
          row.originalDescription,
        ]);
      } else {
        parts.set(partId, {
          id: partId,
          oemNumber: row.oemNumber,
          normalizedName: row.normalizedName,
          sourceRowIds: [row.id],
          aliases: unique([row.normalizedName, row.originalDescription]),
          kind: row.itemType,
        });
      }
      const assemblyId = assemblyIdForKey(row.assemblyKey);
      const figure = { sourceId: row.sourceId, figure: row.figure, page: row.page };
      const assembly = assemblies.get(assemblyId);
      if (assembly) {
        assembly.aliases = unique([...assembly.aliases, row.assemblyName]);
        if (
          !assembly.sourceFigures.some(
            (f) =>
              f.sourceId === figure.sourceId &&
              f.figure === figure.figure &&
              f.page === figure.page,
          )
        ) {
          assembly.sourceFigures.push(figure);
        }
      } else {
        assemblies.set(assemblyId, {
          id: assemblyId,
          name: row.assemblyName,
          parentId: 'lbx',
          aliases: [row.assemblyName],
          sourceFigures: [figure],
          relationship: 'source-figure-group',
        });
      }
      // Years come only from row-level source evidence. The source date is not fitment.
      const years = unique(row.modelYears).sort();
      const variantId = years.length
        ? `lbx-source-${years.join('-')}`
        : `lbx-unknown-${row.sourceId}`;
      const variant = variants.get(variantId);
      if (variant) variant.sourceIds = unique([...variant.sourceIds, row.sourceId]);
      else
        variants.set(variantId, {
          id: variantId,
          name: years.length
            ? `Light Bee · ${years.join(', ')} source reference`
            : `Light Bee · year unspecified (${extraction.source.title})`,
          model: 'Sur-Ron Light Bee',
          years,
          applicability: years.length ? 'source-edition' : 'unknown',
          sourceIds: [row.sourceId],
          notes: row.applicability ?? extraction.source.applicabilityNotes,
        });
      occurrences.push({
        id: `occ-${row.id}`,
        partId,
        assemblyId,
        sourceRowId: row.id,
        sourceId: row.sourceId,
        quantity: row.quantity,
        variantIds: [variantId],
        reviewStatus:
          row.reviewFlags.length || row.confidence !== 'high' ? 'needs-review' : 'unreviewed',
        reviewFlags: [...row.reviewFlags],
        geometryMappingIds: [],
      });
    }
  }
  const database: OemDatabase = {
    version: 1,
    motorcycleId: 'lbx',
    sources: extractions.map((e) => e.source),
    sourceRows,
    sourceAudits: extractions.map((e) => ({
      sourceId: e.source.id,
      pages: e.pages,
      notes: e.notes,
    })),
    parts: [...parts.values()],
    assemblies: [...assemblies.values()],
    occurrences,
    variants: [...variants.values()],
    conflicts: [],
    relationships: [],
    reviewPatches: [],
  };
  database.conflicts = detectConflicts(database);
  const conflictIds = new Set(database.conflicts.flatMap((conflict) => conflict.occurrenceIds));
  for (const occurrence of database.occurrences) {
    if (conflictIds.has(occurrence.id)) {
      occurrence.reviewFlags.push('source-discrepancy');
      occurrence.reviewStatus = 'needs-review';
    }
  }
  return database;
}
