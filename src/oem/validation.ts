import { z } from 'zod';
import type { ValidationResult, ValidationIssue } from '../core/validation';
import type { SourceExtraction } from './source-types';
import type { OemDatabase, ReviewPatchSet } from './types';

const id = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
const nullableText = z.string().min(1).nullable();
const quantity = z.number().finite().nonnegative().nullable();
const years = z.array(z.number().int().min(1900).max(2200));
const reviewStatus = z.enum([
  'unreviewed',
  'needs-review',
  'source-checked',
  'mechanically-verified',
]);
const itemType = z.enum(['assembly', 'component', 'optional', 'variant', 'unknown']);
export const sourceRowSchema = z.strictObject({
  id,
  sourceId: id,
  page: z.number().int().positive(),
  figure: z.string().min(1),
  callout: nullableText,
  rowIndex: z.number().int().nonnegative(),
  oemNumber: nullableText,
  originalDescription: z.string(),
  normalizedName: z.string().min(1),
  quantity,
  quantityText: nullableText,
  dimensionsText: nullableText,
  weightText: nullableText,
  dimensionUnitText: nullableText.optional(),
  weightUnitText: nullableText.optional(),
  material: nullableText,
  notes: z.array(z.string()),
  applicability: nullableText,
  modelYears: years,
  itemType,
  confidence: z.enum(['high', 'medium', 'low']),
  reviewFlags: z.array(z.string()),
  assemblyKey: id,
  assemblyName: z.string().min(1),
  rawText: z.string().min(1),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
});
export const sourceDocumentSchema = z.strictObject({
  id,
  title: z.string().min(1),
  filename: nullableText,
  localPath: nullableText,
  url: z
    .string()
    .url()
    .regex(/^https?:\/\//i, 'Source URLs must use HTTP or HTTPS'),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable(),
  pageCount: z.number().int().nonnegative(),
  edition: nullableText,
  modelYears: years,
  applicabilityNotes: z.string().min(1),
  redistribution: z.literal('reference-only'),
  retrievedAt: z.string().min(1),
  kind: z.enum(['pdf', 'web']),
});
const pageAuditSchema = z.strictObject({
  page: z.number().int().positive(),
  figures: z.array(z.string()),
  detectedRows: z.number().int().nonnegative(),
  importedRows: z.number().int().nonnegative(),
  reviewRowIds: z.array(id),
  exceptions: z.array(
    z.strictObject({
      callout: nullableText,
      reason: z.string().min(1),
      evidence: z.string().min(1),
    }),
  ),
  visualStatus: z.enum(['inspected', 'table-structure-checked', 'not-inspected']),
  notes: z.array(z.string()),
});
export const extractionSchema = z.strictObject({
  version: z.literal(1),
  source: sourceDocumentSchema,
  rows: z.array(sourceRowSchema),
  pages: z.array(pageAuditSchema),
  notes: z.array(z.string()),
});

export const reviewPatchSchema = z
  .strictObject({
    occurrenceId: id,
    normalizedName: z.string().trim().min(1).optional(),
    assemblyId: id.optional(),
    reviewStatus: reviewStatus.optional(),
    oemNumber: nullableText.optional(),
    quantity: quantity.optional(),
    note: z.string(),
    updatedAt: z.string().datetime(),
  })
  .superRefine((patch, ctx) => {
    if (('oemNumber' in patch || 'quantity' in patch) && !patch.note.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message:
          'An OEM or quantity correction requires an evidence note; original claims are retained.',
      });
    }
  });
export const reviewPatchSetSchema = z.strictObject({
  version: z.literal(1),
  patches: z.array(reviewPatchSchema),
});

