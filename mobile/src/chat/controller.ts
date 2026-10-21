import type { createHistoryRepository, MessageRow, ConversationRow, HistoryCursor, MessageCursor, ReadyLiveMessageInput } from '../storage/history';
import type { createSavedMessageFlow, SavedMessageProcessor } from '../storage/processing';
import type { createDeletionService, DeletionReport } from '../storage/deletion';
import type { createAudioStorage } from '../storage/audio';
import type { TextTranslationInput } from '../adapters/textChat';
import { getSupportedTtsLanguage, type TranslatedMessage } from '../shared';

export type ChatState = {
  messages: MessageRow[]; conversation: ConversationRow | null; conversations: ConversationRow[];
  myLanguage: string; theirLanguage: string; historyQuery: string;
  historyCursor: HistoryCursor | null; messageCursor: MessageCursor | null;
  busy: boolean; historyBusy: boolean; error: string | null; notice: string | null; maintenancePending: boolean;
  voiceRequest: { id: string; phase: 'uploading' | 'processing' } | null;
};
export const INITIAL_CHAT_STATE: ChatState = { messages: [], conversation: null, conversations: [],
  myLanguage: 'en', theirLanguage: 'es', historyQuery: '', historyCursor: null, messageCursor: null,
  busy: false, historyBusy: false, error: null, notice: null, maintenancePending: false, voiceRequest: null };

