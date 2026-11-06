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
import { NativeLiveConnection, type RealtimeEvent } from './nativeRealtime';

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

type SavedSegment = { id: string; requestId: string; durationMs: number };

const SPEECH_DBFS_THRESHOLD = -46;
const SILENCE_FINALIZE_MS = 1_000;
const MIN_SPEECH_MS = 550;
const MAX_CAPTURE_MS = 30_000;
const DRAIN_MS = 3_000;

function messageIdentity(captureId: string, itemId: string) {
  const suffix = `${captureId}_${itemId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 104);
  return { id: `live_${suffix}`, requestId: `live_req_${suffix}` };
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
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
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);

  const recorder = useNativeAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  }, recStatus => {
    if (recStatus.hasError || recStatus.mediaServicesDidReset) {
      setUiError(recStatus.error || 'The microphone was interrupted. Any saved voice drafts remain available.');
      void stopRef.current('interruption');
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
  const speechStartedAtRef = useRef(0);
  const lastSpeechAtRef = useRef(0);
  const segmentFinalizingRef = useRef(false);
  const pendingSegmentsRef = useRef<Promise<SavedSegment | null>[]>([]);
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

  function setUiStatus(next: TurnStatus) {
    statusRef.current = next;
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

  async function saveCurrentRecorderSegment(restart: boolean): Promise<SavedSegment | null> {
    const currentChat = chatRef.current;
    const context = contextRef.current;
    if (segmentFinalizingRef.current) return null;
    segmentFinalizingRef.current = true;
    try {
      const durationMs = Math.max(recorderState.durationMillis, Math.round(recorder.currentTime * 1000));
      if (recorder.getStatus().isRecording) await recorder.stop();
      const uri = recorder.uri;
      let restarted = false;
      if (restart && activeRef.current && !cancelledRef.current && AppState.currentState === 'active') {
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed < MAX_CAPTURE_MS - 250) {
          await recorder.prepareToRecordAsync();
          if (activeRef.current && !cancelledRef.current && AppState.currentState === 'active') {
            recorder.record();
            restarted = true;
          }
        }
      }
      if (!uri || durationMs < 250 || !context || !currentChat) return null;
      const saved = await currentChat.saveLiveAudioDraft({
        conversationId: context.conversationId,
        originMode: context.originMode,
        sourceLanguage: context.sourceLanguage,
        targetLanguage: context.targetLanguage,
        speaker: context.speaker,
      }, { uri, durationMs: Math.round(durationMs) });
      if (!restarted && restart && activeRef.current && !cancelledRef.current && AppState.currentState === 'active') {
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed < MAX_CAPTURE_MS - 250) {
          await recorder.prepareToRecordAsync();
          if (activeRef.current && !cancelledRef.current && AppState.currentState === 'active') recorder.record();
        }
      }
      return { ...saved, durationMs: Math.round(durationMs) };
    } catch (captureError) {
      setUiError(captureError instanceof Error ? captureError.message : 'The source recording could not be saved.');
      return null;
    } finally {
      segmentFinalizingRef.current = false;
    }
  }

  function commitCurrentTurn(restart = true) {
    const context = contextRef.current;
    if (!context?.isLiveWebrtc) return;
    if (!speechStartedAtRef.current || segmentFinalizingRef.current) return;
    speechStartedAtRef.current = 0;
    lastSpeechAtRef.current = 0;
    const audio = saveCurrentRecorderSegment(restart);
    pendingSegmentsRef.current.push(audio);
    connectionRef.current?.commitCurrentAudio();
  }

  async function finalizeLiveTranscript(itemId: string, transcript: string, audioPromise: Promise<SavedSegment | null>) {
    const context = contextRef.current;
    const currentChat = chatRef.current;
    if (!context || !currentChat || !transcript.trim()) return;
    const audio = await audioPromise.catch(() => null);
    const revision = (revisionsRef.current.get(itemId) ?? 0) + 1;
    revisionsRef.current.set(itemId, revision);
    const completed = await nativeLiveApi.finalizeTranscript({
      utteranceId: itemId,
      revision,
      sourceLanguage: context.sourceLanguage,
      targetLanguage: context.targetLanguage,
      transcript,
      sender: context.sender,
    });
    if (completed.utteranceId !== itemId || completed.revision !== revision) return;
    const identity = audio ?? messageIdentity(context.captureId, itemId);
    const speaker = context.speaker;
    const messageInput = {
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
    };
    if (audio) {
      await currentChat.finishLiveDraft(messageInput);
    } else {
      await currentChat.saveLiveMessage(messageInput);
    }
    updateDraft(null);
    onCompletedTurnRef.current?.(identity.id, speaker);
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
        const itemId = event.item_id;
        if (finalizedRef.current.has(itemId)) return;
        finalizedRef.current.add(itemId);
        const timer = timersRef.current.get(itemId);
        if (timer) clearTimeout(timer);
        timersRef.current.delete(itemId);
        const transcript = event.transcript.trim() || transcriptsRef.current.get(itemId) || '';
        const segment = pendingSegmentsRef.current.shift() ?? Promise.resolve(null);
        const task = finalizeLiveTranscript(itemId, transcript, segment).catch(async finalError => {
          const context = contextRef.current;
          const currentChat = chatRef.current;
          const savedAudio = await segment.catch(() => null);
          if (context && currentChat && savedAudio) {
            await currentChat.refreshSavedMessage(context.conversationId, savedAudio.id).catch(() => undefined);
          }
          setUiError(finalError instanceof Error
            ? `Audio saved locally. Tap Retry on its voice draft. ${finalError.message}`
            : 'Audio saved locally. Tap Retry on its voice draft.');
        }).finally(() => {
          finalizationsRef.current.delete(task);
        });
        finalizationsRef.current.add(task);
      }

      if (event.type === 'error') {
        const details = event.error as Record<string, unknown> | undefined;
        setUiError(typeof details?.message === 'string' ? details.message : 'Live transcription reported an error.');
        void stopRef.current('connection');
      }
    };
  });

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
      const currentChat = chatRef.current;

      if (currentContext && !currentContext.isLiveWebrtc && voiceLeaseRef.current) {
        const lease = voiceLeaseRef.current;
        try {
          const durationMs = Math.max(recorderState.durationMillis, Math.round(recorder.currentTime * 1000));
          if (recorder.getStatus().isRecording) await recorder.stop();
          await configureNativeAudioSession(false).catch(() => undefined);
          AudioPlaybackCoordinator.setRecording(false);
          const uri = recorder.uri;
          if (!uri || durationMs < 250) {
            lease.cancel();
            if (reason === 'user') setUiError('Record a slightly longer voice note before sending.');
          } else {
            await lease.save(
              uri,
              Math.min(MAX_CAPTURE_MS, Math.round(durationMs)),
              () => AppState.currentState === 'active',
            );
          }
        } catch (err) {
          lease.cancel();
          setUiError(err instanceof Error ? err.message : 'The voice note could not be processed.');
        } finally {
          voiceLeaseRef.current = null;
        }
      } else {
        if (speechStartedAtRef.current) {
          speechStartedAtRef.current = 0;
          lastSpeechAtRef.current = 0;
          const audio = saveCurrentRecorderSegment(false);
          pendingSegmentsRef.current.push(audio);
          connectionRef.current?.commitCurrentAudio();
        } else if (recorder.getStatus().isRecording) {
          const durationMs = Math.max(recorderState.durationMillis, Math.round(recorder.currentTime * 1000));
          if (durationMs >= 250 && pendingSegmentsRef.current.length === 0 && finalizationsRef.current.size === 0) {
            const audio = saveCurrentRecorderSegment(false);
            pendingSegmentsRef.current.push(audio);
            connectionRef.current?.commitCurrentAudio();
          } else {
            await recorder.stop().catch(() => undefined);
          }
        }
        connectionRef.current?.stopMicrophone();
        if (connectionRef.current && pendingSegmentsRef.current.length) await wait(DRAIN_MS);
        const remaining = await Promise.all(pendingSegmentsRef.current.splice(0).map(value => value.catch(() => null)));
        for (const segment of remaining) {
          if (segment && currentContext && currentChat) {
            await currentChat.refreshSavedMessage(currentContext.conversationId, segment.id).catch(() => undefined);
          }
        }
        const pendingFinalizations = [...finalizationsRef.current];
        if (pendingFinalizations.length) await Promise.race([Promise.allSettled(pendingFinalizations), wait(1_500)]);
        connectionRef.current?.close();
        connectionRef.current = null;
        await configureNativeAudioSession(false).catch(() => undefined);
        AudioPlaybackCoordinator.setRecording(false);
        liveLeaseRef.current?.release();
        liveLeaseRef.current = null;
      }

      contextRef.current = null;
      speechStartedAtRef.current = 0;
      lastSpeechAtRef.current = 0;
      segmentFinalizingRef.current = false;
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
    pendingSegmentsRef.current = [];
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

    // Attempt WebRTC Live Turn first; if unavailable (e.g., Expo Go or token/network fallback), gracefully use standard recorded capture.
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
      setUiStatus('recording');
      AudioPlaybackCoordinator.setRecording(true);
      try {
        await configureNativeAudioSession(true);
        const connection = new NativeLiveConnection({
          onEvent: event => eventRef.current(event),
          onError: message => {
            setUiError(message);
            void stopRef.current('connection');
          },
        });
        connectionRef.current = connection;
        const sdp = await connection.prepare(sourceLanguage, targetLanguage);
        if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Turn stopped before connection.');
        await connection.connect(sdp);
        if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Turn stopped before connection.');
        await recorder.prepareToRecordAsync();
        recorder.record();
        activeRef.current = true;
        startedAtRef.current = Date.now();
        limitTimerRef.current = setTimeout(() => {
          if (activeRef.current) void stopRef.current('limit');
        }, MAX_CAPTURE_MS);
        return true;
      } catch {
        // Clean up live connection attempt and fall through to standard recorded voice capture
        connectionRef.current?.close();
        connectionRef.current = null;
        liveLease.release();
        liveLeaseRef.current = null;
        contextRef.current = null;
      }
    } else if (liveLease) {
      liveLease.release();
    }

    // Standard recorded voice capture fallback (works in Expo Go & without WebRTC)
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
      setUiStatus('recording');
      AudioPlaybackCoordinator.setRecording(true);
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      recorder.record();
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

  const commitCurrentTurnRef = useRef(commitCurrentTurn);
  useEffect(() => {
    commitCurrentTurnRef.current = commitCurrentTurn;
  });

  useEffect(() => {
    if (status !== 'recording' || !activeRef.current || segmentFinalizingRef.current) return;
    if (!contextRef.current?.isLiveWebrtc) return;
    const metering = recorderState.metering;
    if (typeof metering === 'number' && metering >= SPEECH_DBFS_THRESHOLD) {
      if (!speechStartedAtRef.current) speechStartedAtRef.current = Date.now();
      lastSpeechAtRef.current = Date.now();
      return;
    }
    if (speechStartedAtRef.current &&
        Date.now() - speechStartedAtRef.current >= MIN_SPEECH_MS &&
        Date.now() - lastSpeechAtRef.current >= SILENCE_FINALIZE_MS) {
      commitCurrentTurnRef.current(true);
    }
  }, [status, recorderState.metering, recorderState.durationMillis]);

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

  const elapsedMs = status === 'recording' ? recorderState.durationMillis : 0;
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