const databaseSchema = z.strictObject({
  version: z.literal(1),
  motorcycleId: z.literal('lbx'),
  sources: z.array(sourceDocumentSchema),
  sourceRows: z.array(sourceRowSchema),
  sourceAudits: z.array(
    z.strictObject({ sourceId: id, pages: z.array(pageAuditSchema), notes: z.array(z.string()) }),
  ),
  parts: z.array(
    z.strictObject({
      id,
      oemNumber: nullableText,
      normalizedName: z.string().min(1),
      sourceRowIds: z.array(id).min(1),
      aliases: z.array(z.string()),
      kind: itemType,
    }),
  ),
  assemblies: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      parentId: id,
      aliases: z.array(z.string()),
      sourceFigures: z.array(
        z.strictObject({ sourceId: id, figure: z.string(), page: z.number().int().positive() }),
      ),
      relationship: z.literal('source-figure-group'),
    }),
  ),
  occurrences: z.array(
    z.strictObject({
      id,
      partId: id,
      assemblyId: id,
      sourceRowId: id,
      sourceId: id,
      quantity,
      variantIds: z.array(id),
      reviewStatus,
      reviewFlags: z.array(z.string()),
      geometryMappingIds: z.array(z.string()),
    }),
  ),
  variants: z.array(
    z.strictObject({
      id,
      name: z.string(),
      model: z.string(),
      years,
      applicability: z.enum(['source-edition', 'unknown']),
      sourceIds: z.array(id),
      notes: z.string(),
    }),
  ),
  conflicts: z.array(
    z.strictObject({
      id,
      kind: z.enum(['quantity', 'dimensions', 'material', 'description', 'oem-callout']),
      partIds: z.array(id),
      occurrenceIds: z.array(id),
      claims: z.array(z.strictObject({ occurrenceId: id, value: z.string() })),
      explanation: z.string(),
      status: z.literal('review-required'),
    }),
  ),
  relationships: z.array(
    z.strictObject({
      fromPartId: id,
      toPartId: id,
      kind: z.enum([
        'supersedes',
        'alternative-number',
        'confirmed-interchangeable',
        'similar-specification',
      ]),
      sourceRowIds: z.array(id),
      reviewStatus,
      notes: z.string(),
    }),
  ),
  reviewPatches: z.array(reviewPatchSchema),
});

function failed(error: z.ZodError): { success: false; issues: ValidationIssue[] } {
  return {
    success: false,
    issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
  };
}

export function validateExtraction(input: unknown): ValidationResult<SourceExtraction> {
  const result = extractionSchema.safeParse(input);
  if (!result.success) return failed(result.error);
  const data = result.data;
  const issues: ValidationIssue[] = [];
  const rowIds = new Set<string>();
  for (const row of data.rows) {
    if (rowIds.has(row.id)) issues.push({ path: row.id, message: 'Duplicate extracted row ID' });
    rowIds.add(row.id);
    if (row.sourceId !== data.source.id)
      issues.push({ path: row.id, message: 'Row source does not match its extraction document' });
    if (data.source.kind === 'pdf' && row.page > data.source.pageCount)
      issues.push({ path: row.id, message: 'Source page exceeds PDF page count' });
  }
  const pages = new Set<number>();
  for (const page of data.pages) {
    if (pages.has(page.page))
      issues.push({ path: `pages.${page.page}`, message: 'Duplicate page audit' });
    pages.add(page.page);
    const rows = data.rows.filter((row) => row.page === page.page);
    if (rows.length !== page.importedRows)
      issues.push({
        path: `pages.${page.page}`,
        message: 'Audited imported row count differs from extracted rows',
      });
    if (page.detectedRows < page.importedRows)
      issues.push({
        path: `pages.${page.page}`,
        message: 'Imported count exceeds detected row count',
      });
    if (page.detectedRows > page.importedRows && page.exceptions.length === 0)
      issues.push({
        path: `pages.${page.page}`,
        message: 'Unimported detected rows need explicit review exceptions',
      });
    for (const rowId of page.reviewRowIds)
      if (!rows.some((row) => row.id === rowId))
        issues.push({
          path: `pages.${page.page}`,
          message: `Review row is absent from this page: ${rowId}`,
        });
  }
  for (const row of data.rows)
    if (!pages.has(row.page))
      issues.push({ path: row.id, message: 'Extracted row has no source page audit' });
  if (data.source.kind === 'pdf')
    for (let page = 1; page <= data.source.pageCount; page++) {
      if (!pages.has(page))
        issues.push({
          path: 'pages',
          message: `PDF page ${page} needs an audit, including explicit exceptions if unprocessed`,
        });
    }
  return issues.length ? { success: false, issues } : { success: true, issues: [], data };
}

