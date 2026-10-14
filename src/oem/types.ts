import type { SourceDocument, SourcePageAudit, SourceRow } from './source-types';

export type ReviewStatus =
  | 'unreviewed'
  | 'needs-review'
  | 'source-checked'
  | 'mechanically-verified';

/** Identity is independent of figure callouts, use quantities, and geometry. */
export interface CatalogPart {
  id: string;
  oemNumber: string | null;
  normalizedName: string;
  sourceRowIds: string[];
  aliases: string[];
  kind: SourceRow['itemType'];
}

export interface Assembly {
  id: string;
  name: string;
  parentId: string;
  aliases: string[];
  sourceFigures: { sourceId: string; figure: string; page: number }[];
  /** These are source table groups; they do not assert hidden mechanical nesting. */
  relationship: 'source-figure-group';
}

export interface PartOccurrence {
  id: string;
  partId: string;
  assemblyId: string;
  sourceRowId: string;
  sourceId: string;
  quantity: number | null;
  variantIds: string[];
  reviewStatus: ReviewStatus;
  reviewFlags: string[];
  geometryMappingIds: string[];
}

export interface ModelVariant {
  id: string;
  name: string;
  model: string;
  years: number[];
  applicability: 'source-edition' | 'unknown';
  sourceIds: string[];
  notes: string;
}

export interface CatalogConflict {
  id: string;
  kind: 'quantity' | 'dimensions' | 'material' | 'description' | 'oem-callout';
  partIds: string[];
  occurrenceIds: string[];
  claims: { occurrenceId: string; value: string }[];
  explanation: string;
  status: 'review-required';
}

export interface PartRelationship {
  fromPartId: string;
  toPartId: string;
  kind: 'supersedes' | 'alternative-number' | 'confirmed-interchangeable' | 'similar-specification';
  sourceRowIds: string[];
  reviewStatus: ReviewStatus;
  notes: string;
}

export interface ReviewPatch {
  occurrenceId: string;
  normalizedName?: string;
  assemblyId?: string;
  reviewStatus?: ReviewStatus;
  oemNumber?: string | null;
  quantity?: number | null;
  note: string;
  updatedAt: string;
}

export interface ReviewPatchSet {
  version: 1;
  patches: ReviewPatch[];
}

export interface OemDatabase {
  version: 1;
  motorcycleId: 'lbx';
  sources: SourceDocument[];
  sourceRows: SourceRow[];
  sourceAudits: { sourceId: string; pages: SourcePageAudit[]; notes: string[] }[];
  parts: CatalogPart[];
  assemblies: Assembly[];
  occurrences: PartOccurrence[];
  variants: ModelVariant[];
  conflicts: CatalogConflict[];
  relationships: PartRelationship[];
  reviewPatches: ReviewPatch[];
}

export interface CatalogFilters {
  text?: string;
  assemblyId?: string;
  sourceId?: string;
  modelYear?: number | 'unknown';
  issue?:
    | 'missing-oem'
    | 'missing-quantity'
    | 'dimensions'
    | 'conflicts'
    | 'duplicate-oem'
    | 'needs-review'
    | 'unmapped';
}

export interface SourceCoverage {
  sourceId: string;
  title: string;
  kind: 'pdf' | 'web';
  pageCount: number;
  pagesProcessed: number;
  pagesVisuallyInspected: number;
  figuresIdentified: number;
  tableRowsDetected: number;
  importedRecords: number;
  requiringReview: number;
  conflicts: number;
  explicitExceptions: number;
  mappedCatalogParts: number;
  awaitingMappingCatalogParts: number;
  catalogParts: number;
  missingOemNumbers: number;
  missingQuantities: number;
  issues: string[];
}
