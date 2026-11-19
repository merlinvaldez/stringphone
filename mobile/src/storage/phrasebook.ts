import type { SQLiteDatabase } from '../adapters/storage';
import type { AudioOwner } from './audio';
import type { MessageRow } from './history';

export type PhrasebookRow = {
  id: string;
  source_message_id: string | null;
  source_language: string;
  target_language: string;
  original_text: string;
  translated_text: string;
  original_pronunciation: string | null;
  translated_pronunciation: string | null;
  created_at: number;
  updated_at: number;
};

export type PhrasebookInput = Pick<PhrasebookRow,
  'source_language' | 'target_language' | 'original_text' | 'translated_text' |
  'original_pronunciation' | 'translated_pronunciation'>;

export type PhrasebookCursor = Pick<PhrasebookRow,
  'source_language' | 'target_language' | 'updated_at' | 'id'>;

const MAX_LIMIT = 200;
const MAX_TEXT_LENGTH = 5000;

function requireText(value: string, label: string, max = MAX_TEXT_LENGTH) {
  if (!value.trim()) throw new Error(`${label} is required.`);
  if (value.length > max) throw new Error(`${label} is too long.`);
}

function optionalText(value: string | null) {
  const text = value?.trim() ?? '';
  if (text.length > MAX_TEXT_LENGTH) throw new Error('Pronunciation is too long.');
  return text || null;
}

function validateInput(input: PhrasebookInput) {
  requireText(input.source_language, 'Source language', 40);
  requireText(input.target_language, 'Target language', 40);
  requireText(input.original_text, 'Phrase');
  if (input.translated_text.length > MAX_TEXT_LENGTH) throw new Error('Translation is too long.');
  return {
    sourceLanguage: input.source_language.trim(),
    targetLanguage: input.target_language.trim(),
    originalText: input.original_text.trim(),
    translatedText: input.translated_text.trim(),
    originalPronunciation: optionalText(input.original_pronunciation),
    translatedPronunciation: optionalText(input.translated_pronunciation),
  };
}

function checkedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`Limit must be between 1 and ${MAX_LIMIT}.`);
  }
  return limit;
}

