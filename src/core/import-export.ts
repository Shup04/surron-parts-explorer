import type { Catalog, MappingConfig, Part } from './types';
import { validateCatalog } from './catalog';
import { validateMapping } from './mapping';
import type { ValidationIssue, ValidationResult } from './validation';

export function importCatalogJson(text: string): ValidationResult<Catalog> {
  try {
    return validateCatalog(JSON.parse(text));
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          path: '',
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Could not parse'}`,
        },
      ],
    };
  }
}
export function exportCatalogJson(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
export function importMappingJson(
  text: string,
  catalog?: Catalog,
): ValidationResult<MappingConfig> {
  try {
    return validateMapping(JSON.parse(text), catalog);
  } catch (error) {
    return {
      success: false,
      issues: [
        {
          path: '',
          message: `Invalid JSON: ${error instanceof Error ? error.message : 'Could not parse'}`,
        },
      ],
    };
  }
}
export function exportMappingJson(mapping: MappingConfig): string {
  return `${JSON.stringify(mapping, null, 2)}\n`;
}

const columns = [
  'catalogVersion',
  'motorcycleId',
  'id',
  'name',
  'description',
  'kind',
  'parentId',
  'oemNumber',
  'genericDesignation',
  'quantity',
  'material',
  'specifications',
  'dimensions',
  'compatibility',
  'sources',
  'verification',
  'images',
  'alternatives',
  'crossReferences',
] as const;
const structuredColumns = new Set([
  'specifications',
  'dimensions',
  'compatibility',
  'sources',
  'images',
  'alternatives',
  'crossReferences',
]);
const nullableColumns = new Set([
  'parentId',
  'oemNumber',
  'genericDesignation',
  'quantity',
  'material',
]);
const escapeCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

/** Complex fields remain JSON within CSV cells, preserving provenance and variants. */
export function exportCatalogCsv(catalog: Catalog): string {
  const rows = catalog.parts.map((part) =>
    columns.map((column) => {
      if (column === 'catalogVersion') return String(catalog.version);
      if (column === 'motorcycleId') return catalog.motorcycleId;
      const value = part[column];
      return structuredColumns.has(column)
        ? JSON.stringify(value)
        : value === null
          ? ''
          : String(value);
    }),
  );
  return [columns, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 quoted commas, escaped quotes and multiline source notes. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    value = '',
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(value);
    value = '';
    closed = false;
  };
  const line = () => {
    cell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        value += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else value += char;
    } else if (char === ',') cell();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      line();
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (closed || char === '"')
      throw new Error(`Unexpected character after a CSV quote near offset ${i}`);
    else value += char;
  }
  if (quoted) throw new Error('Unterminated quoted CSV cell');
  if (value || row.length || closed) line();
  return rows;
}

export function importCatalogCsv(text: string): ValidationResult<Catalog> {
  let rows: string[][];
  try {
    rows = parseCsv(text);
  } catch (error) {
    return {
      success: false,
      issues: [{ path: '', message: error instanceof Error ? error.message : 'Invalid CSV' }],
    };
  }
  const header = rows.shift();
  if (!header || !header.length)
    return { success: false, issues: [{ path: '', message: 'CSV is empty' }] };
  const issues: ValidationIssue[] = [];
  if (new Set(header).size !== header.length)
    issues.push({ path: 'header', message: 'Duplicate column names' });
  for (const column of columns)
    if (!header.includes(column))
      issues.push({ path: 'header', message: `Missing column: ${column}` });
  for (const column of header)
    if (!(columns as readonly string[]).includes(column))
      issues.push({ path: 'header', message: `Unknown column: ${column}` });
  if (issues.length) return { success: false, issues };
  let motorcycleId: string | undefined;
  const parts: unknown[] = [];
  rows.forEach((row, i) => {
    if (row.length === 1 && row[0] === '') return;
    if (row.length !== header.length) {
      issues.push({
        path: `row.${i + 2}`,
        message: `Expected ${header.length} cells, got ${row.length}`,
      });
      return;
    }
    const cells = Object.fromEntries(header.map((name, column) => [name, row[column]]));
    if (cells.catalogVersion !== '1')
      issues.push({
        path: `row.${i + 2}.catalogVersion`,
        message: 'Only catalog version 1 is supported',
      });
    if (motorcycleId === undefined) motorcycleId = cells.motorcycleId;
    else if (motorcycleId !== cells.motorcycleId)
      issues.push({
        path: `row.${i + 2}.motorcycleId`,
        message: 'Every row must identify the same motorcycle',
      });
    const part: Record<string, unknown> = {};
    for (const column of columns) {
      if (column === 'catalogVersion' || column === 'motorcycleId') continue;
      const value = cells[column];
      if (structuredColumns.has(column)) {
        try {
          part[column] = JSON.parse(value);
        } catch {
          issues.push({
            path: `row.${i + 2}.${column}`,
            message: 'Expected a JSON array or object in this cell',
          });
        }
      } else if (nullableColumns.has(column) && value === '') part[column] = null;
      else if (column === 'quantity') part[column] = Number(value);
      else part[column] = value;
    }
    parts.push(part);
  });
  return issues.length
    ? { success: false, issues }
    : validateCatalog({ version: 1, motorcycleId, parts });
}

export function createUnknownPart(
  id: string,
  name: string,
  parentId: string,
  kind: Part['kind'] = 'component',
): Part {
  return {
    id,
    name,
    parentId,
    kind,
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
