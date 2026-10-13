import { access, readFile } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import {
  inspectGltfDocument,
  parseGltfBytes,
  type ModelInspection,
} from '../src/core/model-validation';

export async function inspectModelFile(filename: string): Promise<ModelInspection> {
  const inspection = inspectGltfDocument(parseGltfBytes(await readFile(filename)));
  const baseDirectory = dirname(resolve(filename));
  for (const uri of inspection.resources) {
    if (/^[a-z][a-z\d+.-]*:/i.test(uri) || uri.startsWith('//')) {
      inspection.warnings.push(`External resource is not downloaded: ${uri}`);
      continue;
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(uri.split(/[?#]/)[0]);
    } catch {
      inspection.issues.push({ path: 'resources', message: `Malformed resource URI: ${uri}` });
      continue;
    }
    const target = resolve(baseDirectory, decoded);
    const rel = relative(baseDirectory, target);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      inspection.issues.push({
        path: 'resources',
        message: `Resource escapes the model directory: ${uri}`,
      });
      continue;
    }
    try {
      await access(target);
    } catch {
      inspection.issues.push({ path: 'resources', message: `Missing local asset: ${uri}` });
    }
  }
  return inspection;
}
