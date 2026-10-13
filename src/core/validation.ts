export interface ValidationIssue {
  path: string;
  message: string;
}
export type ValidationResult<T> =
  | { success: true; data: T; issues: [] }
  | { success: false; issues: ValidationIssue[]; data?: never };

export function failure<T>(issues: ValidationIssue[]): ValidationResult<T> {
  return { success: false, issues };
}
