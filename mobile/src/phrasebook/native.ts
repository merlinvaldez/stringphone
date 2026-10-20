import { requestOutputSpeech } from '../adapters/api';
import type { AudioOwner } from '../storage/audio';
import { getNativePhrasebookServices, getNativeTextChat } from '../chat/native';

type PhraseRole = AudioOwner['role'];

export async function saveNativeMessageToPhrasebook(messageId: string) {
  await getNativeTextChat();
  const { phrasebook, audio } = await getNativePhrasebookServices();
  const availableRoles: PhraseRole[] = [];
  for (const role of ['source', 'translated'] as const) {
    const result = await audio.resolve({ kind: 'message', id: messageId, role });
    if (result?.availability === 'available' && result.uri) availableRoles.push(role);
  }
  return phrasebook.saveFromMessage(messageId, availableRoles);
}

export async function resolveNativePhraseAudio(id: string, role: PhraseRole) {
  const { audio } = await getNativePhrasebookServices();
  return audio.resolve({ kind: 'phrasebook', id, role });
}

export async function ensureNativePhraseSpeech(id: string, role: PhraseRole, speechVoice?: 'marin' | 'onyx') {
  const { phrasebook, audio } = await getNativePhrasebookServices();
  const existing = await audio.resolve({ kind: 'phrasebook', id, role });
  if (existing?.availability === 'available' && existing.uri) return existing;

  const phrase = await phrasebook.get(id);
  if (!phrase) throw new Error('Phrase not found.');
  const text = role === 'source' ? phrase.original_text : phrase.translated_text;
  const language = role === 'source' ? phrase.source_language : phrase.target_language;
  if (!text.trim()) throw new Error(role === 'source' ? 'Phrase text is empty.' : 'Add a translation before generating speech.');

  const speech = await requestOutputSpeech({ text, language, speechVoice });
  await audio.save(
    { kind: 'phrasebook', id, role },
    { bytes: speech.bytes },
    { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
    true,
  );
  return audio.resolve({ kind: 'phrasebook', id, role });
}

export async function deleteNativePhrase(id: string) {
  const { deletion } = await getNativePhrasebookServices();
  return deletion.delete({ kind: 'phrase', id });
}

export async function retryNativePhrasebookMaintenance() {
  const { deletion } = await getNativePhrasebookServices();
  return deletion.retryMaintenance();
}
