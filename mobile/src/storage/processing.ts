import type { createAudioStorage, AudioFormat } from './audio';
import type { createHistoryRepository, DraftMessageInput, MessageRow } from './history';

type History = ReturnType<typeof createHistoryRepository>;
type Audio = ReturnType<typeof createAudioStorage>;
export type ProcessingResult = { originalText: string; translatedText: string; originalPronunciation?: string; translatedPronunciation?: string };
// Endpoint-specific controllers map this durable input to allowlisted transport payloads.
// Local IDs are for local ownership only; do not serialize this row to the server.
export type SavedMessageProcessor = (input: { message: MessageRow; sourceAudio: Awaited<ReturnType<Audio['resolve']>> }, signal: AbortSignal) => Promise<ProcessingResult>;

export function createSavedMessageFlow(history: History, audio: Audio) {
  const active = new Map<string, AbortController>();
  let recovering = false;
  return {
    saveTextDraft(input: Omit<DraftMessageInput, 'inputKind'>) {
      return history.saveDraft({ ...input,inputKind: 'text' });
    },
    async saveVoiceDraft(input: Omit<DraftMessageInput, 'inputKind'>, recording: { uri: string } | { bytes: Uint8Array }, metadata: { format: AudioFormat; mimeType: string; durationMs?: number }) {
      await history.saveDraft({ ...input,inputKind: 'voice' });
      const owner = { kind: 'message' as const,id: input.id,role: 'source' as const };
      const existing = await audio.resolve(owner);
      if (existing) throw new Error('This draft already has a source recording.');
      await audio.save(owner,recording,metadata);
    },
    // Call once on cold startup, before enabling send/retry; never on ordinary navigation.
    async recoverOnStartup() {
      if (active.size || recovering) throw new Error('Cannot run startup recovery while processing is active.');
      recovering = true;
      try { return await history.recoverInterruptedRequests(); }
      finally { recovering = false; }
    },
    async processSaved(id: string, processor: SavedMessageProcessor) {
      if (recovering || active.has(id)) return 'busy' as const;
      const controller = new AbortController();
      active.set(id,controller);
      try {
        const draft = await history.getMessage(id);
        if (!draft) throw new Error('Saved message does not exist.');
        const sourceAudio = draft.input_kind === 'voice' ? await audio.resolve({ kind:'message',id,role:'source' }) : null;
        if (draft.input_kind === 'voice' && !sourceAudio?.uri) throw new Error('Saved source recording is unavailable.');
        const message = await history.beginAttempt(id);
        if (!message) return 'not-claimed' as const;
        let result: ProcessingResult;
        try {
          if (controller.signal.aborted) throw new Error('Processing was interrupted.');
          result = await processor({ message,sourceAudio },controller.signal);
          if (controller.signal.aborted) throw new Error('Processing was interrupted.');
        } catch (error) {
          // A DB failure here propagates: never claim the failure state was saved.
          await history.finishRequest(id,message.request_id!,{ status:'failed',errorCode: controller.signal.aborted ? 'interrupted' : 'processing_failed',errorMessage: error instanceof Error ? error.message : 'Processing failed.' },message.processing_attempt);
          throw error;
        }
        // Keep local-save errors distinct from remote failures; startup recovery can
        // expose a still-pending row for deliberate retry if this write fails.
        const saved = await history.finishRequest(id,message.request_id!,{ status:'ready',...result },message.processing_attempt);
        return saved ? 'ready' as const : 'stale' as const;
      } finally { active.delete(id); }
    },
    cancel(id: string) { active.get(id)?.abort(); },
  };
}
