import type { Catalog, MappingConfig } from '@/core/types';
import { validateCatalog } from '@/core/catalog';
import { validateMapping } from '@/core/mapping';

export interface EditorProject {
  version: 1;
  catalog: Catalog;
  mapping: MappingConfig;
  assetFileName: string | null;
}

export const PROJECT_STORAGE_KEY = 'surron-editor-project';
const DATABASE = 'surron-model-workspace';
const FILES = 'model-files';
type StoredFile = { name: string; path: string; blob: Blob };
export type LocalAsset = { url: string; dispose: () => void };

export function parseEditorProject(value: unknown): EditorProject {
  if (!value || typeof value !== 'object') throw new Error('Expected a project JSON object.');
  const project = value as Record<string, unknown>;
  if (project.version !== 1) throw new Error('Unsupported project version. Expected version 1.');
  const catalog = validateCatalog(project.catalog);
  if (!catalog.success || !catalog.data)
    throw new Error(
      `Invalid catalog: ${catalog.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  const mapping = validateMapping(project.mapping, catalog.data);
  if (!mapping.success || !mapping.data)
    throw new Error(
      `Invalid mapping: ${mapping.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
    );
  if (project.assetFileName !== null && typeof project.assetFileName !== 'string')
    throw new Error('assetFileName must be a filename or null.');
  return {
    version: 1,
    catalog: catalog.data,
    mapping: mapping.data,
    assetFileName: project.assetFileName,
  };
}

export function loadEditorProject(): EditorProject | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem(PROJECT_STORAGE_KEY);
  return saved ? parseEditorProject(JSON.parse(saved)) : null;
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(
        new Error(
          'This browser does not support local model storage. Export your project JSON to preserve your work.',
        ),
      );
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FILES);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Cannot open local model storage.'));
    request.onblocked = () =>
      reject(new Error('Local model storage is blocked by another browser tab.'));
  });
}

async function storeFiles(files: File[]): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(FILES, 'readwrite');
      transaction.objectStore(FILES).put(
        files.map((file) => ({
          name: file.name,
          path: file.webkitRelativePath || file.name,
          blob: file,
        })),
        'current',
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error('Model storage failed. Browser storage may be full.'),
        );
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Model storage was interrupted.'));
    });
  } finally {
    db.close();
  }
}

export async function saveEditorProject(project: EditorProject, files?: File[]): Promise<void> {
  parseEditorProject(project);
  if (files) await storeFiles(files);
  localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
}

function normalizedPath(path: string): string {
  const parts: string[] = [];
  for (const piece of decodeURIComponent(path).replaceAll('\\', '/').split('/')) {
    if (piece === '..') parts.pop();
    else if (piece && piece !== '.') parts.push(piece);
  }
  return parts.join('/');
}

/** Rewrites glTF companion URIs only. Geometry, matrices, origins, and units stay untouched. */
export async function materializeModel(
  files: StoredFile[],
  primaryName: string,
): Promise<LocalAsset> {
  const primary =
    files.find((file) => file.path === primaryName) ??
    files.find((file) => file.name === primaryName);
  if (!primary)
    throw new Error(`Model file ${primaryName} is missing. Import it with its companion files.`);
  const urls: string[] = [];
  const objectURL = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.push(url);
    return url;
  };
  const dispose = () => urls.forEach((url) => URL.revokeObjectURL(url));
  try {
    if (/\.glb$/i.test(primaryName)) return { url: objectURL(primary.blob), dispose };
    if (!/\.gltf$/i.test(primaryName)) throw new Error('Select a .glb or .gltf model.');
    const gltf = JSON.parse(await primary.blob.text()) as {
      buffers?: { uri?: string }[];
      images?: { uri?: string }[];
      asset?: { version?: string };
    };
    if (gltf.asset?.version !== '2.0') throw new Error('Only glTF 2.0 assets are supported.');
    const folder = primary.path.includes('/')
      ? primary.path.slice(0, primary.path.lastIndexOf('/') + 1)
      : '';
    for (const resource of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
      if (!resource.uri || resource.uri.startsWith('data:')) continue;
      if (/^[a-z]+:/i.test(resource.uri) || resource.uri.startsWith('//'))
        throw new Error(
          `External resource ${resource.uri} must be supplied as a local companion file.`,
        );
      const requested = normalizedPath(`${folder}${resource.uri}`);
      const exact = files.filter((file) => normalizedPath(file.path) === requested);
      const matches = exact.length
        ? exact
        : files.filter((file) => file.name === requested.split('/').at(-1));
      if (matches.length !== 1)
        throw new Error(
          `${matches.length ? 'Ambiguous' : 'Missing'} companion file: ${resource.uri}. Import the model and all .bin / texture files together.`,
        );
      resource.uri = objectURL(matches[0].blob);
    }
    return {
      url: objectURL(new Blob([JSON.stringify(gltf)], { type: 'model/gltf+json' })),
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function materializeFiles(files: File[], primaryName: string): Promise<LocalAsset> {
  return materializeModel(
    files.map((file) => ({
      name: file.name,
      path: file.webkitRelativePath || file.name,
      blob: file,
    })),
    primaryName,
  );
}

export async function loadSavedEditorAsset(): Promise<LocalAsset | null> {
  const project = loadEditorProject();
  if (!project?.assetFileName) return null;
  const db = await database();
  try {
    const files = await new Promise<StoredFile[]>((resolve, reject) => {
      const request = db.transaction(FILES, 'readonly').objectStore(FILES).get('current');
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error ?? new Error('Cannot read saved model files.'));
    });
    return await materializeModel(files, project.assetFileName);
  } finally {
    db.close();
  }
}

export function downloadJSON(value: unknown, filename: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
