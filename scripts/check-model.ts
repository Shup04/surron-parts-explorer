import { readFile } from 'node:fs/promises';
import { importCatalogJson, importMappingJson } from '../src/core/import-export';
import { classifyObjects, validateMapping } from '../src/core/mapping';
import { inspectModelFile } from './model-tools';

async function main() {
  const args = process.argv.slice(2);
  const filename = args[0];
  if (!filename || filename.startsWith('--'))
    throw new Error(
      'Usage: npm run model:check -- model.glb [--mapping mapping.json] [--catalog catalog.json] [--json]',
    );
  const flag = (name: string) => {
    const index = args.indexOf(name);
    if (index < 0) return null;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
    return value;
  };
  const mappingFile = flag('--mapping'),
    catalogFile = flag('--catalog');
  const inspection = await inspectModelFile(filename);
  const catalog = catalogFile ? importCatalogJson(await readFile(catalogFile, 'utf8')) : undefined;
  if (catalog && !catalog.success)
    throw new Error(catalog.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  let mapped: ReturnType<typeof classifyObjects> | undefined;
  if (mappingFile) {
    const mapping = importMappingJson(await readFile(mappingFile, 'utf8'), catalog?.data);
    if (!mapping.success) inspection.issues.push(...mapping.issues);
    else {
      const validation = validateMapping(mapping.data, catalog?.data, inspection.objects);
      inspection.issues.push(...validation.issues);
      mapped = classifyObjects(inspection.objects, mapping.data, catalog?.data, true);
    }
  }
  if (args.includes('--json'))
    console.log(JSON.stringify({ ...inspection, mapping: mapped }, null, 2));
  else {
    console.log(
      `${filename}: ${inspection.objects.length} scene nodes, ${inspection.meshCount} mesh nodes; convention: metres, Y-up`,
    );
    if (inspection.extensionsRequired.length)
      console.log(`Required extensions: ${inspection.extensionsRequired.join(', ')}`);
    console.table(
      inspection.objects.map((object) => ({
        key: object.key,
        name: object.name || '(unnamed)',
        mesh: object.mesh,
        mapping: mapped?.find((entry) => entry.object.key === object.key)?.status ?? 'not checked',
      })),
    );
    for (const warning of inspection.warnings) console.warn(`Warning: ${warning}`);
    for (const issue of inspection.issues) console.error(`Error (${issue.path}): ${issue.message}`);
    if (mapped)
      console.log(
        `Mapping: ${mapped.filter((item) => item.status === 'mapped').length} mapped, ${mapped.filter((item) => item.status === 'unmapped').length} unmapped, ${mapped.filter((item) => item.status === 'ambiguous').length} ambiguous`,
      );
  }
  if (inspection.issues.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
