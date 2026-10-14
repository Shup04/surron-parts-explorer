import type { OemDatabase, SourceCoverage } from './types';

export function buildCoverageReport(database: OemDatabase) {
  const sources: SourceCoverage[] = database.sources.map((source) => {
    const occurrences = database.occurrences.filter(
      (occurrence) => occurrence.sourceId === source.id,
    );
    const rows = database.sourceRows.filter((row) => row.sourceId === source.id);
    const audits = database.sourceAudits.find((audit) => audit.sourceId === source.id)?.pages ?? [];
    const partIds = new Set(occurrences.map((occurrence) => occurrence.partId));
    const mappedPartIds = new Set(
      occurrences
        .filter((occurrence) => occurrence.geometryMappingIds.length)
        .map((occurrence) => occurrence.partId),
    );
    const occurrenceIds = new Set(occurrences.map((occurrence) => occurrence.id));
    const issues: string[] = [];
    if (audits.length !== source.pageCount)
      issues.push(`${source.pageCount - audits.length} source pages lack an audit.`);
    for (const page of audits) {
      if (page.detectedRows !== page.importedRows)
        issues.push(
          `Page ${page.page}: ${page.detectedRows} detected rows, ${page.importedRows} imported rows; see explicit exceptions.`,
        );
      for (const exception of page.exceptions)
        issues.push(
          `Page ${page.page}${exception.callout ? `, callout ${exception.callout}` : ''}: ${exception.reason} Evidence: ${exception.evidence}`,
        );
    }
    return {
      sourceId: source.id,
      title: source.title,
      kind: source.kind,
      pageCount: source.pageCount,
      pagesProcessed: audits.length,
      pagesVisuallyInspected: audits.filter((page) => page.visualStatus === 'inspected').length,
      figuresIdentified: new Set(audits.flatMap((page) => page.figures)).size,
      tableRowsDetected: audits.reduce((sum, page) => sum + page.detectedRows, 0),
      importedRecords: occurrences.length,
      requiringReview: occurrences.filter(
        (occurrence) =>
          !['source-checked', 'mechanically-verified'].includes(occurrence.reviewStatus),
      ).length,
      conflicts: database.conflicts.filter((conflict) =>
        conflict.occurrenceIds.some((id) => occurrenceIds.has(id)),
      ).length,
      explicitExceptions: audits.reduce((sum, page) => sum + page.exceptions.length, 0),
      mappedCatalogParts: mappedPartIds.size,
      awaitingMappingCatalogParts: [...partIds].filter((id) => !mappedPartIds.has(id)).length,
      catalogParts: partIds.size,
      missingOemNumbers: rows.filter((row) => row.oemNumber === null).length,
      missingQuantities: rows.filter((row) => row.quantity === null).length,
      issues,
    };
  });
  const mapped = new Set(
    database.occurrences
      .filter((occurrence) => occurrence.geometryMappingIds.length)
      .map((occurrence) => occurrence.partId),
  );
  return {
    version: 1 as const,
    totals: {
      sourceDocuments: database.sources.length,
      pdfDocuments: database.sources.filter((source) => source.kind === 'pdf').length,
      sourceRows: database.sourceRows.length,
      importedOccurrences: database.occurrences.length,
      distinctCatalogParts: database.parts.length,
      assemblyGroups: database.assemblies.length,
      conflicts: database.conflicts.length,
      mappedCatalogParts: mapped.size,
      awaitingMappingCatalogParts: database.parts.length - mapped.size,
    },
    sources,
    limitations: [
      'Coverage describes the supplied source snapshots, not every factory part or every motorcycle model year.',
      'Review counts include every source record not explicitly checked by a reviewer; extraction confidence does not establish mechanical correctness.',
      'Description and dimensions discrepancies are review candidates, including terminology, format and variant differences, not confirmed defects.',
      'Historical figure occurrences and commercial assemblies overlap. Source quantities must not be summed across documents or assembly/component rows.',
      'A source year label is retained as a source claim. No cross-year fitment, supersession or interchangeability is inferred.',
      'All extracted source records await accurate 3D mappings. Demonstration geometry does not count as a catalog mapping.',
    ],
  };
}

export function coverageMarkdown(database: OemDatabase): string {
  const report = buildCoverageReport(database);
  const lines = [
    '# OEM catalog source coverage',
    '',
    `Generated deterministically from ${report.totals.sourceDocuments} source snapshots. ${report.totals.sourceRows} extracted rows → ${report.totals.importedOccurrences} occurrences → ${report.totals.distinctCatalogParts} exact catalog identities in ${report.totals.assemblyGroups} source figure groups.`,
    '',
    'Identities share an exact OEM string; rows with no number retain separate identities. Source callouts and per-assembly quantities belong to occurrences. No source record has been discarded for missing data.',
    '',
    '| Source | Pages processed / source | Visually inspected | Figures | Rows detected | Imported | Need review | Discrepancy groups | Explicit exceptions | Mapped parts | Awaiting mapping |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.sources.map(
      (source) =>
        `| ${source.title.replaceAll('|', '\\|')} | ${source.pagesProcessed}/${source.pageCount} | ${source.pagesVisuallyInspected} | ${source.figuresIdentified} | ${source.tableRowsDetected} | ${source.importedRecords} | ${source.requiringReview} | ${source.conflicts} | ${source.explicitExceptions} | ${source.mappedCatalogParts} | ${source.awaitingMappingCatalogParts} |`,
    ),
    '',
    'Per-source catalog identity counts overlap. Global counts: ' +
      `${report.totals.mappedCatalogParts} mapped, ${report.totals.awaitingMappingCatalogParts} awaiting mapping, ${report.totals.conflicts} distinct discrepancy groups.`,
    '',
    '## Limits of this audit',
    '',
    ...report.limitations.map((note) => `- ${note}`),
    '',
    '## Source exceptions and extraction notes',
    '',
  ];
  for (const source of report.sources) {
    const document = database.sources.find((item) => item.id === source.sourceId)!;
    const audit = database.sourceAudits.find((item) => item.sourceId === source.sourceId)!;
    lines.push(
      `### ${source.title}`,
      '',
      `Reference: ${document.url}`,
      '',
      `Missing OEM numbers: ${source.missingOemNumbers}; missing quantities: ${source.missingQuantities}.`,
      '',
      document.applicabilityNotes,
      '',
    );
    for (const issue of source.issues) lines.push(`- ${issue}`);
    for (const note of audit.notes) lines.push(`- ${note}`);
    for (const page of audit.pages)
      if (page.notes.length) lines.push(`- Page ${page.page}: ${page.notes.join(' ')}`);
    lines.push('');
  }
  lines.push(
    '## Assembly groups',
    '',
    '| ID | Source group label | Occurrences |',
    '| --- | --- | ---: |',
  );
  for (const assembly of database.assemblies)
    lines.push(
      `| ${assembly.id} | ${assembly.name.replaceAll('|', '\\|')} | ${database.occurrences.filter((occurrence) => occurrence.assemblyId === assembly.id).length} |`,
    );
  lines.push(
    '',
    'Complete per-row provenance, source claims, exact character strings, review flags and conflicts are exported in `catalog.json`; the human review interface opens each original source page without publishing PDFs.',
    '',
  );
  return lines.join('\n');
}
