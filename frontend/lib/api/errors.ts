/**
 * Turn an error response body into a message that can be shown to a player.
 *
 * Shared by the auth client and the general API client, which previously each
 * carried their own copy of this logic.
 */
export function extractErrorMessage(body: string, status: number): string {
  const fallback = `Request failed: ${status}`;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return fallback;
  }
  if (typeof json !== 'object' || json === null) return fallback;

  const { detail, message, error } = json as Record<string, unknown>;

  // FastAPI returns validation failures (422) as an array of error objects,
  // unlike the app's own handled errors which return a plain string. Assigning
  // that array straight to the message renders as "[object Object]" and hides
  // the one thing the player needs: which field was wrong and why.
  if (Array.isArray(detail)) {
    const reasons = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (typeof item !== 'object' || item === null) return '';
        const { msg, loc } = item as { msg?: unknown; loc?: unknown };
        if (typeof msg !== 'string') return '';
        // Pydantic prefixes custom validator failures with "Value error, ".
        const reason = msg.replace(/^Value error,\s*/, '');
        // loc is like ["body", "password"]; the trailing entry is the field.
        const field = Array.isArray(loc) ? loc[loc.length - 1] : undefined;
        return typeof field === 'string' && field !== 'body'
          ? `${field}: ${reason}`
          : reason;
      })
      .filter(Boolean);
    if (reasons.length > 0) return reasons.join('; ');
  }

  for (const candidate of [detail, message, error]) {
    if (typeof candidate === 'string' && candidate) return candidate;
  }
  return fallback;
}