export function createPhrasebookRepository(
  database: SQLiteDatabase,
  newId: () => string,
  now: () => number = Date.now,
) {
  return {
    async saveFromMessage(messageId: string, availableAudioRoles: AudioOwner['role'][] = []) {
      requireText(messageId, 'Message ID', 128);
      const roles = new Set(availableAudioRoles);
      for (const role of roles) if (role !== 'source' && role !== 'translated') throw new Error('Invalid audio role.');
      let phraseId = '';
      await database.withExclusiveTransactionAsync(async transaction => {
        const existing = await transaction.getFirstAsync<{ id: string }>(
          'SELECT id FROM phrasebook_entries WHERE source_message_id=? LIMIT 1', messageId,
        );
        if (existing) {
          phraseId = existing.id;
          return;
        }
        const message = await transaction.getFirstAsync<MessageRow>(
          "SELECT * FROM messages WHERE id=? AND status='ready' AND translated_text IS NOT NULL AND length(trim(translated_text)) > 0",
          messageId,
        );
        if (!message) throw new Error('Only a saved translated message can be added to the Phrasebook.');
        const translatedText = message.translated_text;
        if (translatedText === null || !translatedText.trim()) throw new Error('This message has no translation to save.');
        requireText(message.original_text, 'Original phrase');
        phraseId = newId();
        requireText(phraseId, 'Phrase ID', 128);
        const time = now();
        await transaction.runAsync(
          `INSERT INTO phrasebook_entries
            (id,source_message_id,source_language,target_language,original_text,translated_text,original_pronunciation,translated_pronunciation,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          phraseId, message.id, message.source_language, message.target_language,
          message.original_text.trim(), translatedText.trim(),
          message.original_pronunciation, message.translated_pronunciation, time, time,
        );
        for (const role of roles) {
          await transaction.runAsync(
            `INSERT INTO phrasebook_audio (phrasebook_id,role,audio_id)
             SELECT ?,ma.role,ma.audio_id FROM message_audio ma
             JOIN audio_assets a ON a.id=ma.audio_id
             WHERE ma.message_id=? AND ma.role=? AND a.availability='available'`,
            phraseId, messageId, role,
          );
        }
      });
      return phraseId;
    },

    async create(input: PhrasebookInput) {
      const values = validateInput(input);
      const id = newId();
      requireText(id, 'Phrase ID', 128);
      const time = now();
      await database.runAsync(
        `INSERT INTO phrasebook_entries
          (id,source_message_id,source_language,target_language,original_text,translated_text,original_pronunciation,translated_pronunciation,created_at,updated_at)
         VALUES (?,NULL,?,?,?,?,?,?,?,?)`,
        id, values.sourceLanguage, values.targetLanguage, values.originalText, values.translatedText,
        values.originalPronunciation, values.translatedPronunciation, time, time,
      );
      return id;
    },

    async update(id: string, expectedUpdatedAt: number, input: PhrasebookInput) {
      requireText(id, 'Phrase ID', 128);
      if (!Number.isSafeInteger(expectedUpdatedAt) || expectedUpdatedAt < 0) throw new Error('Invalid phrase revision.');
      const values = validateInput(input);
      const row = await database.getFirstAsync<{ updated_at: number }>(
        'SELECT updated_at FROM phrasebook_entries WHERE id=?', id,
      );
      if (!row) return 'missing' as const;
      if (row.updated_at !== expectedUpdatedAt) return 'changed' as const;
      const updatedAt = Math.max(now(), row.updated_at + 1);
      const result = await database.runAsync(
        `UPDATE phrasebook_entries SET source_language=?,target_language=?,original_text=?,translated_text=?,
          original_pronunciation=?,translated_pronunciation=?,updated_at=? WHERE id=? AND updated_at=?`,
        values.sourceLanguage, values.targetLanguage, values.originalText, values.translatedText,
        values.originalPronunciation, values.translatedPronunciation, updatedAt, id, expectedUpdatedAt,
      );
      return result.changes === 1 ? 'updated' as const : 'changed' as const;
    },

    async get(id: string) {
      return database.getFirstAsync<PhrasebookRow>('SELECT * FROM phrasebook_entries WHERE id=?', id);
    },

    async listPage(query = '', cursor: PhrasebookCursor | null = null, limit = 50) {
      checkedLimit(limit);
      const text = query.trim();
      if (text.length > 500) throw new Error('Search is too long.');
      const conditions: string[] = [];
      const parameters: (string | number)[] = [];
      if (text) {
        conditions.push("id IN (SELECT record_id FROM history_search WHERE kind='phrase' AND history_search MATCH ?)");
        parameters.push(`"${text.replace(/"/g, '""')}"`);
      }
      if (cursor) {
        conditions.push(`(source_language > ? OR (source_language = ? AND
          (target_language > ? OR (target_language = ? AND
          (updated_at < ? OR (updated_at = ? AND id < ?))))))`);
        parameters.push(cursor.source_language, cursor.source_language, cursor.target_language, cursor.target_language,
          cursor.updated_at, cursor.updated_at, cursor.id);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const rows = await database.getAllAsync<PhrasebookRow>(
        `SELECT * FROM phrasebook_entries ${where}
         ORDER BY source_language COLLATE NOCASE,target_language COLLATE NOCASE,updated_at DESC,id DESC LIMIT ?`,
        ...parameters, limit + 1,
      );
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return {
        items,
        cursor: rows.length > limit && last
          ? { source_language: last.source_language, target_language: last.target_language, updated_at: last.updated_at, id: last.id }
          : null,
      };
    },

    async savedSourceMessageIds(messageIds: string[]) {
      const ids = [...new Set(messageIds.filter(Boolean))];
      const matches = new Set<string>();
      for (let offset = 0; offset < ids.length; offset += MAX_LIMIT) {
        const batch = ids.slice(offset, offset + MAX_LIMIT);
        if (!batch.length) continue;
        const placeholders = batch.map(() => '?').join(',');
        const rows = await database.getAllAsync<{ source_message_id: string }>(
          `SELECT source_message_id FROM phrasebook_entries WHERE source_message_id IN (${placeholders})`, ...batch,
        );
        for (const row of rows) matches.add(row.source_message_id);
      }
      return matches;
    },
  };
}
