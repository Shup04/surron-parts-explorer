import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildOemDatabase } from '../../src/oem/reconcile';
import { validateExtraction, validateOemDatabase } from '../../src/oem/validation';
import { buildCoverageReport, coverageMarkdown } from '../../src/oem/coverage';
import { toExplorerCatalog } from '../../src/oem/adapter';
import { validateCatalog } from '../../src/core/catalog';
import type { SourceExtraction } from '../../src/oem/source-types';

async function main() {
  const inputDirectory = path.resolve(process.argv[2] ?? 'data/oem/extracted');
  const outputDirectory = path.resolve(process.argv[3] ?? 'data/oem');
  const files = (await readdir(inputDirectory)).filter((file) => file.endsWith('.json')).sort();
  if (!files.length) throw new Error(`No extraction JSON files in ${inputDirectory}`);
  const extractions: SourceExtraction[] = [];
  for (const file of files) {
    const parsed = validateExtraction(
      JSON.parse(await readFile(path.join(inputDirectory, file), 'utf8')),
    );
    if (!parsed.success)
      throw new Error(
        `${file}:\n${parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n')}`,
      );
    extractions.push(parsed.data);
  }
  const database = buildOemDatabase(extractions);
  const result = validateOemDatabase(database);
  if (!result.success)
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  const explorer = validateCatalog(toExplorerCatalog(database));
  if (!explorer.success)
    throw new Error(explorer.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, 'catalog.json'),
    JSON.stringify(database, null, 2) + '\n',
  );
  const report = buildCoverageReport(database);
  await writeFile(
    path.join(outputDirectory, 'coverage.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await writeFile(path.join(outputDirectory, 'report.md'), coverageMarkdown(database));
  console.log(JSON.stringify(report.totals, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
