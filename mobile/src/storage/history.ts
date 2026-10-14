import type { SQLiteDatabase } from '../adapters/storage';

type Mode = 'chat' | 'single' | 'conversation' | 'room';
export type ConversationInput = { id: string; title: string; originMode: Mode; myLanguage: string; theirLanguage: string };
export type PendingMessageInput = { id: string; requestId: string; conversationId: string; speaker: 'me' | 'them'; originMode: Mode; sourceLanguage: string; targetLanguage: string; originalText: string };
export type DraftMessageInput = PendingMessageInput & { inputKind: 'text' | 'voice' };
export type MessageRow = {
  id: string; request_id: string | null; conversation_id: string; speaker: 'me' | 'them'; origin_mode: Mode;
  source_language: string; target_language: string; original_text: string; translated_text: string | null;
  original_pronunciation: string | null; translated_pronunciation: string | null;
  status: 'draft' | 'pending' | 'ready' | 'failed' | 'interrupted'; error_code: string | null; error_message: string | null;
  created_at: number; updated_at: number;
  input_kind: 'text' | 'voice'; processing_attempt: number;
};
type ConversationRow = { id: string; title: string; origin_mode: Mode; my_language: string; their_language: string; created_at: number; updated_at: number };
type SearchRow = { kind: 'conversation' | 'message' | 'phrase'; record_id: string; text: string };
function boundedLimit(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('Limit must be between 1 and 200.');
  return limit;
}
function required(value: string) { if (!value.trim()) throw new Error('Required history value is empty.'); }

