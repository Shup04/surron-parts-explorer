import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import {
  importCatalogCsv,
  importCatalogJson,
  exportCatalogCsv,
  exportCatalogJson,
} from '../src/core/import-export';

async function main() {
  const [command, filename, output] = process.argv.slice(2);
  if (!filename || !['validate', 'convert'].includes(command))
    throw new Error(
      'Usage: npm run catalog -- validate catalog.json|csv\n       npm run catalog -- convert input.json|csv output.json|csv',
    );
  const text = await readFile(filename, 'utf8');
  const result =
    extname(filename).toLowerCase() === '.csv' ? importCatalogCsv(text) : importCatalogJson(text);
  if (!result.success) {
    for (const issue of result.issues)
      console.error(`${issue.path || 'catalog'}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  if (command === 'convert') {
    if (!output || !['.json', '.csv'].includes(extname(output).toLowerCase()))
      throw new Error('Specify an output file ending in .json or .csv');
    if (resolve(filename) === resolve(output))
      throw new Error('Choose a different output path to preserve the source');
    const serialized =
      extname(output).toLowerCase() === '.csv'
        ? exportCatalogCsv(result.data)
        : exportCatalogJson(result.data);
    await writeFile(output, serialized, { flag: 'wx' });
    console.log(`Exported ${result.data.parts.length} catalog records to ${output}`);
  } else
    console.log(
      `Valid version ${result.data.version} catalog: ${result.data.motorcycleId}, ${result.data.parts.length} records`,
    );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
