// React Native's fetch/FormData Blob path is not consistent for local file uploads.
// Use Expo FileSystem's native multipart uploader for saved recordings.
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

type NativeUploadResponse = { body: string; status: number; headers: Record<string, string> };
type NativeUploadFile = {
  exists: boolean;
  size: number;
  upload(url: string, options: {
    fieldName: string;
    mimeType: string;
    parameters: Record<string, string>;
    signal?: AbortSignal;
  }): Promise<NativeUploadResponse>;
};

export function createProcessingTransport(
  endpointUrl: (path: string) => string,
  fetchRequest: typeof fetch = fetch,
  openUploadFile: (uri: string) => Promise<NativeUploadFile> = async uri => {
    const { File, UploadType } = await import('expo-file-system');
    const file = new File(uri);
    return {
      exists: file.exists,
      size: file.size,
      upload: (url, options) => file.upload(url, { ...options, httpMethod: 'POST', uploadType: UploadType.MULTIPART }),
    };
  },
) {
  return {
    async postVoice(input: { uri: string; mimeType: string; filename: string; sourceLanguage: string; targetLanguage: string; onResponse?: () => void }, signal?: AbortSignal): Promise<Response> {
      if (!input.uri.startsWith('file://') || !/^audio\/[a-zA-Z0-9.+-]+$/.test(input.mimeType) ||
          !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(input.filename)) throw new Error('Invalid native recording metadata.');
      const sourceFile = await openUploadFile(input.uri);
      if (!sourceFile.exists || sourceFile.size <= 0) throw new Error('Recording is missing or empty.');
      if (sourceFile.size > 3_000_000) throw new Error('Recording exceeds the 3 MB mobile upload limit. Record a shorter message.');
      const uploaded = await sourceFile.upload(endpointUrl('/chat/messages/voice'), {
        fieldName: 'sourceAudio',
        mimeType: input.mimeType,
        parameters: { sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage },
        signal,
      });
      input.onResponse?.();
      const response = new Response(uploaded.body, { status: uploaded.status, headers: uploaded.headers });
      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try { const error = await response.json(); if (typeof error?.error === 'string' && error.error.trim()) message = error.error; } catch { /* Safe proxy fallback. */ }
        throw new ProcessingApiError(response.status, message);
      }
      return response;
    },
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
