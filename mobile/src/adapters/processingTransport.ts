// Fetch is supported by React Native; this module imports no browser components.
// Multipart native-URI uploads and response-to-durable-file decoding arrive in Step 6.
const PROCESSING_FIELDS = {
  '/chat/messages/text': ['text', 'sourceLanguage', 'targetLanguage'],
  '/speech/output': ['text', 'language', 'speechVoice'],
} as const;
export type ProcessingEndpoint = keyof typeof PROCESSING_FIELDS;
type Payloads = {
  '/chat/messages/text': { text: string; sourceLanguage: string; targetLanguage: string };
  '/speech/output': { text: string; language: string; speechVoice?: 'marin' | 'onyx' };
};

export class ProcessingApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProcessingApiError';
  }
}

export function createProcessingTransport(
  endpointUrl: (path: string) => string,
  fetchRequest: typeof fetch = fetch,
) {
  return {
    async post<E extends ProcessingEndpoint>(
      endpoint: E, input: Payloads[E], signal?: AbortSignal,
    ): Promise<Response> {
      if (!Object.hasOwn(PROCESSING_FIELDS, endpoint)) {
        throw new Error('Unsupported mobile processing endpoint.');
      }
      const body: Record<string, string> = {};
      for (const field of PROCESSING_FIELDS[endpoint]) {
        const value = (input as unknown as Record<string, unknown>)[field];
        if (value !== undefined) {
          if (typeof value !== 'string') throw new Error(`${field} must be a string.`);
          body[field] = value;
        }
      }
      const response = await fetchRequest(endpointUrl(endpoint), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal,
      });
      if (!response.ok) {
        // Non-JSON Express/proxy failures retain a safe status-based fallback.
        let message = `Request failed (${response.status}).`;
        try {
          const error = await response.json();
          if (typeof error?.error === 'string' && error.error.trim()) message = error.error;
        } catch { /* HTML/plain-text failure: keep fallback, never display markup. */ }
        throw new ProcessingApiError(response.status, message);
      }
      // Preserve JSON and binary WAV responses for endpoint-specific callers.
      return response;
    },
  };
}
