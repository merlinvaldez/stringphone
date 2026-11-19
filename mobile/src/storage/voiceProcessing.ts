import type { createAudioStorage } from './audio';
import type { createVoiceChatApi } from '../adapters/voiceChat';
import type { SavedMessageProcessor } from './processing';

// The source is already durable before upload. Never replace it with a server echo.
// Persist decoded output before returning text to the saved-message finalizer.
export const MAX_VOICE_BYTES = 3_000_000;
export function createVoiceMessageProcessor(audio: ReturnType<typeof createAudioStorage>, translate: ReturnType<typeof createVoiceChatApi>['translateVoiceMessage'], onResponse?: () => void): SavedMessageProcessor {
  return async ({ message, sourceAudio }, signal) => {
    if (!sourceAudio?.uri || sourceAudio.availability !== 'available') throw new Error('Saved source recording is unavailable.');
    if (!Number.isSafeInteger(sourceAudio.byte_size) || sourceAudio.byte_size <= 0) throw new Error('Recording is empty. Record a new message.');
    if (sourceAudio.byte_size > MAX_VOICE_BYTES) throw new Error('Recording exceeds the 3 MB mobile upload limit. Record a shorter message.');
    if (!['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/webm', 'audio/x-caf'].includes(sourceAudio.mime_type)) throw new Error('Unsupported recording format. Record a new message.');
    const result = await translate({ uri: sourceAudio.uri, mimeType: sourceAudio.mime_type, filename: sourceAudio.file_name,
      sourceLanguage: message.source_language, targetLanguage: message.target_language, signal, onResponse });
    if (signal.aborted) throw new Error('Processing was interrupted.');
    const owner = { kind: 'message' as const, id: message.id, role: 'translated' as const };
    await audio.save(owner, { bytes: result.translatedAudio.bytes }, result.translatedAudio, true);
    return { originalText: result.originalText, translatedText: result.translatedText,
      originalPronunciation: result.originalPronunciation, translatedPronunciation: result.translatedPronunciation };
  };
}
