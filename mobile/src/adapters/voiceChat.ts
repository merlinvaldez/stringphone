import type { AudioFormat } from '../storage/audio';
import type { createProcessingTransport } from './processingTransport';

const formats: Record<string, AudioFormat> = {
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/ogg': 'ogg',
  'audio/webm': 'webm', 'audio/x-caf': 'caf',
};
export class VoiceTranslationResponseError extends Error {
  constructor() { super('The server returned an invalid voice translation response.'); this.name = 'VoiceTranslationResponseError'; }
}
function decodeAudio(input: unknown) {
  if (!input || typeof input !== 'object') throw new VoiceTranslationResponseError();
  const { mimeType, base64 } = input as Record<string, unknown>;
  const format = typeof mimeType === 'string' ? formats[mimeType] : undefined;
  if (!format || typeof base64 !== 'string' || !base64.length || base64.length > 40_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new VoiceTranslationResponseError();
  let decoded: string;
  try { decoded = atob(base64); } catch { throw new VoiceTranslationResponseError(); }
  return { bytes: Uint8Array.from(decoded, character => character.charCodeAt(0)), format, mimeType: mimeType as string };
}
export function createVoiceChatApi(transport: ReturnType<typeof createProcessingTransport>) {
  return {
    async translateVoiceMessage(input: { uri: string; mimeType: string; filename: string; sourceLanguage: string; targetLanguage: string; signal?: AbortSignal; onResponse?: () => void }) {
      const response = await transport.postVoice(input, input.signal);
      let value: Record<string, unknown>;
      try { value = await response.json(); } catch { throw new VoiceTranslationResponseError(); }
      if (!value || typeof value !== 'object' || ['transcript', 'translatedText', 'originalPronunciation', 'translatedPronunciation'].some(key => typeof value[key] !== 'string')) throw new VoiceTranslationResponseError();
      for (const key of ['sourceLanguage', 'targetLanguage'] as const) {
        const language = value[key] as { code?: unknown; label?: unknown } | null;
        if (!language || language.code !== input[key] || typeof language.label !== 'string' || !language.label.trim()) throw new VoiceTranslationResponseError();
      }
      return {
        originalText: value.transcript as string, translatedText: value.translatedText as string,
        originalPronunciation: value.originalPronunciation as string, translatedPronunciation: value.translatedPronunciation as string,
        sourceAudio: decodeAudio(value.sourceAudio), translatedAudio: decodeAudio(value.audio),
      };
    },
  };
}
