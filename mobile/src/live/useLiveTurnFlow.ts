import { useEffect, useRef, useState } from 'react';
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
import { nativeLiveApi, type LiveTranslationResult } from '../adapters/live';
import type { ChatState, createTextChatController } from '../chat/controller';
import {
  NativeLiveConnection,
  prefetchTranscriptionSecret,
  type RealtimeEvent,
} from './nativeRealtime';

type Chat = ReturnType<typeof createTextChatController>;
type LiveLease = NonNullable<ReturnType<Chat['beginLiveCapture']>>;
type VoiceLease = NonNullable<ReturnType<Chat['beginVoiceCapture']>>;
export type TurnMode = 'chat' | 'single' | 'conversation';
export type TurnStatus = 'idle' | 'recording' | 'processing';
export type TurnAction = 'speak' | 'listen' | null;
export type TurnSide = 'partner' | 'self' | null;

export type LiveTurnDraft = {
  id: string;
  speaker: 'me' | 'them';
  sourceLanguage: string;
  targetLanguage: string;
  transcript: string;
  translatedText: string;
  createdAt: number;
};

type CaptureContext = {
  conversationId: string;
  originMode: TurnMode;
  sourceLanguage: string;
  targetLanguage: string;
  speaker: 'me' | 'them';
  sender: 'self' | 'partner';
  action: TurnAction;
  side: TurnSide;
  captureId: string;
  isLiveWebrtc: boolean;
};

const MAX_CAPTURE_MS = 30_000;
const STOP_COMPLETED_WAIT_MS = 1_200;
const STOP_FINALIZE_WAIT_MS = 4_000;

