export type ApiError = { field: string; message: string };

/**
 * Returns a map of { fieldName: errorMessage } for showing validation errors under inputs.
 * Example: fieldErrors.email → "Invalid email format"
 */
export function mapFieldErrors(errors: ApiError[]): Record<string, string> {
  return (errors ?? []).reduce(
    (acc, err) => {
      acc[err.field] = err.message;
      return acc;
    },
    {} as Record<string, string>
  );
}