export function validateReviewPatchSet(input: unknown): ValidationResult<ReviewPatchSet> {
  const result = reviewPatchSetSchema.safeParse(input);
  return result.success ? { success: true, issues: [], data: result.data } : failed(result.error);
}

export function validateOemDatabase(input: unknown): ValidationResult<OemDatabase> {
  const result = databaseSchema.safeParse(input);
  if (!result.success) return failed(result.error);
  const data = result.data;
  const issues: ValidationIssue[] = [];
  for (const field of [
    'sources',
    'sourceRows',
    'parts',
    'assemblies',
    'occurrences',
    'variants',
    'conflicts',
  ] as const) {
    const ids = new Set<string>();
    for (const item of data[field]) {
      if (ids.has(item.id))
        issues.push({ path: `${field}.${item.id}`, message: 'Duplicate identifier' });
      ids.add(item.id);
    }
  }
  const rows = new Map(data.sourceRows.map((row) => [row.id, row]));
  const parts = new Map(data.parts.map((part) => [part.id, part]));
  const sources = new Set(data.sources.map((source) => source.id));
  const assemblies = new Set(data.assemblies.map((assembly) => assembly.id));
  const variants = new Map(data.variants.map((variant) => [variant.id, variant]));
  const occurrences = new Map(data.occurrences.map((occurrence) => [occurrence.id, occurrence]));
  const seenRows = new Set<string>();
  const numbers = new Map<string, string>();
  for (const part of data.parts) {
    if (part.oemNumber !== null) {
      if (numbers.has(part.oemNumber))
        issues.push({
          path: `parts.${part.id}`,
          message: `Unintended duplicate exact OEM identity: ${part.oemNumber}`,
        });
      numbers.set(part.oemNumber, part.id);
    }
    for (const rowId of part.sourceRowIds) {
      const row = rows.get(rowId);
      if (!row) issues.push({ path: `parts.${part.id}`, message: `Missing source row ${rowId}` });
      else if (row.oemNumber !== part.oemNumber)
        issues.push({
          path: `parts.${part.id}`,
          message: 'Part OEM identity differs from original source characters',
        });
    }
  }
  for (const occurrence of data.occurrences) {
    const row = rows.get(occurrence.sourceRowId);
    const part = parts.get(occurrence.partId);
    if (
      !row ||
      !part ||
      !sources.has(occurrence.sourceId) ||
      !assemblies.has(occurrence.assemblyId)
    ) {
      issues.push({
        path: `occurrences.${occurrence.id}`,
        message: 'Missing source row, part, source or assembly relationship',
      });
      continue;
    }
    if (seenRows.has(row.id))
      issues.push({ path: row.id, message: 'One source row must have exactly one occurrence' });
    seenRows.add(row.id);
    if (row.sourceId !== occurrence.sourceId || !part.sourceRowIds.includes(row.id))
      issues.push({ path: occurrence.id, message: 'Occurrence provenance is inconsistent' });
    if (row.quantity !== occurrence.quantity)
      issues.push({
        path: occurrence.id,
        message:
          'Occurrence quantity differs from its callout; use explicit review patches for corrections',
      });
    for (const variantId of occurrence.variantIds)
      if (!variants.has(variantId))
        issues.push({ path: occurrence.id, message: `Missing model variant ${variantId}` });
    const variantYears = [
      ...new Set(
        occurrence.variantIds.flatMap((variantId) => variants.get(variantId)?.years ?? []),
      ),
    ].sort();
    if (variantYears.join(',') !== [...new Set(row.modelYears)].sort().join(','))
      issues.push({
        path: occurrence.id,
        message: 'Model variant years must preserve exactly the row-level source claim',
      });
  }
  for (const row of data.sourceRows)
    if (!seenRows.has(row.id))
      issues.push({ path: row.id, message: 'Extracted callout is missing its catalog occurrence' });
  for (const assembly of data.assemblies) {
    if (assembly.parentId !== 'lbx')
      issues.push({
        path: assembly.id,
        message:
          'Source figure groups must remain directly under the motorcycle; physical nesting requires additional evidence',
      });
    for (const figure of assembly.sourceFigures)
      if (!sources.has(figure.sourceId))
        issues.push({ path: assembly.id, message: 'Assembly figure references a missing source' });
  }
  for (const conflict of data.conflicts) {
    for (const occurrenceId of conflict.occurrenceIds)
      if (!occurrences.has(occurrenceId))
        issues.push({ path: conflict.id, message: 'Conflict references a missing occurrence' });
    for (const partId of conflict.partIds)
      if (!parts.has(partId))
        issues.push({
          path: conflict.id,
          message: 'Conflict references a missing catalog identity',
        });
    for (const claim of conflict.claims)
      if (!conflict.occurrenceIds.includes(claim.occurrenceId))
        issues.push({
          path: conflict.id,
          message: 'Conflict claim is not associated with its occurrence list',
        });
  }
  for (const relationship of data.relationships) {
    if (!parts.has(relationship.fromPartId) || !parts.has(relationship.toPartId))
      issues.push({
        path: 'relationships',
        message: 'Part relationship references a missing identity',
      });
    if (relationship.fromPartId === relationship.toPartId)
      issues.push({
        path: 'relationships',
        message: 'A part relationship must connect two distinct identities',
      });
    if (!relationship.sourceRowIds.length || relationship.sourceRowIds.some((id) => !rows.has(id)))
      issues.push({
        path: 'relationships',
        message: 'Part relationships require existing source evidence',
      });
    if (
      relationship.kind === 'confirmed-interchangeable' &&
      !['source-checked', 'mechanically-verified'].includes(relationship.reviewStatus)
    )
      issues.push({
        path: 'relationships',
        message: 'Confirmed interchangeability requires reviewed source evidence',
      });
  }
  const reviewed = new Set<string>();
  for (const patch of data.reviewPatches) {
    if (reviewed.has(patch.occurrenceId))
      issues.push({
        path: 'reviewPatches',
        message: `Duplicate review override for ${patch.occurrenceId}`,
      });
    reviewed.add(patch.occurrenceId);
    if (!occurrences.has(patch.occurrenceId))
      issues.push({ path: 'reviewPatches', message: `Unknown occurrence ${patch.occurrenceId}` });
    if (patch.assemblyId && !assemblies.has(patch.assemblyId))
      issues.push({ path: 'reviewPatches', message: `Unknown assembly ${patch.assemblyId}` });
  }
  for (const source of data.sources) {
    const audit = data.sourceAudits.find((item) => item.sourceId === source.id);
    if (!audit) issues.push({ path: source.id, message: 'Missing source coverage audit' });
    else {
      const extraction = validateExtraction({
        version: 1,
        source,
        rows: data.sourceRows.filter((row) => row.sourceId === source.id),
        pages: audit.pages,
        notes: audit.notes,
      });
      if (!extraction.success)
        issues.push(
          ...extraction.issues.map((issue) => ({
            path: `${source.id}.${issue.path}`,
            message: issue.message,
          })),
        );
    }
  }
  return issues.length ? { success: false, issues } : { success: true, issues: [], data };
}