export function createTextChatController(
  history: ReturnType<typeof createHistoryRepository>,
  flow: ReturnType<typeof createSavedMessageFlow>,
  translate: (input: TextTranslationInput) => Promise<TranslatedMessage>,
  newId: () => string,
  initialConversationId = 'mobile-text-chat',
  deletion?: Pick<ReturnType<typeof createDeletionService>, 'delete' | 'retryMaintenance'>,
  voiceProcessor?: SavedMessageProcessor,
  audioStorage?: ReturnType<typeof createAudioStorage>,
) {
  let state: ChatState = { ...INITIAL_CHAT_STATE };
  let searchRevision = 0;
  let interruption = 0;
  const listeners = new Set<(state: ChatState) => void>();
  const locked = () => state.busy || state.historyBusy;
  function update(change: Partial<ChatState>) {
    state = { ...state, ...change };
    listeners.forEach(listener => listener(state));
  }
  async function refreshHistory() {
    const page = await history.listConversationPage(state.historyQuery);
    update({ conversations: page.items, historyCursor: page.cursor });
  }
  function mergeMessages(...groups: MessageRow[][]) {
    const rows = new Map(groups.flat().map(row => [row.id, row]));
    return [...rows.values()].sort((a, b) => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  async function refresh(messageId?: string) {
    const id = state.conversation?.id;
    if (!id) return;
    const page = await history.listMessagePage(id);
    const message = messageId ? await history.getMessage(messageId) : null;
    update({ messages: mergeMessages(state.messages, page.items, message ? [message] : []),
      conversation: await history.getConversation(id) });
    await refreshHistory();
  }
  async function refreshSavedMessage(conversationId: string, messageId?: string) {
    if (state.conversation?.id === conversationId) await refresh(messageId);
    else await refreshHistory();
  }
  async function activate(conversation: ConversationRow | null) {
    const myLanguage = conversation?.my_language ?? state.myLanguage;
    const theirLanguage = conversation?.their_language ?? state.theirLanguage;
    await history.selectChatConversation(conversation?.id ?? null, myLanguage, theirLanguage);
    const page = conversation ? await history.listMessagePage(conversation.id) : { items: [], cursor: null };
    update({ conversation, myLanguage, theirLanguage, messages: page.items, messageCursor: page.cursor });
  }
  async function change(task: () => Promise<void>) {
    if (locked()) return false;
    update({ busy: true, error: null, notice: null });
    try { await task(); return true; }
    catch (error) { update({ error: error instanceof Error ? error.message : 'Could not update local history. Please try again.' }); return false; }
    finally { update({ busy: false }); }
  }
  async function process(id: string) {
    const revision = interruption;
    try {
      const outcome = await flow.processSaved(id, async (input, signal) => {
        const { message } = input;
        // The pending row is committed before displaying it or sending remotely.
        await refresh(id);
        if (message.input_kind === 'voice') {
          if (revision !== interruption) throw new Error('Voice translation interrupted. Tap Retry when you return.');
          if (!voiceProcessor) throw new Error('Voice translation is unavailable.');
          update({ voiceRequest: { id, phase: 'uploading' } });
          return voiceProcessor(input, signal);
        }
        return translate({ text: message.original_text, sourceLanguage: { code: message.source_language },
          targetLanguage: { code: message.target_language }, signal });
      });
      if (outcome !== 'ready') throw new Error('Message was not confirmed saved. Reopen Chat before retrying.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Translation failed.';
      update({ error: error instanceof TypeError
        ? 'Could not reach the translation service. Check your connection and tap Retry on the saved message.' : detail });
    } finally {
      update({ voiceRequest: null });
      try { await refresh(id); }
      catch { update({ error: 'Could not read local history. Message save status is unconfirmed. Reopen the app before retrying.' }); }
    }
  }
  function maintenanceNotice(report: Pick<DeletionReport, 'maintenanceErrors' | 'cleanup'>) {
    const maintenancePending = report.maintenanceErrors.length > 0 || !!report.cleanup?.failures.length;
    update({ maintenancePending, notice: maintenancePending
      ? 'Conversation deleted. Some storage cleanup is still pending. Tap Retry storage cleanup.'
      : 'Conversation permanently deleted.' });
  }
  return {
    beginLiveCapture() {
      if (locked() || !state.conversation) return null;
      const conversation = { ...state.conversation };
      const languages = { myLanguage: state.myLanguage, theirLanguage: state.theirLanguage };
      let released = false;
      update({ busy: true, error: null, notice: null });
      return {
        conversation,
        languages,
        release() {
          if (released) return;
          released = true;
          update({ busy: false });
        },
      };
    },
    async saveLiveAudioDraft(input: {
      conversationId: string;
      originMode: 'chat' | 'single' | 'conversation';
      sourceLanguage: string;
      targetLanguage: string;
      speaker?: 'me' | 'them';
    }, recording: { uri: string; durationMs: number }) {
      if (!audioStorage) throw new Error('Phone audio storage is unavailable.');
      const id = newId();
      const requestId = newId();
      const speaker = input.speaker ?? 'me';
      await flow.saveVoiceDraft({ id, requestId, conversationId: input.conversationId, speaker, originMode: input.originMode,
        sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, originalText: '' },
      { uri: recording.uri }, { format: 'm4a', mimeType: 'audio/mp4', durationMs: recording.durationMs });
      return { id, requestId };
    },
    async saveLiveMessage(input: ReadyLiveMessageInput, recording?: { uri: string; durationMs: number }) {
      await history.saveReadyLiveMessage(input);
      if (recording) {
        if (!audioStorage) throw new Error('Phone audio storage is unavailable.');
        const owner = { kind: 'message' as const, id: input.id, role: 'source' as const };
        if (!(await audioStorage.resolve(owner))) {
          await audioStorage.save(owner, { uri: recording.uri }, { format: 'm4a', mimeType: 'audio/mp4', durationMs: recording.durationMs });
        }
      }
      await refreshSavedMessage(input.conversationId, input.id);
      return input.id;
    },
    async finishLiveDraft(input: ReadyLiveMessageInput) {
      const changed = await history.finishLiveDraft(input);
      await refreshSavedMessage(input.conversationId, input.id);
      return changed;
    },
    async refreshSavedMessage(conversationId: string, messageId?: string) {
      await refreshSavedMessage(conversationId, messageId);
    },
    voiceResponseReceived() {
      if (state.voiceRequest) update({ voiceRequest: { ...state.voiceRequest, phase: 'processing' } });
    },
    interruptVoiceRequest() { interruption++; if (state.voiceRequest) flow.cancel(state.voiceRequest.id); },
    beginVoiceCapture(options?: {
      originMode?: 'chat' | 'single' | 'conversation';
      speaker?: 'me' | 'them';
      sourceLanguage?: string;
      targetLanguage?: string;
    }) {
      if (locked() || !state.conversation) return null;
      const conversation = state.conversation;
      const originMode = options?.originMode ?? (conversation.origin_mode === 'single' || conversation.origin_mode === 'conversation' ? conversation.origin_mode : 'chat');
      const speaker = options?.speaker ?? 'me';
      const sourceLanguage = options?.sourceLanguage ?? (speaker === 'me' ? conversation.my_language : conversation.their_language);
      const targetLanguage = options?.targetLanguage ?? (speaker === 'me' ? conversation.their_language : conversation.my_language);
      const id = newId(), requestId = newId();
      let finished = false;
      let saving = false;
      update({ busy: true, error: null, notice: null });
      return {
        cancel() { if (!finished) { finished = true; update({ busy: false }); } },
        async save(uri: string, durationMs: number, dispatch: boolean | (() => boolean) = true) {
          if (finished || saving) return;
          saving = true;
          try {
            if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Recording is empty. Record again.');
            // Keep the lease on failure so the same recording/IDs can be saved again.
            await flow.saveVoiceDraft({ id, requestId, conversationId: conversation.id, speaker, originMode,
              sourceLanguage, targetLanguage, originalText: '' },
            { uri }, { format: 'm4a', mimeType: 'audio/mp4', durationMs });
            finished = true;
            try { await refresh(id); }
            finally { update({ notice: 'Recording saved on this phone.' }); }
            if ((typeof dispatch === 'function' ? dispatch() : dispatch) && voiceProcessor) await process(id);
            update({ busy: false });
          } finally { saving = false; if (finished) update({ busy: false }); }
        },
      };
    },
    getState: () => state,
    subscribe(listener: (state: ChatState) => void) {
      listeners.add(listener); listener(state);
      return () => { listeners.delete(listener); };
    },
    async initialize() {
      await flow.recoverOnStartup();
      const preferences = await history.getChatPreferences();
      const pair = preferences.pair as { myLanguage?: unknown; theirLanguage?: unknown } | null;
      update({ myLanguage: getSupportedTtsLanguage(pair?.myLanguage)?.code ?? 'en',
        theirLanguage: getSupportedTtsLanguage(pair?.theirLanguage)?.code ?? 'es' });
      let conversation = typeof preferences.activeId === 'string' ? await history.getConversation(preferences.activeId) : null;
      conversation ??= (await history.listConversations(1))[0] ?? null;
      // Only first use creates the legacy default; deleting the last chat stays empty after restart.
      if (!conversation && preferences.activeId === undefined) {
        await history.startChatConversation(initialConversationId, state.myLanguage, state.theirLanguage);
        conversation = await history.getConversation(initialConversationId);
      }
      await activate(conversation);
      await refreshHistory();
    },
    async newConversation() {
      return this.newModeConversation('chat');
    },
    async newModeConversation(originMode: 'chat' | 'single' | 'conversation' = 'chat', title?: string) {
      return change(async () => {
        const id = newId();
        const defaultTitle = originMode === 'single' ? 'Single session' : originMode === 'conversation' ? 'Two-way conversation' : 'New chat';
        await history.createConversation({
          id,
          title: title || defaultTitle,
          originMode,
          myLanguage: state.myLanguage,
          theirLanguage: state.theirLanguage,
        });
        await history.selectChatConversation(id, state.myLanguage, state.theirLanguage, false);
        await activate(await history.getConversation(id));
        await refreshHistory();
      });
    },
    async ensureConversationForMode(mode: 'chat' | 'single' | 'conversation') {
      if (state.conversation?.origin_mode === mode) return true;
      return change(async () => {
        const recent = await history.listConversations(50);
        const existing = recent.find(c => c.origin_mode === mode);
        if (existing) {
          await activate(existing);
          return;
        }
        const id = newId();
        const defaultTitle = mode === 'single' ? 'Single session' : mode === 'conversation' ? 'Two-way conversation' : 'New chat';
        await history.createConversation({
          id,
          title: defaultTitle,
          originMode: mode,
          myLanguage: state.myLanguage,
          theirLanguage: state.theirLanguage,
        });
        await history.selectChatConversation(id, state.myLanguage, state.theirLanguage, false);
        const created = await history.getConversation(id);
        await activate(created);
        await refreshHistory();
      });
    },
    async openConversation(id: string) {
      return change(async () => {
        const conversation = await history.getConversation(id);
        if (!conversation) throw new Error('This conversation is no longer available.');
        await activate(conversation);
      });
    },
    async setLanguages(myLanguage: string, theirLanguage: string, mode: 'chat' | 'single' | 'conversation' = 'chat') {
      if (state.conversation && state.conversation.origin_mode !== mode) {
        update({ error: `This saved ${state.conversation.origin_mode} conversation is read-only here. Open its matching mode to change languages.` });
        return false;
      }
      return change(async () => {
        const mine = getSupportedTtsLanguage(myLanguage), theirs = getSupportedTtsLanguage(theirLanguage);
        if (!mine || !theirs) throw new Error('Choose supported languages.');
        await history.selectChatConversation(state.conversation?.id ?? null, mine.code, theirs.code, true);
        update({ myLanguage: mine.code, theirLanguage: theirs.code,
          conversation: state.conversation ? { ...state.conversation, my_language: mine.code, their_language: theirs.code } : null });
        await refreshHistory();
      });
    },
    async swapLanguages(mode: 'chat' | 'single' | 'conversation' = 'chat') {
      if (state.conversation && state.conversation.origin_mode !== mode) {
        update({ error: `This saved ${state.conversation.origin_mode} conversation is read-only here. Open its matching mode to change languages.` });
        return false;
      }
      if (state.myLanguage === state.theirLanguage) return !locked();
      return this.setLanguages(state.theirLanguage, state.myLanguage, mode);
    },
    async searchHistory(query: string) {
      if (state.busy) return false;
      const revision = ++searchRevision;
      update({ historyQuery: query, historyBusy: true, error: null });
      try {
        const page = await history.listConversationPage(query);
        if (revision === searchRevision) update({ conversations: page.items, historyCursor: page.cursor });
        return true;
      } catch { if (revision === searchRevision) update({ error: 'Could not search local history. Please try again.' }); return false; }
      finally { if (revision === searchRevision) update({ historyBusy: false }); }
    },
    async loadMoreHistory() {
      if (locked() || !state.historyCursor) return;
      const revision = searchRevision;
      update({ historyBusy: true, error: null });
      try {
        const page = await history.listConversationPage(state.historyQuery, state.historyCursor);
        if (revision === searchRevision) update({ conversations: [...new Map([...state.conversations, ...page.items].map(row => [row.id, row])).values()], historyCursor: page.cursor });
      } catch { if (revision === searchRevision) update({ error: 'Could not load more history. Please try again.' }); }
      finally { if (revision === searchRevision) update({ historyBusy: false }); }
    },
    async loadOlderMessages() {
      return change(async () => {
        if (!state.conversation || !state.messageCursor) return;
        const page = await history.listMessagePage(state.conversation.id, state.messageCursor);
        update({ messages: mergeMessages(page.items, state.messages), messageCursor: page.cursor });
      });
    },
    async deleteConversation(id: string) {
      return change(async () => {
        if (!deletion) throw new Error('Deletion is unavailable.');
        const report = await deletion.delete({ kind: 'conversation', id });
        if (report.status === 'cancelled') return;
        if (report.status === 'changed') throw new Error('This conversation changed while confirmation was open. Review it and try deleting again.');
        // Reflect the committed deletion before any subsequent selection/read
        // can fail; never leave a deleted row looking available in History.
        update({ conversations: state.conversations.filter(row => row.id !== id) });
        if (report.status === 'deleted') maintenanceNotice(report);
        if (state.conversation?.id === id) {
          update({ conversation: null, messages: [], messageCursor: null });
          await activate((await history.listConversations(1))[0] ?? null);
        }
        await refreshHistory();
      });
    },
    async retryStorageCleanup() {
      return change(async () => {
        if (!deletion) throw new Error('Storage cleanup is unavailable.');
        maintenanceNotice(await deletion.retryMaintenance());
      });
    },
    async send(text: string): Promise<boolean> {
      if (locked() || !text.trim() || !state.conversation || state.conversation.origin_mode !== 'chat') return false;
      update({ busy: true, error: null, notice: null });
      let saved = false;
      try {
        const conversation = state.conversation;
        const id = newId();
        await flow.saveTextDraft({ id, requestId: newId(), conversationId: conversation.id, speaker: 'me', originMode: 'chat',
          sourceLanguage: conversation.my_language, targetLanguage: conversation.their_language, originalText: text });
        saved = true;
        await process(id);
      } catch {
        update({ error: 'Message was not confirmed saved locally. Your typed text has been kept; reopen the app before sending again.' });
      } finally { update({ busy: false }); }
      return saved;
    },
    async retry(id: string) {
      if (locked()) return;
      update({ busy: true, error: null, notice: null });
      try {
        const message = await history.getMessage(id);
        if (!message || message.conversation_id !== state.conversation?.id ||
            !['draft', 'failed', 'interrupted'].includes(message.status)) return;
        await process(id);
      } catch { update({ error: 'Could not load the saved message. No retry was sent.' }); }
      finally { update({ busy: false }); }
    },
  };
}
