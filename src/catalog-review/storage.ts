import type { OemDatabase, ReviewPatchSet } from '@/oem/types';
import { validateReviewPatchSet } from '@/oem/validation';
import { applyReviewPatches } from '@/oem/review';

export const REVIEW_STORAGE_KEY = 'surron-oem-review-v1';
export function loadReviewPatches(): ReviewPatchSet {
  const text = localStorage.getItem(REVIEW_STORAGE_KEY);
  if (!text) return { version: 1, patches: [] };
  const result = validateReviewPatchSet(JSON.parse(text));
  if (!result.success)
    throw new Error(
      `Saved review is invalid: ${result.issues.map((issue) => issue.message).join('; ')}`,
    );
  return result.data;
}
export function saveReviewPatches(database: OemDatabase, patches: ReviewPatchSet) {
  applyReviewPatches(database, patches);
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(patches));
}
export function downloadCatalog(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
