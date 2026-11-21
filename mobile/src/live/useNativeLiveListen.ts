import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  AudioPlaybackCoordinator,
  configureNativeAudioSession,
  RecordingPresets,
  requestNativeMicrophoneAccess,
  useNativeAudioRecorder,
  useNativeAudioRecorderState,
} from '../adapters/audio';
import { nativeLiveApi, type LiveListenSegment } from '../adapters/live';
import { ProcessingApiError } from '../adapters/processingTransport';
import type { ChatState, createTextChatController } from '../chat/controller';
import { ensureConversationVoiceClone, getNativeAudioStorage } from '../chat/native';
import type { LiveQueueItem } from './livePlaybackQueue';
import {
  IDLE_ROLLOVER_MS,
  MAX_CHUNK_MS,
  MIN_SPEECH_MS,
  SILENCE_FINALIZE_MS,
  SPEECH_DBFS_THRESHOLD,
  selectNativeSegmentAudioForPersistence,
} from './liveListenHelpers';

export { selectNativeSegmentAudioForPersistence };

type Chat = ReturnType<typeof createTextChatController>;
type LiveLease = NonNullable<ReturnType<Chat['beginLiveCapture']>>;

export type NativeLiveListenStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';

export type NativeLivePreviewDraft = {
  sourceLanguageCode: string;
  sourceLanguageLabel: string;
  targetLanguageCode: string;
  targetLanguageLabel: string;
  transcript: string;
  translatedText: string;
};

