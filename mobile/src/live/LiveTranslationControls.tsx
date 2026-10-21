import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
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
import { ActionButton } from '../components/ActionButton';
import type { ChatState, createTextChatController } from '../chat/controller';
import { languageName } from '../chat/presentation';
import { NativeLiveConnection, type RealtimeEvent } from './nativeRealtime';

type Chat = ReturnType<typeof createTextChatController>;
type CaptureLease = NonNullable<ReturnType<Chat['beginLiveCapture']>>;
type Mode = 'chat' | 'single' | 'conversation';
type Phase = 'idle' | 'starting' | 'listening' | 'stopping' | 'error';
type CaptureContext = {
  conversationId: string;
  originMode: Mode;
  myLanguage: string;
  theirLanguage: string;
  captureId: string;
};
type SavedSegment = { id: string; requestId: string; durationMs: number };
type LiveDraft = {
  sourceLanguage: string;
  targetLanguage: string;
  transcript: string;
  translatedText: string;
};

const SPEECH_DBFS_THRESHOLD = -46;
const SILENCE_FINALIZE_MS = 1_000;
const MIN_SPEECH_MS = 550;
const MAX_CAPTURE_MS = 30_000;
const DRAIN_MS = 3_500;

function messageIdentity(captureId: string, itemId: string) {
  const suffix = `${captureId}_${itemId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 104);
  return { id: `live_${suffix}`, requestId: `live_req_${suffix}` };
}

function wait(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

export function LiveTranslationControls({
  chat,
  state,
  mode,
  disabled = false,
}: {
  chat: Chat | null;
  state: ChatState;
  mode: Mode;
  disabled?: boolean;
}) {
  const isFocused = useIsFocused();
  const [phase, setPhase] = useState<Phase>('idle');
  const [draft, setDraft] = useState<LiveDraft | null>(null);
  const [error, setError] = useState('');
  const [recorderError, setRecorderError] = useState('');
  const [notice, setNotice] = useState('');
  const recorder = useNativeAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    directory: 'document',
    isMeteringEnabled: true,
  }, status => {
    if (status.hasError || status.mediaServicesDidReset) {
      setRecorderError(status.error || 'The microphone was interrupted. Any saved voice drafts remain available.');
    }
  });
  const recorderState = useNativeAudioRecorderState(recorder, 100);

  const chatRef = useRef(chat);
  const connectionRef = useRef<NativeLiveConnection | null>(null);
  const leaseRef = useRef<CaptureLease | null>(null);
  const contextRef = useRef<CaptureContext | null>(null);
  const phaseRef = useRef<Phase>(phase);
  const mountedRef = useRef(false);
  const errorRef = useRef('');
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
  const latestDraftRef = useRef<LiveDraft | null>(null);
  const stopRef = useRef<(reason: 'user' | 'limit' | 'navigation' | 'interruption' | 'connection') => Promise<void>>(async () => {});
  const eventRef = useRef<(event: RealtimeEvent) => void>(() => {});

  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { latestDraftRef.current = draft; }, [draft]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void stopRef.current('navigation');
    };
  }, []);

  function setUiPhase(next: Phase) {
    phaseRef.current = next;
    if (mountedRef.current) setPhase(next);
  }

  function setUiError(value: string) {
    errorRef.current = value;
    if (mountedRef.current) setError(value);
  }

  function setUiNotice(value: string) {
    if (mountedRef.current) setNotice(value);
  }

  function updateDraft(update: LiveDraft) {
    latestDraftRef.current = update;
    if (mountedRef.current) setDraft(update);
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
        sourceLanguage: context.myLanguage,
        targetLanguage: context.theirLanguage,
        speaker: 'me',
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
    if (!speechStartedAtRef.current || segmentFinalizingRef.current) return;
    speechStartedAtRef.current = 0;
    lastSpeechAtRef.current = 0;
    const audio = saveCurrentRecorderSegment(restart);
    pendingSegmentsRef.current.push(audio);
    if (!connectionRef.current?.commitCurrentAudio()) {
      setUiNotice('The audio was saved as a voice draft because the live connection closed before the turn finished.');
    }
  }

  async function finalizeTranscript(itemId: string, transcript: string, audioPromise: Promise<SavedSegment | null>) {
    const context = contextRef.current;
    const currentChat = chatRef.current;
    if (!context || !currentChat || !transcript.trim()) return;
    const audio = await audioPromise.catch(() => null);
    const revision = (revisionsRef.current.get(itemId) ?? 0) + 1;
    revisionsRef.current.set(itemId, revision);
    const completed = await nativeLiveApi.finalizeTranscript({
      utteranceId: itemId,
      revision,
      sourceLanguage: context.myLanguage,
      targetLanguage: context.theirLanguage,
      transcript,
    });
    if (completed.utteranceId !== itemId || completed.revision !== revision) return;
    const messageInput = {
      ...(audio ?? messageIdentity(context.captureId, itemId)),
      conversationId: context.conversationId,
      speaker: completed.sender === 'partner' ? 'them' as const : 'me' as const,
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
      setUiNotice('The translation was saved. Its source recording was unavailable on this turn.');
    }
    updateDraft({
      sourceLanguage: completed.sourceLanguage.code,
      targetLanguage: completed.targetLanguage.code,
      transcript: completed.transcript,
      translatedText: completed.translatedText,
    });
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
        sourceLanguage: context.myLanguage,
        targetLanguage: context.theirLanguage,
        transcript,
        translatedText: latestDraftRef.current?.translatedText ?? '',
      });
      const prior = timersRef.current.get(itemId);
      if (prior) clearTimeout(prior);
      timersRef.current.set(itemId, setTimeout(() => {
        const currentTranscript = transcriptsRef.current.get(itemId);
        if (!currentTranscript || finalizedRef.current.has(itemId)) return;
        void nativeLiveApi.translateDraft({
          utteranceId: itemId,
          revision,
          sourceLanguage: context.myLanguage,
          targetLanguage: context.theirLanguage,
          transcript: currentTranscript,
        }).then((partial: LiveTranslationResult) => {
          if (finalizedRef.current.has(itemId) || revisionsRef.current.get(itemId) !== revision || partial.utteranceId !== itemId || partial.revision !== revision) return;
          updateDraft({
            sourceLanguage: partial.sourceLanguage.code,
            targetLanguage: partial.targetLanguage.code,
            transcript: partial.transcript,
            translatedText: partial.translatedText,
          });
        }).catch(partialError => {
          if (!finalizedRef.current.has(itemId) && revisionsRef.current.get(itemId) === revision) {
            setUiNotice(partialError instanceof Error ? partialError.message : 'The live translation preview is delayed.');
          }
        });
      }, 450));
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
      const task = finalizeTranscript(itemId, transcript, segment).catch(async finalError => {
        const context = contextRef.current;
        const currentChat = chatRef.current;
        const savedAudio = await segment.catch(() => null);
        if (context && currentChat && savedAudio) {
          await currentChat.refreshSavedMessage(context.conversationId, savedAudio.id).catch(() => undefined);
        }
        setUiNotice(finalError instanceof Error
          ? `The audio was saved on this phone. Tap Retry on its voice draft. ${finalError.message}`
          : 'The audio was saved on this phone. Tap Retry on its voice draft.');
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
    if (phaseRef.current === 'idle' || phaseRef.current === 'error') return;
    const task = (async () => {
      cancelledRef.current = true;
      activeRef.current = false;
      setUiPhase('stopping');
      if (limitTimerRef.current) {
        clearTimeout(limitTimerRef.current);
        limitTimerRef.current = null;
      }
      if (timersRef.current.size) {
        for (const timer of timersRef.current.values()) clearTimeout(timer);
        timersRef.current.clear();
      }
      if (speechStartedAtRef.current) {
        speechStartedAtRef.current = 0;
        lastSpeechAtRef.current = 0;
        const audio = saveCurrentRecorderSegment(false);
        pendingSegmentsRef.current.push(audio);
        connectionRef.current?.commitCurrentAudio();
      } else if (recorder.getStatus().isRecording) {
        await recorder.stop().catch(() => undefined);
      }
      connectionRef.current?.stopMicrophone();
      if (connectionRef.current && pendingSegmentsRef.current.length) await wait(DRAIN_MS);
      const remaining = await Promise.all(pendingSegmentsRef.current.splice(0).map(value => value.catch(() => null)));
      const currentContext = contextRef.current;
      const currentChat = chatRef.current;
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
      leaseRef.current?.release();
      leaseRef.current = null;
      contextRef.current = null;
      speechStartedAtRef.current = 0;
      lastSpeechAtRef.current = 0;
      segmentFinalizingRef.current = false;
      if (reason === 'interruption' || reason === 'navigation' || remaining.some(Boolean)) {
        setUiNotice('Any unfinished source audio was saved as a voice draft on this phone. Tap Retry on the draft to translate it.');
      }
      if (reason === 'user' || reason === 'limit') setUiNotice('Live listening stopped. Completed turns are saved in local history.');
      if (reason === 'connection' && !errorRef.current) setUiError('Live transcription stopped. Any saved voice drafts remain available to retry.');
      if (mountedRef.current) setUiPhase(errorRef.current ? 'error' : 'idle');
      stopPromiseRef.current = null;
    })();
    stopPromiseRef.current = task;
    return task;
  }

  useEffect(() => {
    stopRef.current = stopCapture;
  });

  async function startCapture() {
    const currentChat = chatRef.current;
    if (!currentChat || !isFocused || disabled || phaseRef.current === 'starting' || phaseRef.current === 'listening' || phaseRef.current === 'stopping') return;
    if (AudioPlaybackCoordinator.isRecording()) {
      setUiError('Stop the current recording before starting live translation.');
      return;
    }
    const lease = currentChat.beginLiveCapture();
    if (!lease) return;
    if (!['chat', 'single', 'conversation'].includes(lease.conversation.origin_mode)) {
      lease.release();
      setUiError('Live translation is not available in this conversation.');
      return;
    }
    const context: CaptureContext = {
      conversationId: lease.conversation.id,
      originMode: lease.conversation.origin_mode as Mode,
      myLanguage: lease.languages.myLanguage,
      theirLanguage: lease.languages.theirLanguage,
      captureId: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
    };
    leaseRef.current = lease;
    contextRef.current = context;
    cancelledRef.current = false;
    activeRef.current = false;
    pendingSegmentsRef.current = [];
    finalizationsRef.current.clear();
    transcriptsRef.current.clear();
    revisionsRef.current.clear();
    finalizedRef.current.clear();
    errorRef.current = '';
    setError('');
    setRecorderError('');
    setNotice('');
    setDraft(null);
    setUiPhase('starting');
    AudioPlaybackCoordinator.setRecording(true);
    let sdp = '';
    try {
      const permission = await requestNativeMicrophoneAccess();
      if (!permission.granted) throw new Error('Microphone access is off. Enable it in Settings to use live translation.');
      if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Live listening was stopped before it connected.');
      await configureNativeAudioSession(true);
      const connection = new NativeLiveConnection({
        onEvent: event => eventRef.current(event),
        onError: message => {
          setUiError(message);
          void stopRef.current('connection');
        },
      });
      connectionRef.current = connection;
      sdp = await connection.prepare(context.myLanguage, context.theirLanguage);
      if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Live listening was stopped before it connected.');
      await connection.connect(sdp);
      if (cancelledRef.current || AppState.currentState !== 'active') throw new Error('Live listening was stopped before it connected.');
      await recorder.prepareToRecordAsync();
      recorder.record();
      activeRef.current = true;
      startedAtRef.current = Date.now();
      setUiPhase('listening');
      limitTimerRef.current = setTimeout(() => {
        if (activeRef.current) void stopRef.current('limit');
      }, MAX_CAPTURE_MS);
      if (connection.fallbackReason) setUiNotice(connection.fallbackReason);
    } catch (startError) {
      cancelledRef.current = true;
      activeRef.current = false;
      connectionRef.current?.close();
      connectionRef.current = null;
      if (recorder.getStatus().isRecording) await recorder.stop().catch(() => undefined);
      await configureNativeAudioSession(false).catch(() => undefined);
      AudioPlaybackCoordinator.setRecording(false);
      leaseRef.current?.release();
      leaseRef.current = null;
      contextRef.current = null;
      const message = startError instanceof Error ? startError.message : 'Live translation could not start.';
      setUiError(message);
      setUiPhase('error');
    }
  }

  const commitCurrentTurnRef = useRef(commitCurrentTurn);
  useEffect(() => {
    commitCurrentTurnRef.current = commitCurrentTurn;
  });

  useEffect(() => {
    if (phase !== 'listening' || !activeRef.current || segmentFinalizingRef.current) return;
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
  }, [phase, recorderState.metering, recorderState.durationMillis]);

  useEffect(() => {
    if (!isFocused && (phaseRef.current === 'starting' || phaseRef.current === 'listening')) {
      void stopRef.current('navigation');
    }
  }, [isFocused]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next !== 'active' && (phaseRef.current === 'starting' || phaseRef.current === 'listening')) {
        void stopRef.current('interruption');
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'listening') return;
    if (recorderError || recorderState.mediaServicesDidReset) {
      setUiError(recorderError || 'The microphone was interrupted. Any saved voice drafts remain available.');
      void stopRef.current('interruption');
    }
  }, [phase, recorderError, recorderState.mediaServicesDidReset]);

  const isActive = phase === 'starting' || phase === 'listening' || phase === 'stopping';
  const canStart = !!chat && !!state.conversation && state.conversation.origin_mode === mode && !disabled && isFocused;
  const buttonDisabled = phase === 'stopping' || (disabled && phase !== 'starting' && phase !== 'listening') || (!isActive && !canStart);
  const buttonLabel = phase === 'starting'
    ? 'Connecting live audio...'
    : phase === 'listening'
      ? 'Stop live translation'
      : phase === 'stopping'
        ? 'Saving finished turns...'
        : phase === 'error'
          ? 'Try live translation again'
          : 'Start live translation';

  return (
    <View style={styles.panel}>
      <View style={styles.topRow}>
        <View style={styles.headingGroup}>
          <Text accessibilityRole="header" style={styles.title}>Live conversation</Text>
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {phase === 'listening' ? 'Listening. Pauses finish each turn.' : phase === 'starting' ? 'Requesting a secure live session...' : phase === 'stopping' ? 'Finishing the last spoken turn...' : 'Stream speech for live transcript and translation.'}
          </Text>
        </View>
        <ActionButton
          label={buttonLabel}
          tone={phase === 'listening' ? 'danger' : phase === 'starting' || phase === 'stopping' ? 'secondary' : 'primary'}
          disabled={buttonDisabled}
          onPress={() => { if (phase === 'starting' || phase === 'listening') void stopRef.current('user'); else void startCapture(); }}
        />
      </View>
      {draft && !!draft.transcript && (
        <View style={styles.transcript}>
          <Text style={styles.language}>{languageName(draft.sourceLanguage)}</Text>
          <Text selectable style={styles.text}>{draft.transcript}</Text>
          <Text style={styles.language}>{languageName(draft.targetLanguage)}</Text>
          <Text selectable style={styles.translation}>{draft.translatedText || 'Translating...'}</Text>
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text>}
      <Text style={styles.footnote}>Turns finalize after a pause. Source recordings and finished messages are saved on this phone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 12, marginHorizontal: 12, marginVertical: 6, borderWidth: 1, borderColor: '#B6C9BE', borderRadius: 14, backgroundColor: '#EEF3EF' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headingGroup: { flex: 1, gap: 2 },
  title: { color: '#182A23', fontSize: 17, fontWeight: '700' },
  status: { color: '#48574F', fontSize: 13 },
  transcript: { gap: 4, paddingTop: 6 },
  language: { color: '#48574F', fontSize: 12, fontWeight: '700' },
  text: { color: '#182A23', fontSize: 17 },
  translation: { color: '#285B48', fontSize: 17, fontWeight: '600' },
  error: { color: '#9B2727', fontSize: 14 },
  note: { color: '#48574F', fontSize: 14 },
  footnote: { color: '#48574F', fontSize: 12 },
});
