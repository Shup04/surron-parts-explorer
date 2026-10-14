import type { Catalog, Part, SourceReference } from '../core/types';
import type { CatalogFilters, OemDatabase } from './types';
import { filterOccurrences, getOccurrenceDetails } from './queries';

function blankPart(id: string, name: string, kind: Part['kind'], parentId: string | null): Part {
  return {
    id,
    name,
    kind,
    parentId,
    description: '',
    oemNumber: null,
    genericDesignation: null,
    quantity: null,
    material: null,
    specifications: {},
    dimensions: [],
    compatibility: [],
    sources: [],
    verification: 'unknown',
    images: [],
    alternatives: [],
    crossReferences: [],
  };
}

/** Existing explorer protocol, with occurrences as selectable nodes and zero invented meshes. */
export function toExplorerCatalog(database: OemDatabase, filters: CatalogFilters = {}): Catalog {
  const occurrences = filterOccurrences(database, filters);
  const assemblyIds = new Set(occurrences.map((occurrence) => occurrence.assemblyId));
  const root = blankPart('lbx', 'Sur-Ron Light Bee X', 'motorcycle', null);
  root.description =
    'Source-backed Light Bee parts references. Catalog editions and retailer model-year claims are retained separately; inclusion is not a verified fitment guarantee.';
  const sourceMap = new Map(database.sources.map((source) => [source.id, source]));
  const assemblies = database.assemblies
    .filter((assembly) => assemblyIds.has(assembly.id))
    .map((assembly) => {
      const part = blankPart(assembly.id, assembly.name, 'assembly', 'lbx');
      part.description =
        'Factory source figure group. Complete assemblies and their separately listed components are separate catalog occurrences; quantities must not be added as a bill of materials.';
      part.specifications = { Terminology: assembly.aliases.join(' · ') };
      if (assembly.id === 'jackshaft')
        part.specifications.Terminology += ' · Midshaft · Intermediate shaft · Jackshaft';
      part.sources = assembly.sourceFigures
        .filter((figure) => !filters.sourceId || figure.sourceId === filters.sourceId)
        .map(
          (figure): SourceReference => ({
            document: sourceMap.get(figure.sourceId)!.title,
            page: String(figure.page),
            diagram: figure.figure,
            url: sourceMap.get(figure.sourceId)!.url,
          }),
        );
      return part;
    });
  const components = occurrences.map((occurrence) => {
    const {
      part: identity,
      sourceRow: row,
      source,
      patch,
      conflicts,
    } = getOccurrenceDetails(database, occurrence.id)!;
    // A commercial assembly row stays individually selectable. No constituent relationship
    // is asserted unless separately documented, so do not synthesize children from its name.
    const part = blankPart(
      occurrence.id,
      identity.normalizedName,
      'component',
      occurrence.assemblyId,
    );
    part.description = row.originalDescription;
    part.oemNumber = identity.oemNumber;
    part.quantity =
      occurrence.quantity !== null &&
      Number.isInteger(occurrence.quantity) &&
      occurrence.quantity > 0
        ? occurrence.quantity
        : null;
    part.material = row.material;
    part.specifications = {
      'Catalog identity': identity.id,
      'Source record': row.id,
      'Item type': row.itemType,
      'Source confidence': row.confidence,
      'Review status': occurrence.reviewStatus,
    };
    if (occurrence.assemblyId === 'jackshaft')
      part.specifications['Assembly terminology'] = 'Midshaft · Intermediate shaft · Jackshaft';
    if (row.dimensionsText)
      part.specifications['Source dimensions'] =
        `${row.dimensionsText}${row.dimensionUnitText ? ` · ${row.dimensionUnitText}` : ''}`;
    if (row.weightText)
      part.specifications['Source weight'] =
        `${row.weightText}${row.weightUnitText ? ` · ${row.weightUnitText}` : ''}`;
    if (row.quantityText && part.quantity === null)
      part.specifications['Source quantity'] = row.quantityText;
    if (row.modelYears.length) part.specifications['Source years'] = row.modelYears.join(', ');
    if (row.applicability) part.specifications['Applicability statement'] = row.applicability;
    if (row.notes.length) part.specifications['Source notes'] = row.notes.join(' · ');
    if (row.reviewFlags.length) part.specifications['Review flags'] = row.reviewFlags.join(' · ');
    if (conflicts.length) part.specifications['Source discrepancies'] = String(conflicts.length);
    if (patch?.note) part.specifications['Reviewer note'] = patch.note;
    part.sources = [
      {
        document: source.title,
        page: String(row.page),
        diagram: row.figure,
        ...(row.callout ? { item: row.callout } : {}),
        url: source.url,
        notes: `${source.applicabilityNotes}${row.notes.length ? ' · ' + row.notes.join(' · ') : ''}`,
      },
    ];
    part.compatibility = row.modelYears.length
      ? [
          {
            model: 'Sur-Ron Light Bee (source applicability)',
            years: row.modelYears,
            verification: 'unknown',
          },
        ]
      : [];
    part.verification =
      occurrence.reviewStatus === 'mechanically-verified'
        ? 'mechanically-verified'
        : occurrence.reviewStatus === 'source-checked'
          ? 'source-confirmed'
          : 'unknown';
    return part;
  });
  return { version: 1, motorcycleId: 'lbx', parts: [root, ...assemblies, ...components] };
}
