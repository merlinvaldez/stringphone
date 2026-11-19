import { openNativeHistoryDatabase } from '../adapters/storage';
import { createNativeAudioFiles } from '../adapters/files';
import { translateTextMessage, translateVoiceMessage, requestOutputSpeech, requestVoiceClone } from '../adapters/api';
import { createVoiceMessageProcessor } from '../storage/voiceProcessing';
import { createAudioStorage } from '../storage/audio';
import { createHistoryRepository, MIN_VOICE_CLONE_DURATION_MS, type TtsVoiceMode } from '../storage/history';
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
let currentTtsVoiceMode: TtsVoiceMode = 'voice_clone';
const ttsVoiceModeListeners = new Set<(mode: TtsVoiceMode) => void>();
let activeController: ReturnType<typeof createTextChatController> | undefined;
type ResolvedVoiceClone = {
  voiceId: string;
  referenceAudioBase64?: string;
};

const inFlightCloneRequests = new Map<string, Promise<ResolvedVoiceClone | null>>();
const inFlightSpeechRequests = new Map<string, Promise<Awaited<ReturnType<ReturnType<typeof createAudioStorage>['resolve']>>>>();

function toResolvedVoiceClone(
  clone: { voiceId?: string | null; referenceAudioBase64?: string | null } | null | undefined,
): ResolvedVoiceClone | null {
  if (!clone?.voiceId) return null;
  return {
    voiceId: clone.voiceId,
    ...(clone.referenceAudioBase64 ? { referenceAudioBase64: clone.referenceAudioBase64 } : {}),
  };
}

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
): Promise<ResolvedVoiceClone | null> {
  if (currentTtsVoiceMode !== 'voice_clone') {
    return null;
  }
  await getNativeTextChat();
  if (currentTtsVoiceMode !== 'voice_clone') {
    return null;
  }
  const normalizedLang = (languageCode || '').trim().toLowerCase();
  if (!conversationId || !normalizedLang || !historySession || !audioSession) {
    return null;
  }

  const existing = await historySession.getConversationVoiceClone(conversationId, normalizedLang);
  if (
    existing?.voiceId &&
    existing.voiceId.startsWith('voxtral_ref_') &&
    existing.referenceAudioBase64
  ) {
    return toResolvedVoiceClone(existing);
  }

  const eligible = await historySession.collectEligibleVoiceCloneSamples(
    conversationId,
    normalizedLang,
    MIN_VOICE_CLONE_DURATION_MS,
  );
  if (!eligible.eligible || eligible.samples.length === 0) {
    return toResolvedVoiceClone(existing);
  }

  const inFlightKey = `${conversationId}::${normalizedLang}`;
  const inFlight = inFlightCloneRequests.get(inFlightKey);
  if (inFlight) {
    return inFlight;
  }

  const task = (async (): Promise<ResolvedVoiceClone | null> => {
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
        return toResolvedVoiceClone(existing);
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
          ...(result.referenceAudioBase64 ? { referenceAudioBase64: result.referenceAudioBase64 } : {}),
        });
        return {
          voiceId: result.clonedVoiceId,
          ...(result.referenceAudioBase64 ? { referenceAudioBase64: result.referenceAudioBase64 } : {}),
        };
      }

      return toResolvedVoiceClone(existing);
    } catch {
      return toResolvedVoiceClone(existing);
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
  inFlightSpeechRequests.clear();
  await getNativeTextChat();
  await historySession?.setTtsVoicePreference(voice);
  await historySession?.clearGeneratedSpeechCache();
}

export function getActiveTtsVoiceMode(): TtsVoiceMode {
  return currentTtsVoiceMode;
}

export function subscribeTtsVoiceMode(listener: (mode: TtsVoiceMode) => void) {
  ttsVoiceModeListeners.add(listener);
  listener(currentTtsVoiceMode);
  return () => {
    ttsVoiceModeListeners.delete(listener);
  };
}

export async function setNativeTtsVoiceMode(mode: TtsVoiceMode) {
  const normalized: TtsVoiceMode = mode === 'ai_tts' ? 'ai_tts' : 'voice_clone';
  currentTtsVoiceMode = normalized;
  ttsVoiceModeListeners.forEach(listener => listener(normalized));
  inFlightSpeechRequests.clear();
  await getNativeTextChat();
  await historySession?.setTtsVoiceModePreference(normalized);
  await historySession?.clearGeneratedSpeechCache();
}

