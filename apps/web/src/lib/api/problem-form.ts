import type { ProblemFieldError } from '@investfund/shared';

import { isApiError } from './client';

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

export interface ApplyProblemOptions<Values extends FieldValues> {
  /**
   * Form fields that may receive errors. Errors for other paths are returned in `unmatched`.
   * Defaults to every request-body path.
   */
  fields?: readonly Path<Values>[] | undefined;
}

export interface ApplyProblemResult {
  /** Field names that received an error, in response order. */
  applied: string[];
  /** Errors that do not belong to a form field: show them in a summary or toast. */
  unmatched: ProblemFieldError[];
}

const NON_BODY_LOCATIONS = ['query', 'params', 'headers', 'cookies'];

/**
 * Form field name for a problem `errors[].path`: `body.email` and `email` both map to `email`,
 * `body.items.0.name` to `items.0.name` (React Hook Form dot notation). Paths for the query
 * string, route params or headers, and whole-body errors, have no field.
 */
export function fieldNameFromProblemPath(path: string): string | undefined {
  const segments = path.split('.').filter((segment) => segment !== '');
  const [first] = segments;
  if (first === undefined || NON_BODY_LOCATIONS.includes(first)) return undefined;
  const field = first === 'body' ? segments.slice(1) : segments;
  return field.length > 0 ? field.join('.') : undefined;
}

/**
 * Puts the field errors of a problem+json response on a React Hook Form instance and focuses the
 * first affected field. The messages come from the API and are safe to display (docs/API.md §2).
 * Only the first error per field is shown. Anything that is not an {@link ApiError} with field
 * errors is ignored and reported back as nothing applied.
 */
export function applyProblemToForm<Values extends FieldValues>(
  error: unknown,
  form: { setError: UseFormSetError<Values> },
  options: ApplyProblemOptions<Values> = {},
): ApplyProblemResult {
  const result: ApplyProblemResult = { applied: [], unmatched: [] };
  if (!isApiError(error)) return result;

  const allowed = options.fields === undefined ? undefined : new Set<string>(options.fields);
  for (const fieldError of error.fieldErrors) {
    const name = fieldNameFromProblemPath(fieldError.path);
    if (name === undefined || (allowed !== undefined && !allowed.has(name))) {
      result.unmatched.push(fieldError);
      continue;
    }
    if (result.applied.includes(name)) continue;

    // `name` is a body path the caller's form is expected to declare (or one of `fields`).
    form.setError(
      name as Path<Values>,
      { type: fieldError.code, message: fieldError.message },
      { shouldFocus: result.applied.length === 0 },
    );
    result.applied.push(name);
  }
  return result;
}
