import { requestOutputSpeech, translateTextMessage } from '../adapters/api';
import { getNativeLanguageName } from '../components/LanguageFlag';
import type { AudioOwner } from '../storage/audio';
import type { PhrasebookRow } from '../storage/phrasebook';
import { getActiveTtsVoice, getNativePhrasebookServices, getNativeTextChat } from '../chat/native';

type PhraseRole = AudioOwner['role'];

export type PhrasebookCollectionSummary = {
  languageCode: string;
  languageName: string;
  entryCount: number;
  latestUpdatedAt: number;
};

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

export async function listNativePhrasebookCollections(query = ''): Promise<PhrasebookCollectionSummary[]> {
  const { phrasebook } = await getNativePhrasebookServices();
  const page = await phrasebook.listPage(query, null, 200);
  const byLanguage = new Map<string, PhrasebookCollectionSummary>();
  for (const row of page.items) {
    const code = row.target_language;
    const existing = byLanguage.get(code);
    if (existing) {
      existing.entryCount += 1;
      existing.latestUpdatedAt = Math.max(existing.latestUpdatedAt, row.updated_at);
    } else {
      byLanguage.set(code, {
        languageCode: code,
        languageName: getNativeLanguageName(code),
        entryCount: 1,
        latestUpdatedAt: row.updated_at,
      });
    }
  }
  return [...byLanguage.values()].sort((a, b) => a.languageName.localeCompare(b.languageName));
}

export async function listNativePhrasebookEntriesForLanguage(
  languageCode: string,
  query = '',
): Promise<PhrasebookRow[]> {
  const { phrasebook } = await getNativePhrasebookServices();
  const page = await phrasebook.listPage(query, null, 200);
  return page.items
    .filter(item => item.target_language === languageCode)
    .sort((a, b) => b.updated_at - a.updated_at);
}

export async function createTranslatedNativePhrasebookEntry(input: {
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<PhrasebookRow> {
  const trimmed = input.sourceText.trim();
  if (!trimmed) throw new Error('Enter a word or phrase first.');
  const { phrasebook } = await getNativePhrasebookServices();
  const translated = await translateTextMessage({
    text: trimmed,
    sourceLanguage: { code: input.sourceLanguage },
    targetLanguage: { code: input.targetLanguage },
  });
  const id = await phrasebook.create({
    source_language: translated.sourceLanguage.code,
    target_language: translated.targetLanguage.code,
    original_text: translated.originalText,
    translated_text: translated.translatedText,
    original_pronunciation: translated.originalPronunciation || null,
    translated_pronunciation: translated.translatedPronunciation || null,
  });
  const created = await phrasebook.get(id);
  if (!created) throw new Error('Saved phrasebook card could not be loaded.');
  return created;
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

  const speech = await requestOutputSpeech({ text, language, speechVoice: speechVoice ?? getActiveTtsVoice() });
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