export async function getActiveConversationVoiceCloneStatus(): Promise<{
  conversationId: string | null;
  count: number;
}> {
  await getNativeTextChat();
  const conversationId = activeController?.getState().conversation?.id ?? null;
  if (!conversationId || !historySession) {
    return { conversationId: null, count: 0 };
  }
  const clones = await historySession.getConversationVoiceClones(conversationId);
  return {
    conversationId,
    count: Object.keys(clones).length,
  };
}

export async function clearActiveConversationVoiceClones(): Promise<{
  conversationId: string | null;
  clearedCount: number;
}> {
  await getNativeTextChat();
  const conversationId = activeController?.getState().conversation?.id ?? null;
  if (!conversationId || !historySession) {
    return { conversationId: null, clearedCount: 0 };
  }
  for (const key of inFlightCloneRequests.keys()) {
    if (key.startsWith(`${conversationId}::`)) {
      inFlightCloneRequests.delete(key);
    }
  }
  inFlightSpeechRequests.clear();
  const result = await historySession.clearConversationVoiceClones(conversationId);
  return {
    conversationId,
    clearedCount: result.clearedCount,
  };
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
  const clonedVoice = await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  const clonedVoiceId = clonedVoice?.voiceId;
  const clonedVoiceReferenceAudio = clonedVoice?.referenceAudioBase64;
  const existing = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'source' });
  if (existing && existing.availability === 'available' && existing.uri) {
    return existing;
  }
  const inFlightKey = `source:${messageId}:${clonedVoiceId ?? (speechVoice ?? currentTtsVoice)}`;
  const inFlight = inFlightSpeechRequests.get(inFlightKey);
  if (inFlight) return inFlight;

  const task = (async () => {
    const text = message.original_text;
    if (!text || !text.trim()) throw new Error('No original text available for speech generation.');
    const speech = await requestOutputSpeech({
      text,
      language: message.source_language,
      speechVoice: speechVoice ?? currentTtsVoice,
      ...(clonedVoiceId ? { clonedVoiceId } : {}),
      ...(clonedVoiceReferenceAudio ? { clonedVoiceReferenceAudio } : {}),
    });
    await audioSession!.save(
      { kind: 'message', id: messageId, role: 'source' },
      { bytes: speech.bytes },
      { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
      true,
    );
    return audioSession!.resolve({ kind: 'message', id: messageId, role: 'source' });
  })().finally(() => {
    inFlightSpeechRequests.delete(inFlightKey);
  });

  inFlightSpeechRequests.set(inFlightKey, task);
  return task;
}

export async function ensureTranslatedSpeech(messageId: string, speechVoice?: 'marin' | 'onyx') {
  await getNativeTextChat();
  const message = await historySession!.getMessage(messageId);
  if (!message) throw new Error('Message not found.');
  const clonedVoice = await ensureConversationVoiceClone(message.conversation_id, message.source_language);
  const clonedVoiceId = clonedVoice?.voiceId;
  const clonedVoiceReferenceAudio = clonedVoice?.referenceAudioBase64;
  const existing = await audioSession!.resolve({ kind: 'message', id: messageId, role: 'translated' });
  if (existing && existing.availability === 'available' && existing.uri) {
    return existing;
  }
  const inFlightKey = `translated:${messageId}:${clonedVoiceId ?? (speechVoice ?? currentTtsVoice)}`;
  const inFlight = inFlightSpeechRequests.get(inFlightKey);
  if (inFlight) return inFlight;

  const task = (async () => {
    const text = message.translated_text;
    if (!text || !text.trim()) throw new Error('No translation available for speech generation.');
    const targetLanguage = message.target_language;
    const speech = await requestOutputSpeech({
      text,
      language: targetLanguage,
      speechVoice: speechVoice ?? currentTtsVoice,
      ...(clonedVoiceId ? { clonedVoiceId } : {}),
      ...(clonedVoiceReferenceAudio ? { clonedVoiceReferenceAudio } : {}),
    });
    await audioSession!.save(
      { kind: 'message', id: messageId, role: 'translated' },
      { bytes: speech.bytes },
      { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
      true,
    );
    return audioSession!.resolve({ kind: 'message', id: messageId, role: 'translated' });
  })().finally(() => {
    inFlightSpeechRequests.delete(inFlightKey);
  });

  inFlightSpeechRequests.set(inFlightKey, task);
  return task;
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
      if (prefs.ttsVoiceMode === 'ai_tts' || prefs.ttsVoiceMode === 'voice_clone') {
        currentTtsVoiceMode = prefs.ttsVoiceMode;
        ttsVoiceModeListeners.forEach(listener => listener(currentTtsVoiceMode));
      }
      audioSession = audio;
      historySession = history;
      phrasebookSession = phrasebook;
      deletionSession = deletion;
      activeController = controller;
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
