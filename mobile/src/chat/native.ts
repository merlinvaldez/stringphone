import { openNativeHistoryDatabase } from '../adapters/storage';
import { createNativeAudioFiles } from '../adapters/files';
import { translateTextMessage, translateVoiceMessage, requestOutputSpeech } from '../adapters/api';
import { createVoiceMessageProcessor } from '../storage/voiceProcessing';
import { createAudioStorage } from '../storage/audio';
import { createHistoryRepository } from '../storage/history';
import { createSavedMessageFlow } from '../storage/processing';
import { createTextChatController } from './controller';
import { createDeletionService } from '../storage/deletion';
import { confirmNativeDeletion } from '../adapters/deletionConfirmation';

// Local IDs are never credentials or cloud ownership IDs.
let sequence = 0;
const newId = () => `${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
let session: Promise<ReturnType<typeof createTextChatController>> | undefined;
let audioSession: ReturnType<typeof createAudioStorage> | undefined;
let historySession: ReturnType<typeof createHistoryRepository> | undefined;

export async function resolveNativeSourceAudio(id: string) {
  await getNativeTextChat();
  return audioSession!.resolve({ kind: 'message', id, role: 'source' });
}

export async function resolveNativeTranslatedAudio(id: string) {
  await getNativeTextChat();
  return audioSession!.resolve({ kind: 'message', id, role: 'translated' });
}

export async function ensureTranslatedSpeech(messageId: string, speechVoice?: 'marin' | 'onyx') {
  await getNativeTextChat();
  const existing = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'translated' });
  if (existing && existing.availability === 'available' && existing.uri) {
    return existing;
  }
  const message = await historySession!.getMessage(messageId);
  if (!message) throw new Error('Message not found.');
  const text = message.translated_text;
  if (!text || !text.trim()) throw new Error('No translation available for speech generation.');
  const targetLanguage = message.target_language;
  const speech = await requestOutputSpeech({
    text,
    language: targetLanguage,
    speechVoice,
  });
  await audioSession!.save(
    { kind: 'message', id: messageId, role: 'translated' },
    { bytes: speech.bytes },
    { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
    true,
  );
  return audioSession!.resolve({ kind: 'message', id: messageId, role: 'translated' });
}

export function getNativeAudioStorage() {
  return audioSession;
}

export function getNativeTextChat() {
  // One connection/flow per app lifetime: tab navigation never reruns recovery.
  session ??= (async () => {
    const database = await openNativeHistoryDatabase();
    try {
      const history = createHistoryRepository(database);
      const audio = createAudioStorage(database, createNativeAudioFiles(), newId);
      const deletion = createDeletionService(database, audio, confirmNativeDeletion);
      const voice = createVoiceMessageProcessor(audio, translateVoiceMessage, () => controller.voiceResponseReceived());
      const controller = createTextChatController(history, createSavedMessageFlow(history, audio), translateTextMessage, newId, undefined, deletion, voice);
      await controller.initialize();
      audioSession = audio;
      historySession = history;
      return controller;
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  })().catch(error => { session = undefined; throw error; });
  return session;
}
