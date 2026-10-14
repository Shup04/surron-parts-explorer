/** Immutable factual transcription. Never replace original claims with a reconciled guess. */
export interface SourceRow {
  id: string;
  sourceId: string;
  page: number;
  figure: string;
  callout: string | null;
  rowIndex: number;
  oemNumber: string | null;
  originalDescription: string;
  normalizedName: string;
  quantity: number | null;
  quantityText: string | null;
  dimensionsText: string | null;
  weightText: string | null;
  dimensionUnitText?: string | null;
  weightUnitText?: string | null;
  material: string | null;
  notes: string[];
  applicability: string | null;
  modelYears: number[];
  itemType: 'assembly' | 'component' | 'optional' | 'variant' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
  reviewFlags: string[];
  assemblyKey: string;
  assemblyName: string;
  rawText: string;
  bounds?: [number, number, number, number];
}

export interface SourceDocument {
  id: string;
  title: string;
  filename: string | null;
  localPath: string | null;
  url: string;
  sha256: string | null;
  pageCount: number;
  edition: string | null;
  modelYears: number[];
  applicabilityNotes: string;
  redistribution: 'reference-only';
  retrievedAt: string;
  kind: 'pdf' | 'web';
}

export interface SourcePageAudit {
  page: number;
  figures: string[];
  detectedRows: number;
  importedRows: number;
  reviewRowIds: string[];
  exceptions: { callout: string | null; reason: string; evidence: string }[];
  visualStatus: 'inspected' | 'table-structure-checked' | 'not-inspected';
  notes: string[];
}

export interface SourceExtraction {
  version: 1;
  source: SourceDocument;
  rows: SourceRow[];
  pages: SourcePageAudit[];
  notes: string[];
}
