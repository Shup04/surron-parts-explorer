import type { OemDatabase, ReviewPatch, ReviewPatchSet } from './types';
import { validateOemDatabase, validateReviewPatchSet } from './validation';

export const REVIEW_STORAGE_KEY = 'surron-oem-review-v1';

/** Overlay review edits without rewriting source transcription or historical identity. */
export function applyReviewPatches(database: OemDatabase, input: unknown): OemDatabase {
  const result = validateReviewPatchSet(input);
  if (!result.success)
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  const ids = new Set(database.occurrences.map((occurrence) => occurrence.id));
  const assemblies = new Set(database.assemblies.map((assembly) => assembly.id));
  const patches = new Map<string, ReviewPatch>(
    database.reviewPatches.map((patch) => [patch.occurrenceId, patch]),
  );
  for (const patch of result.data.patches) {
    if (!ids.has(patch.occurrenceId))
      throw new Error(`Unknown occurrence in review patch: ${patch.occurrenceId}`);
    if (patch.assemblyId && !assemblies.has(patch.assemblyId))
      throw new Error(`Unknown assembly in review patch: ${patch.assemblyId}`);
    const previous = patches.get(patch.occurrenceId);
    patches.set(patch.occurrenceId, {
      ...previous,
      ...patch,
      note: patch.note || previous?.note || '',
    });
  }
  return { ...database, reviewPatches: [...patches.values()] };
}

export function exportReviewPatches(database: OemDatabase): ReviewPatchSet {
  return { version: 1, patches: database.reviewPatches };
}

export function exportOemDatabase(database: OemDatabase): string {
  const validation = validateOemDatabase(database);
  if (!validation.success)
    throw new Error(validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return JSON.stringify(database, null, 2) + '\n';
}

export function importOemDatabase(text: string): OemDatabase {
  const result = validateOemDatabase(JSON.parse(text));
  if (!result.success)
    throw new Error(result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return result.data;
}