export function useNativeLiveListen({
  chat,
  state,
  isPlaybackActive = false,
  onEnqueuePlayback,
  onBeforeStart,
}: {
  chat: Chat | null;
  state: ChatState;
  isPlaybackActive?: boolean;
  onEnqueuePlayback?: (item: LiveQueueItem) => void;
  onBeforeStart?: () => void;
}) {
  const isFocused = useIsFocused();
  const [status, setStatus] = useState<NativeLiveListenStatus>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewDraft, setPreviewDraft] = useState<NativeLivePreviewDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const recorder = useNativeAudioRecorder(
    {
      ...RecordingPresets.HIGH_QUALITY,
      directory: 'document',
      isMeteringEnabled: true,
    },
    recStatus => {
      if (recStatus.hasError || recStatus.mediaServicesDidReset) {
        setError(recStatus.error || 'The microphone was interrupted.');
        void stopRef.current('interruption');
      }
    },
  );
  const recorderState = useNativeAudioRecorderState(recorder, 100);

  const chatRef = useRef(chat);
  const stateRef = useRef(state);
  const playbackActiveRef = useRef(isPlaybackActive);
  const onEnqueueRef = useRef(onEnqueuePlayback);
  const onBeforeStartRef = useRef(onBeforeStart);

  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { playbackActiveRef.current = isPlaybackActive; }, [isPlaybackActive]);
  useEffect(() => { onEnqueueRef.current = onEnqueuePlayback; }, [onEnqueuePlayback]);
  useEffect(() => { onBeforeStartRef.current = onBeforeStart; }, [onBeforeStart]);

  const leaseRef = useRef<LiveLease | null>(null);
  const mountedRef = useRef(false);
  const activeRef = useRef(false);
  const cancelledRef = useRef(false);
  const statusRef = useRef<NativeLiveListenStatus>(status);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const sessionStartedAtRef = useRef(0);
  const chunkStartedAtRef = useRef(0);
  const speechStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const chunkRotatingRef = useRef(false);
  const chunkSeqRef = useRef(0);
  const contextRef = useRef<{
    conversationId: string;
    myLanguage: string;
    theirLanguage: string;
    sessionId: string;
  } | null>(null);
  const pendingUploadsRef = useRef(new Set<Promise<void>>());
  const stopRef = useRef<(reason: 'user' | 'navigation' | 'interruption') => Promise<void>>(async () => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopRef.current('navigation');
    };
  }, []);

  useEffect(() => {
    if (status !== 'listening') return;
    const timer = setInterval(() => {
      if (sessionStartedAtRef.current > 0 && mountedRef.current) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000)));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [status]);

  function setUiStatus(next: NativeLiveListenStatus) {
    statusRef.current = next;
    if (mountedRef.current) setStatus(next);
  }

  function safeRecorderUri(): string | null {
    try {
      const raw = recorder.uri || recorder.getStatus()?.url || null;
      if (!raw) return null;
      return raw.startsWith('file://') ? raw : `file://${raw}`;
    } catch {
      return null;
    }
  }

  function safeRecorderDurationMs(): number {
    try {
      const statusDuration = Number(recorder.getStatus()?.durationMillis) || 0;
      const wallElapsed = chunkStartedAtRef.current > 0 ? Date.now() - chunkStartedAtRef.current : 0;
      return Math.max(statusDuration, recorderState.durationMillis, Math.round((recorder.currentTime || 0) * 1000), wallElapsed);
    } catch {
      return recorderState.durationMillis || 0;
    }
  }

  async function processFinalizedRecording(
    uri: string,
    durationMs: number,
    context: NonNullable<typeof contextRef.current>,
    chunkId: string,
  ) {
    const currentChat = chatRef.current;
    if (!currentChat) return;

    const filename = `${chunkId}.m4a`.replace(/[^a-zA-Z0-9_.-]/g, '_');

    try {
      const response = await nativeLiveApi.processLiveListenChunk({
        uri,
        mimeType: 'audio/mp4',
        filename,
        listenerLanguage: context.myLanguage,
        theirLanguage: context.theirLanguage,
        chunkId,
        isPreview: false,
      });

      if (mountedRef.current) {
        setPreviewDraft(null);
      }

      if (!response.segments.length) return;

      for (let index = 0; index < response.segments.length; index += 1) {
        const segment = response.segments[index];
        const msgId = `live_${chunkId}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
        const reqId = `live_req_${chunkId}_${index}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
        const attachedRecording = selectNativeSegmentAudioForPersistence(segment, index, { uri, durationMs });

        await currentChat.saveLiveMessage(
          {
            id: msgId,
            requestId: reqId,
            conversationId: context.conversationId,
            speaker: segment.sender === 'partner' ? 'them' : 'me',
            originMode: 'chat',
            sourceLanguage: segment.sourceLanguage.code,
            targetLanguage: segment.targetLanguage.code,
            originalText: segment.transcript,
            translatedText: segment.translatedText,
            originalPronunciation: segment.originalPronunciation,
            translatedPronunciation: segment.translatedPronunciation,
          },
          attachedRecording,
        );

        if (attachedRecording && segment.detectedLanguage.isSupportedTts) {
          void ensureConversationVoiceClone(context.conversationId, segment.sourceLanguage.code);
        }

        if (segment.needsPlayback && segment.translatedText.trim()) {
          onEnqueueRef.current?.({
            messageId: msgId,
            text: segment.translatedText,
            languageCode: segment.targetLanguage.code,
            sourceLanguageCode: segment.sourceLanguage.code,
            needsPlayback: true,
          });
        }
      }
    } catch (uploadError) {
      if (uploadError instanceof ProcessingApiError && uploadError.status === 422) {
        return;
      }

      // Preserve failed live chunks as retryable SQLite voice drafts (never losing user speech).
      const savedDraft = await currentChat
        .saveLiveAudioDraft(
          {
            conversationId: context.conversationId,
            originMode: 'chat',
            sourceLanguage: context.theirLanguage,
            targetLanguage: context.myLanguage,
            speaker: 'them',
          },
          { uri, durationMs: Math.max(250, Math.round(durationMs)) },
        )
        .catch(() => null);
      if (savedDraft?.id) {
        await currentChat.refreshSavedMessage(context.conversationId, savedDraft.id).catch(() => undefined);
      }

      if (mountedRef.current) {
        setError(
          uploadError instanceof Error && uploadError.message
            ? uploadError.message
            : 'Live audio chunk saved locally. Tap Retry on the draft to process it.',
        );
      }
    }
  }

  const rotateChunk = useCallback(
    async ({ discard = false, restart = true }: { discard?: boolean; restart?: boolean } = {}) => {
      if (chunkRotatingRef.current) return;
      chunkRotatingRef.current = true;
      try {
        const preDuration = safeRecorderDurationMs();
        if (recorder.getStatus()?.isRecording) {
          await recorder.stop().catch(() => undefined);
        }
        const uri = safeRecorderUri();

        if (restart && activeRef.current && !cancelledRef.current && AppState.currentState === 'active') {
          await recorder.prepareToRecordAsync();
          if (activeRef.current && !cancelledRef.current && AppState.currentState === 'active') {
            recorder.record();
            chunkStartedAtRef.current = Date.now();
          }
        }

        speechStartedAtRef.current = 0;
        lastSpeechAtRef.current = 0;

        const context = contextRef.current;
        if (!discard && uri && preDuration >= 250 && context) {
          const chunkId = `${context.sessionId}_${++chunkSeqRef.current}`;
          const task = processFinalizedRecording(uri, preDuration, context, chunkId).finally(() => {
            pendingUploadsRef.current.delete(task);
          });
          pendingUploadsRef.current.add(task);
        }
      } finally {
        chunkRotatingRef.current = false;
      }
    },
    [recorder, recorderState.durationMillis],
  );

  const rotateChunkRef = useRef(rotateChunk);
  useEffect(() => {
    rotateChunkRef.current = rotateChunk;
  }, [rotateChunk]);

  const stopListening = useCallback(
    async (_reason: 'user' | 'navigation' | 'interruption' = 'user') => {
      if (stopPromiseRef.current) return stopPromiseRef.current;
      if (statusRef.current === 'idle') return;

      const task = (async () => {
        cancelledRef.current = true;
        activeRef.current = false;
        setUiStatus('stopping');

        const hasActiveSpeech = speechStartedAtRef.current > 0;
        await rotateChunkRef.current({ discard: !hasActiveSpeech, restart: false });

        const inFlight = [...pendingUploadsRef.current];
        if (inFlight.length > 0) {
          await Promise.race([
            Promise.allSettled(inFlight),
            new Promise<void>(resolve => setTimeout(resolve, 4_000)),
          ]);
        }

        AudioPlaybackCoordinator.setLiveListenActive(false);
        await configureNativeAudioSession(false).catch(() => undefined);
        leaseRef.current?.release();
        leaseRef.current = null;
        contextRef.current = null;
        speechStartedAtRef.current = 0;
        lastSpeechAtRef.current = 0;
        chunkStartedAtRef.current = 0;
        sessionStartedAtRef.current = 0;

        if (mountedRef.current) {
          setElapsedSeconds(0);
          setPreviewDraft(null);
          setUiStatus('idle');
        }
        stopPromiseRef.current = null;
      })();

      stopPromiseRef.current = task;
      return task;
    },
    [],
  );

  useEffect(() => {
    stopRef.current = stopListening;
  }, [stopListening]);

  const startListening = useCallback(async () => {
    const currentChat = chatRef.current;
    if (
      !currentChat ||
      !isFocused ||
      statusRef.current === 'starting' ||
      statusRef.current === 'listening' ||
      statusRef.current === 'stopping'
    ) {
      return false;
    }

    if (AudioPlaybackCoordinator.isRecording()) {
      setError('Stop the current recording before starting live listening.');
      return false;
    }

    onBeforeStartRef.current?.();
    setError('');
    setNotice('');
    setPreviewDraft(null);

    const lease = currentChat.beginLiveCapture();
    if (!lease) return false;

    const sessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    contextRef.current = {
      conversationId: lease.conversation.id,
      myLanguage: lease.languages.myLanguage,
      theirLanguage: lease.languages.theirLanguage,
      sessionId,
    };
    leaseRef.current = lease;
    cancelledRef.current = false;
    activeRef.current = false;
    chunkSeqRef.current = 0;
    setUiStatus('starting');

    try {
      const permission = await requestNativeMicrophoneAccess();
      if (!permission.granted) {
        throw new Error('Microphone access is off. Enable it in Settings to listen live.');
      }
      if (cancelledRef.current || AppState.currentState !== 'active') {
        throw new Error('Live listening stopped before starting.');
      }

      AudioPlaybackCoordinator.setLiveListenActive(true);
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      recorder.record();

      const nowMs = Date.now();
      activeRef.current = true;
      sessionStartedAtRef.current = nowMs;
      chunkStartedAtRef.current = nowMs;
      speechStartedAtRef.current = 0;
      lastSpeechAtRef.current = 0;
      setUiStatus('listening');
      return true;
    } catch (startError) {
      cancelledRef.current = true;
      activeRef.current = false;
      if (recorder.getStatus()?.isRecording) {
        await recorder.stop().catch(() => undefined);
      }
      AudioPlaybackCoordinator.setLiveListenActive(false);
      await configureNativeAudioSession(false).catch(() => undefined);
      lease.release();
      leaseRef.current = null;
      contextRef.current = null;
      setUiStatus('idle');
      setError(
        startError instanceof Error && startError.message
          ? startError.message
          : 'Live listening could not start.',
      );
      return false;
    }
  }, [isFocused, recorder]);

  useEffect(() => {
    if (status !== 'listening' || !activeRef.current || chunkRotatingRef.current) {
      return;
    }

    const nowMs = Date.now();
    // Gate VAD metering while local translated TTS audio is playing to avoid echo loops.
    if (playbackActiveRef.current) {
      if (
        speechStartedAtRef.current > 0 &&
        (lastSpeechAtRef.current || nowMs) - speechStartedAtRef.current >= MIN_SPEECH_MS
      ) {
        void rotateChunkRef.current({ discard: false, restart: true });
      } else {
        speechStartedAtRef.current = 0;
        lastSpeechAtRef.current = 0;
      }
      return;
    }

    const metering = recorderState.metering;
    if (typeof metering === 'number' && metering >= SPEECH_DBFS_THRESHOLD) {
      if (!speechStartedAtRef.current) {
        speechStartedAtRef.current = nowMs;
      }
      lastSpeechAtRef.current = nowMs;

      if (nowMs - speechStartedAtRef.current >= MAX_CHUNK_MS) {
        void rotateChunkRef.current({ discard: false, restart: true });
      }
      return;
    }

    if (speechStartedAtRef.current) {
      const speechDuration = (lastSpeechAtRef.current || speechStartedAtRef.current) - speechStartedAtRef.current;
      const silenceDuration = nowMs - (lastSpeechAtRef.current || speechStartedAtRef.current);

      if (silenceDuration >= SILENCE_FINALIZE_MS) {
        if (speechDuration >= MIN_SPEECH_MS) {
          void rotateChunkRef.current({ discard: false, restart: true });
        } else {
          void rotateChunkRef.current({ discard: true, restart: true });
        }
      }
      return;
    }

    if (chunkStartedAtRef.current > 0 && nowMs - chunkStartedAtRef.current >= IDLE_ROLLOVER_MS) {
      void rotateChunkRef.current({ discard: true, restart: true });
    }
  }, [status, recorderState.metering, recorderState.durationMillis]);

  useEffect(() => {
    if (!isFocused && (statusRef.current === 'starting' || statusRef.current === 'listening')) {
      void stopRef.current('navigation');
    }
  }, [isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (
        nextState !== 'active' &&
        (statusRef.current === 'starting' || statusRef.current === 'listening')
      ) {
        void stopRef.current('interruption');
      }
    });
    return () => subscription.remove();
  }, []);

  const retryDraft = useCallback(
    async (messageId: string): Promise<boolean> => {
      const currentChat = chatRef.current;
      const conversationId = stateRef.current.conversation?.id;
      const audioStorage = getNativeAudioStorage();
      if (!currentChat || !conversationId || !audioStorage) return false;

      const resolved = await audioStorage.resolve({ kind: 'message', id: messageId, role: 'source' });
      if (!resolved?.uri || resolved.availability !== 'available') {
        await currentChat.retry(messageId);
        return false;
      }

      try {
        const res = await nativeLiveApi.processLiveListenChunk({
          uri: resolved.uri,
          mimeType: resolved.mime_type || 'audio/mp4',
          filename: resolved.file_name || 'retry_live_chunk.m4a',
          listenerLanguage: stateRef.current.myLanguage,
          theirLanguage: stateRef.current.theirLanguage,
          isPreview: false,
        });

        if (!res.segments.length) return false;

        const first = res.segments[0];
        await currentChat.finishLiveDraft({
          id: messageId,
          requestId: stateRef.current.messages.find(m => m.id === messageId)?.request_id || messageId,
          conversationId,
          speaker: first.sender === 'partner' ? 'them' : 'me',
          originMode: 'chat',
          sourceLanguage: first.sourceLanguage.code,
          targetLanguage: first.targetLanguage.code,
          originalText: first.transcript,
          translatedText: first.translatedText,
          originalPronunciation: first.originalPronunciation,
          translatedPronunciation: first.translatedPronunciation,
        });

        if (first.needsPlayback && first.translatedText.trim()) {
          onEnqueueRef.current?.({
            messageId,
            text: first.translatedText,
            languageCode: first.targetLanguage.code,
            sourceLanguageCode: first.sourceLanguage.code,
            needsPlayback: true,
          });
        }

        for (let i = 1; i < res.segments.length; i += 1) {
          const extra = res.segments[i];
          const extraId = `${messageId}_seg_${i}`.slice(0, 120);
          await currentChat.saveLiveMessage({
            id: extraId,
            requestId: `req_${extraId}`.slice(0, 120),
            conversationId,
            speaker: extra.sender === 'partner' ? 'them' : 'me',
            originMode: 'chat',
            sourceLanguage: extra.sourceLanguage.code,
            targetLanguage: extra.targetLanguage.code,
            originalText: extra.transcript,
            translatedText: extra.translatedText,
            originalPronunciation: extra.originalPronunciation,
            translatedPronunciation: extra.translatedPronunciation,
          });
          if (extra.needsPlayback && extra.translatedText.trim()) {
            onEnqueueRef.current?.({
              messageId: extraId,
              text: extra.translatedText,
              languageCode: extra.targetLanguage.code,
              sourceLanguageCode: extra.sourceLanguage.code,
              needsPlayback: true,
            });
          }
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Retry failed.');
        return false;
      }
    },
    [],
  );

  return useMemo(
    () => ({
      status,
      elapsedSeconds,
      previewDraft,
      error,
      notice,
      clearError: () => {
        setError('');
        setNotice('');
      },
      startListening,
      stopListening: () => stopRef.current('user'),
      retryDraft,
    }),
    [status, elapsedSeconds, previewDraft, error, notice, startListening, retryDraft],
  );
}
