import { openNativeHistoryDatabase } from '../adapters/storage';
import { createNativeAudioFiles } from '../adapters/files';
import { translateTextMessage, translateVoiceMessage, requestOutputSpeech, requestVoiceClone } from '../adapters/api';
import { createVoiceMessageProcessor } from '../storage/voiceProcessing';
import { createAudioStorage } from '../storage/audio';
import { createHistoryRepository, MIN_VOICE_CLONE_DURATION_MS } from '../storage/history';
import { createSavedMessageFlow } from '../storage/processing';
import { createTextChatController } from './controller';
import { createDeletionService } from '../storage/deletion';
import { confirmNativeDeletion } from '../adapters/deletionConfirmation';
import { createPhrasebookRepository } from '../storage/phrasebook';
import { prefetchBothTranscriptionSecrets } from '../live/nativeRealtime';

// Local IDs are never credentials or cloud ownership IDs.
let sequence = 0;
const newId = () => `${Date.now().toString(36)}_${(++sequence).toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
let session: Promise<ReturnType<typeof createTextChatController>> | undefined;
let audioSession: ReturnType<typeof createAudioStorage> | undefined;
let historySession: ReturnType<typeof createHistoryRepository> | undefined;
let phrasebookSession: ReturnType<typeof createPhrasebookRepository> | undefined;
let deletionSession: ReturnType<typeof createDeletionService> | undefined;
let currentTtsVoice: 'marin' | 'onyx' = 'marin';
const ttsVoiceListeners = new Set<(voice: 'marin' | 'onyx') => void>();
const inFlightCloneRequests = new Map<string, Promise<string | null>>();

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export async function ensureConversationVoiceClone(
  conversationId: string,
  languageCode: string,
): Promise<string | null> {
  await getNativeTextChat();
  const normalizedLang = (languageCode || '').trim().toLowerCase();
  if (!conversationId || !normalizedLang || !historySession || !audioSession) {
    return null;
  }

  const existing = await historySession.getConversationVoiceClone(conversationId, normalizedLang);
  if (existing?.voiceId) {
    return existing.voiceId;
  }

  const eligible = await historySession.collectEligibleVoiceCloneSamples(
    conversationId,
    normalizedLang,
    MIN_VOICE_CLONE_DURATION_MS,
  );
  if (!eligible.eligible || eligible.samples.length === 0) {
    return null;
  }

  const inFlightKey = `${conversationId}::${normalizedLang}`;
  const inFlight = inFlightCloneRequests.get(inFlightKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async () => {
    try {
      const samplePayloads: Array<{
        base64: string;
        mimeType: string;
        filename: string;
        durationMs: number;
        transcript?: string;
      }> = [];

      for (const sample of eligible.samples) {
        const audioData = await audioSession!.readBytes({
          kind: 'message',
          id: sample.messageId,
          role: 'source',
        });
        if (!audioData || !audioData.bytes.byteLength) continue;
        samplePayloads.push({
          base64: uint8ArrayToBase64(audioData.bytes),
          mimeType: audioData.mimeType || sample.mimeType || 'audio/wav',
          filename: audioData.fileName || sample.fileName || `${sample.audioId}.${sample.format || 'wav'}`,
          durationMs: sample.durationMs,
          ...(sample.transcript ? { transcript: sample.transcript } : {}),
        });
      }

      if (samplePayloads.length === 0) {
        return null;
      }

      const result = await requestVoiceClone({
        language: normalizedLang,
        samples: samplePayloads,
      });

      if (result.cloned && result.clonedVoiceId) {
        await historySession!.setConversationVoiceClone(conversationId, {
          languageCode: normalizedLang,
          voiceId: result.clonedVoiceId,
          totalDurationMs: result.totalDurationMs || eligible.totalDurationMs,
          mode: result.mode === 'single' ? 'single' : 'merged',
        });
        return result.clonedVoiceId;
      }

      return null;
    } catch {
      return null;
    } finally {
      inFlightCloneRequests.delete(inFlightKey);
    }
  })();

  inFlightCloneRequests.set(inFlightKey, task);
  return task;
}

export function getActiveTtsVoice(): 'marin' | 'onyx' {
  return currentTtsVoice;
}

export function subscribeTtsVoice(listener: (voice: 'marin' | 'onyx') => void) {
  ttsVoiceListeners.add(listener);
  listener(currentTtsVoice);
  return () => {
    ttsVoiceListeners.delete(listener);
  };
}

export async function setNativeTtsVoice(voice: 'marin' | 'onyx') {
  currentTtsVoice = voice;
  ttsVoiceListeners.forEach(listener => listener(voice));
  await getNativeTextChat();
  await historySession?.setTtsVoicePreference(voice);
}

export async function resolveNativeSourceAudio(id: string) {
  await getNativeTextChat();
  const message = await historySession!.getMessage(id);
  if (message?.input_kind === 'text') {
    await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  }
  return audioSession!.resolve({ kind: 'message', id, role: 'source' });
}

export async function resolveNativeTranslatedAudio(id: string) {
  await getNativeTextChat();
  const message = await historySession!.getMessage(id);
  if (message) {
    await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  }
  return audioSession!.resolve({ kind: 'message', id, role: 'translated' });
}

export async function ensureSourceSpeech(messageId: string, speechVoice?: 'marin' | 'onyx') {
  await getNativeTextChat();
  const message = await historySession!.getMessage(messageId);
  if (!message) throw new Error('Message not found.');
  if (message.input_kind === 'voice') {
    const recorded = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'source' });
    if (recorded && recorded.availability === 'available' && recorded.uri) {
      return recorded;
    }
  }
  const clonedVoiceId = await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  const existing = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'source' });
  if (existing && existing.availability === 'available' && existing.uri) {
    return existing;
  }
  const text = message.original_text;
  if (!text || !text.trim()) throw new Error('No original text available for speech generation.');
  const speech = await requestOutputSpeech({
    text,
    language: message.source_language,
    speechVoice: speechVoice ?? currentTtsVoice,
    ...(clonedVoiceId ? { clonedVoiceId } : {}),
  });
  await audioSession!.save(
    { kind: 'message', id: messageId, role: 'source' },
    { bytes: speech.bytes },
    { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
    true,
  );
  return audioSession!.resolve({ kind: 'message', id: messageId, role: 'source' });
}

export async function ensureTranslatedSpeech(messageId: string, speechVoice?: 'marin' | 'onyx') {
  await getNativeTextChat();
  const message = await historySession!.getMessage(messageId);
  if (!message) throw new Error('Message not found.');
  const clonedVoiceId = await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  const existing = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'translated' });
  if (existing && existing.availability === 'available' && existing.uri) {
    return existing;
  }
  const text = message.translated_text;
  if (!text || !text.trim()) throw new Error('No translation available for speech generation.');
  const targetLanguage = message.target_language;
  const speech = await requestOutputSpeech({
    text,
    language: targetLanguage,
    speechVoice: speechVoice ?? currentTtsVoice,
    ...(clonedVoiceId ? { clonedVoiceId } : {}),
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
      const phrasebook = createPhrasebookRepository(database, newId);
      const voice = createVoiceMessageProcessor(audio, translateVoiceMessage, () => controller.voiceResponseReceived());
      const controller = createTextChatController(history, createSavedMessageFlow(history, audio), translateTextMessage, newId, undefined, deletion, voice, audio);
      await controller.initialize();
      const initial = controller.getState();
      if (initial.myLanguage && initial.theirLanguage) {
        prefetchBothTranscriptionSecrets(initial.myLanguage, initial.theirLanguage);
      }
      let lastPrefetched = `${initial.myLanguage}::${initial.theirLanguage}`;
      controller.subscribe(state => {
        if (!state.myLanguage || !state.theirLanguage) return;
        const current = `${state.myLanguage}::${state.theirLanguage}`;
        if (current !== lastPrefetched) {
          lastPrefetched = current;
          prefetchBothTranscriptionSecrets(state.myLanguage, state.theirLanguage);
        }
      });
      const prefs = await history.getChatPreferences();
      if (prefs.ttsVoice === 'marin' || prefs.ttsVoice === 'onyx') {
        currentTtsVoice = prefs.ttsVoice;
        ttsVoiceListeners.forEach(listener => listener(currentTtsVoice));
      }
      audioSession = audio;
      historySession = history;
      phrasebookSession = phrasebook;
      deletionSession = deletion;
      return controller;
    } catch (error) {
      await database.closeAsync().catch(() => undefined);
      throw error;
    }
  })().catch(error => { session = undefined; throw error; });
  return session;
}

export async function getNativePhrasebookServices() {
  await getNativeTextChat();
  return { phrasebook: phrasebookSession!, audio: audioSession!, deletion: deletionSession! };
}