function messageIdentity(captureId: string, itemId: string) {
  const suffix = `${captureId}_${itemId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 104);
  return { id: `live_${suffix}`, requestId: `live_req_${suffix}` };
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

function isBenignSpeechError(code: string, message: string) {
  return (
    code === 'input_audio_buffer_commit_empty' ||
    /buffer too small/i.test(message) ||
    /no speech/i.test(message) ||
    /empty transcript/i.test(message) ||
    /must not be empty/i.test(message)
  );
}

export function useLiveTurnFlow({
  chat,
  state,
  mode,
  disabled = false,
  onCompletedTurn,
}: {
  chat: Chat | null;
  state: ChatState;
  mode: TurnMode;
  disabled?: boolean;
  onCompletedTurn?: (messageId: string, speaker: 'me' | 'them') => void;
}) {
  const isFocused = useIsFocused();
  const [status, setStatus] = useState<TurnStatus>('idle');
  const [activeAction, setActiveAction] = useState<TurnAction>(null);
  const [activeSide, setActiveSide] = useState<TurnSide>(null);
  const [liveDraft, setLiveDraft] = useState<LiveTurnDraft | null>(null);
  const [liveElapsedMs, setLiveElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);

  const recorder = useNativeAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  }, recStatus => {
    if (recStatus.hasError || recStatus.mediaServicesDidReset) {
      if (!contextRef.current?.isLiveWebrtc) {
        setUiError(recStatus.error || 'The microphone was interrupted. Any saved voice drafts remain available.');
        void stopRef.current('interruption');
      }
    }
  });
  const recorderState = useNativeAudioRecorderState(recorder, 100);

  const chatRef = useRef(chat);
  const onCompletedTurnRef = useRef(onCompletedTurn);
  const connectionRef = useRef<NativeLiveConnection | null>(null);
  const liveLeaseRef = useRef<LiveLease | null>(null);
  const voiceLeaseRef = useRef<VoiceLease | null>(null);
  const contextRef = useRef<CaptureContext | null>(null);
  const statusRef = useRef<TurnStatus>(status);
  const mountedRef = useRef(false);
  const cancelledRef = useRef(false);
  const activeRef = useRef(false);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const startedAtRef = useRef(0);
  const limitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizationsRef = useRef(new Set<Promise<void>>());
  const transcriptsRef = useRef(new Map<string, string>());
  const revisionsRef = useRef(new Map<string, number>());
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const finalizedRef = useRef(new Set<string>());
  const latestDraftRef = useRef<LiveTurnDraft | null>(null);
  const stopRef = useRef<(reason: 'user' | 'limit' | 'navigation' | 'interruption' | 'connection') => Promise<void>>(async () => {});
  const eventRef = useRef<(event: RealtimeEvent) => void>(() => {});

  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { onCompletedTurnRef.current = onCompletedTurn; }, [onCompletedTurn]);
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { latestDraftRef.current = liveDraft; }, [liveDraft]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopRef.current('navigation');
    };
  }, []);

  // Warm up OpenAI Realtime transcription client secrets as soon as the screen is focused
  // so tapping the microphone starts recording without waiting for a token roundtrip.
  useEffect(() => {
    if (!isFocused || !state.myLanguage || !state.theirLanguage) return;
    prefetchTranscriptionSecret(state.myLanguage, state.theirLanguage);
    if (mode !== 'chat' && state.myLanguage !== state.theirLanguage) {
      prefetchTranscriptionSecret(state.theirLanguage, state.myLanguage);
    }
  }, [isFocused, mode, state.myLanguage, state.theirLanguage]);

  // Track elapsed time for the 30s countdown timer during WebRTC live recording.
  useEffect(() => {
    if (status !== 'recording') return;
    const interval = setInterval(() => {
      if (startedAtRef.current > 0) {
        setLiveElapsedMs(Math.max(0, Date.now() - startedAtRef.current));
      }
    }, 200);
    return () => clearInterval(interval);
  }, [status]);

  function setUiStatus(next: TurnStatus) {
    statusRef.current = next;
    if (next !== 'recording' && mountedRef.current) setLiveElapsedMs(0);
    if (mountedRef.current) setStatus(next);
  }

  function setUiError(value: string) {
    if (mountedRef.current) setError(value);
  }

  function setUiNotice(value: string) {
    if (mountedRef.current) setNotice(value);
  }

  function updateDraft(update: LiveTurnDraft | null) {
    latestDraftRef.current = update;
    if (mountedRef.current) setLiveDraft(update);
  }

  async function safeRecorderStop(): Promise<void> {
    try {
      await recorder.stop();
    } catch {
      // Native AudioRecorder may already be stopped or released on unmount
    }
  }

  function safeRecorderDurationMs(): number {
    try {
      const statusDuration = Number(recorder.getStatus()?.durationMillis) || 0;
      return Math.max(statusDuration, recorderState.durationMillis, Math.round((recorder.currentTime || 0) * 1000));
    } catch {
      return recorderState.durationMillis || 0;
    }
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

  async function finalizeLiveTranscript(itemId: string, transcript: string) {
    const context = contextRef.current;
    const currentChat = chatRef.current;
    const trimmed = transcript.trim();
    if (!context || !currentChat || !trimmed) return;
    const revision = (revisionsRef.current.get(itemId) ?? 0) + 1;
    revisionsRef.current.set(itemId, revision);
    const completed = await nativeLiveApi.finalizeTranscript({
      utteranceId: itemId,
      revision,
      sourceLanguage: context.sourceLanguage,
      targetLanguage: context.targetLanguage,
      transcript: trimmed,
      sender: context.sender,
    });
    if (completed.utteranceId !== itemId || completed.revision !== revision) return;
    const identity = messageIdentity(context.captureId, itemId);
    const speaker = context.speaker;
    await currentChat.saveLiveMessage({
      ...identity,
      conversationId: context.conversationId,
      speaker,
      originMode: context.originMode,
      sourceLanguage: completed.sourceLanguage.code,
      targetLanguage: completed.targetLanguage.code,
      originalText: completed.transcript,
      translatedText: completed.translatedText,
      originalPronunciation: completed.originalPronunciation,
      translatedPronunciation: completed.translatedPronunciation,
    });
    updateDraft(null);
    onCompletedTurnRef.current?.(identity.id, speaker);
  }

  function queueTranscriptFinalization(itemId: string, rawTranscript: string) {
    if (finalizedRef.current.has(itemId)) return;
    finalizedRef.current.add(itemId);
    const timer = timersRef.current.get(itemId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(itemId);
    const transcript = (rawTranscript.trim() || transcriptsRef.current.get(itemId) || '').trim();
    if (!transcript) {
      updateDraft(null);
      return;
    }
    const task = finalizeLiveTranscript(itemId, transcript).catch(finalError => {
      const msg = finalError instanceof Error ? finalError.message : 'Could not translate live speech.';
      if (!isBenignSpeechError('', msg)) {
        setUiError(msg);
      }
    }).finally(() => {
      finalizationsRef.current.delete(task);
    });
    finalizationsRef.current.add(task);
  }

  useEffect(() => {
    eventRef.current = event => {
      if (event.type === 'conversation.item.input_audio_transcription.delta' &&
          typeof event.item_id === 'string' && typeof event.delta === 'string' && event.delta) {
        const itemId = event.item_id;
        if (finalizedRef.current.has(itemId)) return;
        const transcript = `${transcriptsRef.current.get(itemId) ?? ''}${event.delta}`;
        transcriptsRef.current.set(itemId, transcript);
        const context = contextRef.current;
        if (!context) return;
        const revision = (revisionsRef.current.get(itemId) ?? 0) + 1;
        revisionsRef.current.set(itemId, revision);
        updateDraft({
          id: `draft_${itemId}`,
          speaker: context.speaker,
          sourceLanguage: context.sourceLanguage,
          targetLanguage: context.targetLanguage,
          transcript,
          translatedText: latestDraftRef.current?.translatedText ?? '',
          createdAt: latestDraftRef.current?.createdAt ?? Date.now(),
        });
        const prior = timersRef.current.get(itemId);
        if (prior) clearTimeout(prior);
        timersRef.current.set(itemId, setTimeout(() => {
          const currentTranscript = transcriptsRef.current.get(itemId);
          if (!currentTranscript || finalizedRef.current.has(itemId)) return;
          void nativeLiveApi.translateDraft({
            utteranceId: itemId,
            revision,
            sourceLanguage: context.sourceLanguage,
            targetLanguage: context.targetLanguage,
            transcript: currentTranscript,
            sender: context.sender,
          }).then((partial: LiveTranslationResult) => {
            if (finalizedRef.current.has(itemId) || revisionsRef.current.get(itemId) !== revision || partial.utteranceId !== itemId || partial.revision !== revision) return;
            updateDraft({
              id: `draft_${itemId}`,
              speaker: context.speaker,
              sourceLanguage: partial.sourceLanguage.code,
              targetLanguage: partial.targetLanguage.code,
              transcript: partial.transcript,
              translatedText: partial.translatedText,
              createdAt: latestDraftRef.current?.createdAt ?? Date.now(),
            });
          }).catch(() => undefined);
        }, 420));
        return;
      }

      if (event.type === 'conversation.item.input_audio_transcription.completed' &&
          typeof event.item_id === 'string' && typeof event.transcript === 'string') {
        queueTranscriptFinalization(event.item_id, event.transcript);
        return;
      }

      if (event.type === 'error') {
        const details = event.error as Record<string, unknown> | undefined;
        const code = typeof details?.code === 'string' ? details.code : '';
        const message = typeof details?.message === 'string' ? details.message : 'Live transcription reported an error.';
        if (isBenignSpeechError(code, message)) {
          return;
        }
        setUiError(message);
        void stopRef.current('connection');
      }
    };
  });

  function hasUnfinalizedTranscripts() {
    for (const [itemId, text] of transcriptsRef.current.entries()) {
      if (!finalizedRef.current.has(itemId) && text.trim()) {
        return true;
      }
    }
    return false;
  }

  async function stopCapture(reason: 'user' | 'limit' | 'navigation' | 'interruption' | 'connection') {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    if (statusRef.current === 'idle') return;
    const task = (async () => {
      cancelledRef.current = true;
      activeRef.current = false;
      setUiStatus('processing');
      if (limitTimerRef.current) {
        clearTimeout(limitTimerRef.current);
        limitTimerRef.current = null;
      }
      if (timersRef.current.size) {
        for (const timer of timersRef.current.values()) clearTimeout(timer);
        timersRef.current.clear();
      }
      const currentContext = contextRef.current;

      if (currentContext && !currentContext.isLiveWebrtc && voiceLeaseRef.current) {
        const lease = voiceLeaseRef.current;
        try {
          const wallElapsedMs = startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0;
          const preStopDurationMs = safeRecorderDurationMs();
          await safeRecorderStop();
          const postStopDurationMs = safeRecorderDurationMs();
          const durationMs = Math.max(preStopDurationMs, postStopDurationMs, wallElapsedMs);
          await configureNativeAudioSession(false).catch(() => undefined);
          AudioPlaybackCoordinator.setRecording(false);
          const uri = safeRecorderUri();
          if (!uri || durationMs < 200) {
            lease.cancel();
            if (reason === 'user') setUiError('Record a slightly longer voice note before sending.');
          } else {
            await lease.save(
              uri,
              Math.min(MAX_CAPTURE_MS, Math.round(durationMs)),
              () => AppState.currentState === 'active',
            );
            onCompletedTurnRef.current?.('', currentContext.speaker);
          }
        } catch (err) {
          lease.cancel();
          setUiError(err instanceof Error ? err.message : 'The voice note could not be processed.');
        } finally {
          voiceLeaseRef.current = null;
        }
      } else {
        const shouldCommitBuffer =
          hasUnfinalizedTranscripts() ||
          (transcriptsRef.current.size === 0 && finalizedRef.current.size === 0);

        if (shouldCommitBuffer) {
          connectionRef.current?.commitCurrentAudio();
        }
        connectionRef.current?.stopMicrophone();

        // Wait briefly if we committed uncommitted audio so OpenAI Realtime can emit
        // `conversation.item.input_audio_transcription.completed`.
        if (connectionRef.current && shouldCommitBuffer) {
          const waitStartedAt = Date.now();
          while (Date.now() - waitStartedAt < STOP_COMPLETED_WAIT_MS) {
            if (!hasUnfinalizedTranscripts() && finalizationsRef.current.size > 0) {
              break;
            }
            await wait(80);
          }
        }

        // If any partial delta transcripts still haven't received a `.completed` event
        // before the connection closes, finalize them directly so the user's words are never lost.
        for (const [itemId, text] of transcriptsRef.current.entries()) {
          if (!finalizedRef.current.has(itemId) && text.trim()) {
            queueTranscriptFinalization(itemId, text);
          }
        }

        const pendingFinalizations = [...finalizationsRef.current];
        if (pendingFinalizations.length) {
          await Promise.race([Promise.allSettled(pendingFinalizations), wait(STOP_FINALIZE_WAIT_MS)]);
        }

        connectionRef.current?.close();
        connectionRef.current = null;
        await configureNativeAudioSession(false).catch(() => undefined);
        AudioPlaybackCoordinator.setRecording(false);
        liveLeaseRef.current?.release();
        liveLeaseRef.current = null;
      }

      contextRef.current = null;
      updateDraft(null);
      if (mountedRef.current) {
        setActiveAction(null);
        setActiveSide(null);
        setUiStatus('idle');
      }
      stopPromiseRef.current = null;
    })();
    stopPromiseRef.current = task;
    return task;
  }

  useEffect(() => {
    stopRef.current = stopCapture;
  });

  async function startRecording(options?: {
    action?: TurnAction;
    side?: TurnSide;
    speaker?: 'me' | 'them';
    sourceLanguage?: string;
    targetLanguage?: string;
  }) {
    const currentChat = chatRef.current;
    if (!currentChat || !isFocused || disabled || statusRef.current !== 'idle') return false;
    if (AudioPlaybackCoordinator.isRecording()) {
      setUiError('Stop the current recording before starting another turn.');
      return false;
    }

    const speaker = options?.speaker ?? (options?.action === 'listen' || options?.side === 'partner' ? 'them' : 'me');
    const sourceLanguage = options?.sourceLanguage ?? (speaker === 'them' ? state.theirLanguage : state.myLanguage);
    const targetLanguage = options?.targetLanguage ?? (speaker === 'them' ? state.myLanguage : state.theirLanguage);
    const sender: 'self' | 'partner' = speaker === 'them' ? 'partner' : 'self';
    const action = options?.action ?? (speaker === 'them' ? 'listen' : 'speak');
    const side = options?.side ?? (speaker === 'them' ? 'partner' : 'self');

    cancelledRef.current = false;
    activeRef.current = false;
    finalizationsRef.current.clear();
    transcriptsRef.current.clear();
    revisionsRef.current.clear();
    finalizedRef.current.clear();
    setUiError('');
    setUiNotice('');
    setDenied(false);
    updateDraft(null);
    if (mountedRef.current) {
      setActiveAction(action);
      setActiveSide(side);
    }

    const permission = await requestNativeMicrophoneAccess();
    if (!permission.granted) {
      setDenied(true);
      setUiError('Microphone access is off. Enable it in Settings to record voice turns.');
      if (mountedRef.current) {
        setActiveAction(null);
        setActiveSide(null);
      }
      return false;
    }

    const liveLease = currentChat.beginLiveCapture();
    if (liveLease && ['chat', 'single', 'conversation'].includes(liveLease.conversation.origin_mode)) {
      const context: CaptureContext = {
        conversationId: liveLease.conversation.id,
        originMode: liveLease.conversation.origin_mode as TurnMode,
        sourceLanguage,
        targetLanguage,
        speaker,
        sender,
        action,
        side,
        captureId: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
        isLiveWebrtc: true,
      };
      liveLeaseRef.current = liveLease;
      contextRef.current = context;
      AudioPlaybackCoordinator.setRecording(true);
      try {
        await configureNativeAudioSession(true);
        const connection = new NativeLiveConnection({
          onEvent: event => eventRef.current(event),
          onError: message => {
            if (!isBenignSpeechError('', message)) {
              setUiError(message);
            }
            void stopRef.current('connection');
          },
        });
        connectionRef.current = connection;
        startedAtRef.current = Date.now();
        setUiStatus('recording');
        const sdp = await connection.prepare(sourceLanguage, targetLanguage);
        if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Turn stopped before connection.');
        await connection.connect(sdp);
        if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Turn stopped before connection.');
        startedAtRef.current = Date.now();
        activeRef.current = true;
        limitTimerRef.current = setTimeout(() => {
          if (activeRef.current) void stopRef.current('limit');
        }, MAX_CAPTURE_MS);
        return true;
      } catch (liveError) {
        connectionRef.current?.close();
        connectionRef.current = null;
        liveLease.release();
        liveLeaseRef.current = null;
        contextRef.current = null;
        await configureNativeAudioSession(false).catch(() => undefined);
        AudioPlaybackCoordinator.setRecording(false);
        if (!cancelledRef.current) {
          setUiError(
            liveError instanceof Error
              ? liveError.message
              : 'Live voice transcription could not connect. Check your internet and try again.',
          );
        }
        if (mountedRef.current) {
          setActiveAction(null);
          setActiveSide(null);
          setUiStatus('idle');
        }
        return false;
      }
    } else if (liveLease) {
      liveLease.release();
    }

    // Fallback local voice capture if liveLease was unavailable
    const voiceLease = currentChat.beginVoiceCapture({
      originMode: mode,
      speaker,
      sourceLanguage,
      targetLanguage,
    });
    if (!voiceLease) {
      await configureNativeAudioSession(false).catch(() => undefined);
      AudioPlaybackCoordinator.setRecording(false);
      if (mountedRef.current) {
        setActiveAction(null);
        setActiveSide(null);
        setUiStatus('idle');
      }
      return false;
    }

    voiceLeaseRef.current = voiceLease;
    contextRef.current = {
      conversationId: state.conversation?.id ?? '',
      originMode: mode,
      sourceLanguage,
      targetLanguage,
      speaker,
      sender,
      action,
      side,
      captureId: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
      isLiveWebrtc: false,
    };

    try {
      AudioPlaybackCoordinator.setRecording(true);
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
      setUiStatus('recording');
      activeRef.current = true;
      startedAtRef.current = Date.now();
      limitTimerRef.current = setTimeout(() => {
        if (activeRef.current) void stopRef.current('limit');
      }, MAX_CAPTURE_MS);
      return true;
    } catch (recError) {
      voiceLease.cancel();
      voiceLeaseRef.current = null;
      contextRef.current = null;
      await configureNativeAudioSession(false).catch(() => undefined);
      AudioPlaybackCoordinator.setRecording(false);
      setUiError(recError instanceof Error ? recError.message : 'Microphone recording could not start.');
      if (mountedRef.current) {
        setActiveAction(null);
        setActiveSide(null);
        setUiStatus('idle');
      }
      return false;
    }
  }

  useEffect(() => {
    if (!isFocused && statusRef.current === 'recording') {
      void stopRef.current('navigation');
    }
  }, [isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && statusRef.current === 'recording') {
        void stopRef.current('interruption');
      }
    });
    return () => subscription.remove();
  }, []);

  const elapsedMs = status === 'recording'
    ? (contextRef.current?.isLiveWebrtc ? liveElapsedMs : recorderState.durationMillis)
    : 0;
  const secondsRemaining = Math.max(0, Math.ceil((MAX_CAPTURE_MS - elapsedMs) / 1000));
  const combinedStatus: TurnStatus = status === 'recording'
    ? 'recording'
    : (status === 'processing' || Boolean(state.voiceRequest))
      ? 'processing'
      : 'idle';

  return {
    status: combinedStatus,
    activeAction,
    activeSide,
    secondsRemaining,
    recordingTimer: secondsRemaining,
    liveDraft,
    error: error || state.error,
    notice,
    denied,
    clearError: () => {
      setUiError('');
      setUiNotice('');
    },
    startRecording,
    stopRecording: () => stopRef.current('user'),
  };
}
