/** Turn an axios error into a message a user can act on. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.response) {
    const apiError = error.response.data?.error;
    if (apiError?.details?.length) {
      const first = apiError.details[0];
      return first.message || apiError.message || fallback;
    }
    if (apiError?.message) return apiError.message;
    if (error.response.status === 429) return 'Too many requests. Please wait a moment.';
    if (error.response.status >= 500) return 'The server had a problem. Please try again.';
    return fallback;
  }
  if (error.code === 'ECONNABORTED') return 'The request timed out. AI generation can be slow on local models — please try again.';
  if (error.request) return 'Cannot reach the PrepAI server. Check that the backend is running.';
  return error.message || fallback;
}

export function getErrorCode(error) {
  return error?.response?.data?.error?.code || null;
}

/** Field-level validation errors keyed by field name. */
export function getFieldErrors(error) {
  const details = error?.response?.data?.error?.details || [];
  const out = {};
  for (const d of details) {
    const key = String(d.field || '').split('.').pop();
    if (key && !out[key]) out[key] = d.message;
  }
  return out;
}

export const isAiUnavailable = (error) =>
  ['AI_PROVIDER_UNAVAILABLE', 'AI_SERVICE_UNAVAILABLE', 'AI_TIMEOUT'].includes(getErrorCode(error));
