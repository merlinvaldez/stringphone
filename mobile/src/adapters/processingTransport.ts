// React Native's fetch/FormData Blob path is not consistent for local file uploads.
// Use Expo FileSystem's native multipart uploader for saved recordings.
const PROCESSING_FIELDS = {
  '/chat/messages/text': ['text', 'sourceLanguage', 'targetLanguage'],
  '/speech/output': ['text', 'language', 'speechVoice', 'clonedVoiceId', 'clonedVoiceReferenceAudio', 'pronunciationText'],
} as const;
export type ProcessingEndpoint = keyof typeof PROCESSING_FIELDS;
type Payloads = {
  '/chat/messages/text': { text: string; sourceLanguage: string; targetLanguage: string };
  '/speech/output': { text: string; language: string; speechVoice?: 'marin' | 'onyx'; clonedVoiceId?: string; clonedVoiceReferenceAudio?: string; pronunciationText?: string };
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
    async postLiveListenChunk(
      input: {
        uri: string;
        mimeType: string;
        filename: string;
        listenerLanguage: string;
        theirLanguage?: string;
        chunkId?: string;
        isPreview?: boolean;
        contextBias?: string[];
        onResponse?: () => void;
      },
      signal?: AbortSignal,
    ): Promise<Response> {
      if (
        !input.uri.startsWith('file://') ||
        !/^audio\/[a-zA-Z0-9.+-]+$/.test(input.mimeType) ||
        !/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(input.filename) ||
        typeof input.listenerLanguage !== 'string' ||
        !input.listenerLanguage.trim()
      ) {
        throw new Error('Invalid native live-listen recording metadata.');
      }
      const sourceFile = await openUploadFile(input.uri);
      if (!sourceFile.exists || sourceFile.size <= 0) {
        throw new Error('Live recording chunk is missing or empty.');
      }
      if (sourceFile.size > 3_000_000) {
        throw new Error('Live recording chunk exceeds the 3 MB mobile upload limit.');
      }
      // Explicitly allowlist only stateless audio processing fields; never send conversationId or userId.
      const parameters: Record<string, string> = {
        listenerLanguage: input.listenerLanguage.trim(),
        isPreview: input.isPreview ? 'true' : 'false',
      };
      if (typeof input.theirLanguage === 'string' && input.theirLanguage.trim()) {
        parameters.theirLanguage = input.theirLanguage.trim();
      }
      if (typeof input.chunkId === 'string' && input.chunkId.trim()) {
        parameters.chunkId = input.chunkId.trim();
      }
      if (Array.isArray(input.contextBias)) {
        const sanitizedBias = input.contextBias
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map(item => item.trim())
          .slice(0, 25);
        if (sanitizedBias.length > 0) {
          parameters.contextBias = JSON.stringify(sanitizedBias);
        }
      }
      const uploaded = await sourceFile.upload(endpointUrl('/chat/messages/live-listen'), {
        fieldName: 'sourceAudio',
        mimeType: input.mimeType,
        parameters,
        signal,
      });
      input.onResponse?.();
      const response = new Response(uploaded.body, { status: uploaded.status, headers: uploaded.headers });
      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const error = await response.json();
          if (typeof error?.error === 'string' && error.error.trim()) message = error.error;
        } catch {
          /* Safe proxy fallback. */
        }
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
    async postVoiceClone(
      input: {
        language: string;
        samples: Array<{
          base64: string;
          mimeType: string;
          filename?: string;
          durationMs?: number;
          transcript?: string;
        }>;
      },
      signal?: AbortSignal,
    ): Promise<Response> {
      if (typeof input.language !== 'string' || !input.language.trim()) {
        throw new Error('language must be a non-empty string.');
      }
      if (!Array.isArray(input.samples) || input.samples.length === 0) {
        throw new Error('samples must be a non-empty array.');
      }
      const sanitizedSamples = input.samples.map(sample => ({
        base64: sample.base64,
        mimeType: sample.mimeType,
        ...(sample.filename ? { filename: sample.filename } : {}),
        ...(typeof sample.durationMs === 'number' ? { durationMs: sample.durationMs } : {}),
        ...(sample.transcript ? { transcript: sample.transcript } : {}),
      }));
      const response = await fetchRequest(endpointUrl('/speech/clone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: input.language.trim(),
          samples: sanitizedSamples,
        }),
        signal,
      });
      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const error = await response.json();
          if (typeof error?.error === 'string' && error.error.trim()) message = error.error;
        } catch { /* Safe proxy fallback. */ }
        throw new ProcessingApiError(response.status, message);
      }
      return response;
    },
  };
}