export function createHistoryRepository(database: SQLiteDatabase, now: () => number = Date.now) {
  async function touch(transaction: SQLiteDatabase, id: string, time: number) {
    const result = await transaction.runAsync('UPDATE conversations SET updated_at=max(updated_at,?) WHERE id=?', time, id);
    if (result.changes !== 1) throw new Error('Conversation does not exist.');
  }
  return {
    async saveDraft(input: DraftMessageInput) {
      for (const value of [input.id,input.requestId,input.conversationId,input.sourceLanguage,input.targetLanguage]) required(value);
      await database.withExclusiveTransactionAsync(async transaction => {
        const row = await transaction.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=? OR request_id=?', input.id,input.requestId);
        if (row && (row.id !== input.id || row.request_id !== input.requestId || row.conversation_id !== input.conversationId || row.speaker !== input.speaker || row.origin_mode !== input.originMode || row.source_language !== input.sourceLanguage || row.target_language !== input.targetLanguage || row.input_kind !== input.inputKind)) {
          throw new Error('Draft identity does not match saved message.');
        }
        if (row && row.status !== 'draft') throw new Error('Only a draft can be edited.');
        const time = now();
        await touch(transaction,input.conversationId,time);
        if (row) {
          await transaction.runAsync('UPDATE messages SET original_text=?,updated_at=max(updated_at,?) WHERE id=?',input.originalText,time,input.id);
        } else {
          await transaction.runAsync(`INSERT INTO messages (id,request_id,conversation_id,speaker,origin_mode,source_language,target_language,original_text,input_kind,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?)`,input.id,input.requestId,input.conversationId,input.speaker,input.originMode,input.sourceLanguage,input.targetLanguage,input.originalText,input.inputKind,time,time);
        }
      });
    },
    async beginAttempt(id: string): Promise<MessageRow | null> {
      let claimed: MessageRow | null = null;
      await database.withExclusiveTransactionAsync(async transaction => {
        const row = await transaction.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=?',id);
        if (!row || !row.request_id) throw new Error('Saved message/request does not exist.');
        if (!['draft','failed','interrupted'].includes(row.status)) return;
        if (row.input_kind === 'text' && !row.original_text.trim()) throw new Error('Text draft is empty.');
        if (row.input_kind === 'voice') {
          const source = await transaction.getFirstAsync<{ availability: string }>("SELECT a.availability FROM audio_assets a JOIN message_audio r ON r.audio_id=a.id WHERE r.message_id=? AND r.role='source'",id);
          if (source?.availability !== 'available') throw new Error('Save a source recording before processing.');
        }
        const time = now();
        await transaction.runAsync("UPDATE messages SET status='pending',processing_attempt=processing_attempt+1,error_code=NULL,error_message=NULL,updated_at=max(updated_at,?) WHERE id=?",time,id);
        await touch(transaction,row.conversation_id,time);
        claimed = await transaction.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=?',id);
      });
      return claimed;
    },
    async recoverInterruptedRequests() {
      let count = 0;
      await database.withExclusiveTransactionAsync(async transaction => {
        const time = now();
        await transaction.runAsync("UPDATE conversations SET updated_at=max(updated_at,?) WHERE id IN (SELECT conversation_id FROM messages WHERE status='pending')",time);
        const result = await transaction.runAsync("UPDATE messages SET status='interrupted',processing_attempt=processing_attempt+1,error_code='interrupted',error_message='Processing was interrupted. Retry explicitly; the server may have completed the previous request.',updated_at=max(updated_at,?) WHERE status='pending'",time);
        count = result.changes;
      });
      return count;
    },
    async createConversation(input: ConversationInput) {
      required(input.id); required(input.myLanguage); required(input.theirLanguage);
      const time = now();
      await database.runAsync('INSERT INTO conversations (id,title,origin_mode,my_language,their_language,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', input.id, input.title, input.originMode, input.myLanguage, input.theirLanguage, time, time);
    },
    getMessage(id: string) { return database.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=?', id); },
    listConversations(limit = 50) {
      return database.getAllAsync<ConversationRow>('SELECT * FROM conversations ORDER BY updated_at DESC,id LIMIT ?', boundedLimit(limit));
    },
    listMessages(conversationId: string, limit = 200) {
      return database.getAllAsync<MessageRow>('SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at,id LIMIT ?', conversationId, boundedLimit(limit));
    },
    listPending(limit = 200) {
      return database.getAllAsync<MessageRow>("SELECT * FROM messages WHERE status='pending' ORDER BY created_at,id LIMIT ?", boundedLimit(limit));
    },
    async search(text: string, limit = 50) {
      boundedLimit(limit);
      const query = text.trim();
      if (!query) return [];
      if (query.length > 500) throw new Error('Search is too long.');
      // Literal token phrase: quotes/operators cannot become FTS query syntax.
      return database.getAllAsync<SearchRow>('SELECT kind,record_id,text FROM history_search WHERE history_search MATCH ? ORDER BY rank,kind,record_id LIMIT ?', `"${query.replace(/"/g, '""')}"`, limit);
    },
    async queueMessage(input: PendingMessageInput) {
      for (const value of [input.id,input.requestId,input.conversationId,input.sourceLanguage,input.targetLanguage]) required(value);
      let outcome: 'created' | 'existing' = 'existing';
      await database.withExclusiveTransactionAsync(async transaction => {
        const existing = await transaction.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=? OR request_id=?', input.id, input.requestId);
        if (existing) {
          if (existing.id !== input.id || existing.request_id !== input.requestId || existing.conversation_id !== input.conversationId ||
              existing.speaker !== input.speaker || existing.origin_mode !== input.originMode || existing.source_language !== input.sourceLanguage ||
              existing.target_language !== input.targetLanguage || existing.original_text !== input.originalText) {
            throw new Error('Message/request ID belongs to different input.');
          }
          return;
        }
        const time = now();
        // Parent existence is checked on the transaction connection as well as by its foreign key.
        await touch(transaction, input.conversationId, time);
        await transaction.runAsync(`INSERT INTO messages (id,request_id,conversation_id,speaker,origin_mode,source_language,target_language,original_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,'pending',?,?)`, input.id,input.requestId,input.conversationId,input.speaker,input.originMode,input.sourceLanguage,input.targetLanguage,input.originalText,time,time);
        outcome = 'created';
      });
      return outcome;
    },
    async retryMessage(id: string, requestId: string) {
      let claimed = false;
      await database.withExclusiveTransactionAsync(async transaction => {
        const row = await transaction.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id=? AND request_id=?', id,requestId);
        if (!row) throw new Error('Message/request does not exist.');
        if (!['failed','interrupted'].includes(row.status)) return;
        const time = now();
        await transaction.runAsync("UPDATE messages SET status='pending',processing_attempt=processing_attempt+1,error_code=NULL,error_message=NULL,updated_at=max(updated_at,?) WHERE id=?", time,id);
        await touch(transaction,row.conversation_id,time);
        claimed = true;
      });
      return claimed;
    },
    async finishRequest(id: string, requestId: string, result: { status: 'ready'; originalText: string; translatedText: string; originalPronunciation?: string; translatedPronunciation?: string } | { status: 'failed'; errorCode: string; errorMessage: string }, expectedAttempt?: number) {
      let changed = false;
      await database.withExclusiveTransactionAsync(async transaction => {
        const row = await transaction.getFirstAsync<MessageRow>("SELECT * FROM messages WHERE id=? AND request_id=? AND status='pending' AND (? IS NULL OR processing_attempt=?)", id,requestId,expectedAttempt ?? null,expectedAttempt ?? null);
        if (!row) return;
        const time = now();
        if (result.status === 'ready') {
          await transaction.runAsync("UPDATE messages SET status='ready',original_text=?,translated_text=?,original_pronunciation=?,translated_pronunciation=?,error_code=NULL,error_message=NULL,updated_at=max(updated_at,?) WHERE id=?", result.originalText,result.translatedText,result.originalPronunciation ?? null,result.translatedPronunciation ?? null,time,id);
        } else {
          await transaction.runAsync("UPDATE messages SET status='failed',error_code=?,error_message=?,updated_at=max(updated_at,?) WHERE id=?", result.errorCode,result.errorMessage,time,id);
        }
        await touch(transaction,row.conversation_id,time);
        changed = true;
      });
      return changed;
    },
  };
}
