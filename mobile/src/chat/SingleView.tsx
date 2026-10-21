import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from 'expo-router';
import {
  AudioPlaybackCoordinator,
  configureNativeAudioSession,
  RecordingPresets,
  requestNativeMicrophoneAccess,
  useNativeAudioRecorder,
  useNativeAudioRecorderState,
} from '../adapters/audio';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { Feather } from '@expo/vector-icons';
import type { ChatState, createTextChatController } from './controller';
import { HistorySheet } from './HistorySheet';
import { MessageCard } from './MessageCard';
import { languageName } from './presentation';
import { useAudioPlayback } from './useAudioPlayback';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import { LiveTranslationControls } from '../live/LiveTranslationControls';
import { palette } from '../theme';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

type ActiveAction = 'speak' | 'listen' | null;

export function SingleView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const [historyVisible, setHistoryVisible] = useState(false);
  const [activeAction, setActiveAction] = useState<ActiveAction>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'recording' | 'saving' | 'save-failed'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));

  const chatRef = useRef(chat);
  const audioPlaybackRef = useRef(audioPlayback);
  useEffect(() => {
    chatRef.current = chat;
    audioPlaybackRef.current = audioPlayback;
  });

  const leaseRef = useRef<ReturnType<NonNullable<typeof chat>['beginVoiceCapture']> | null>(null);
  const preparingRef = useRef(false);
  const cancelledRef = useRef(false);
  const stoppingRef = useRef(false);
  const durationMsRef = useRef(0);
  const capturedRef = useRef<{ uri: string; duration: number } | null>(null);
  const activeRef = useRef(false);
  const finishRef = useRef<() => Promise<void>>(async () => {});

  const recorder = useNativeAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, directory: 'document' },
    status => {
      if (status.isFinished || status.hasError || status.mediaServicesDidReset) {
        void finishRef.current();
      }
    },
  );
  const recordingState = useNativeAudioRecorderState(recorder, 100);

  useEffect(() => {
    if (phase === 'recording') {
      durationMsRef.current = Math.max(durationMsRef.current, recordingState.durationMillis);
    }
  }, [phase, recordingState.durationMillis]);

  const locked = !chat || state.busy || state.historyBusy || phase === 'recording' || phase === 'preparing' || phase === 'saving';

  // Select this mode only while its tab is actually focused. Native tabs may
  // keep the other mode screens mounted in the background.
  useEffect(() => {
    if (isFocused && !state.busy && chat && state.conversation?.origin_mode !== 'single') {
      void chat.ensureConversationForMode('single');
    }
  }, [isFocused, state.busy, chat, state.conversation?.origin_mode]);

  async function save() {
    if (!capturedRef.current || !leaseRef.current) return;
    setPhase('saving');
    try {
      await leaseRef.current.save(
        capturedRef.current.uri,
        capturedRef.current.duration,
        () => activeRef.current && AppState.currentState === 'active' && !cancelledRef.current,
      );
      capturedRef.current = null;
      leaseRef.current = null;
      setPhase('idle');
      setActiveAction(null);
      setNotice('Turn saved. Check below for translation status.');
    } catch (error) {
      setPhase('save-failed');
      setNotice(`Recording save is unconfirmed. Tap Retry saving recording. Do not close the app. ${error instanceof Error ? error.message : ''}`);
    }
  }

  async function finish() {
    if (!leaseRef.current || preparingRef.current || stoppingRef.current || capturedRef.current) return;
    stoppingRef.current = true;
    setPhase('saving');
    try {
      const duration = Math.max(durationMsRef.current, Math.round(recorder.currentTime * 1000));
      if (recorder.getStatus().canRecord) await recorder.stop();
      const uri = recorder.uri;
      if (!uri || duration <= 0) throw new Error('No usable recording was captured. Try speaking again.');
      capturedRef.current = { uri, duration };
      await save();
    } catch (error) {
      leaseRef.current?.cancel();
      leaseRef.current = null;
      setPhase('idle');
      setActiveAction(null);
      setNotice(error instanceof Error ? error.message : 'Recording stopped without usable audio.');
    } finally {
      stoppingRef.current = false;
      AudioPlaybackCoordinator.setRecording(false);
      await configureNativeAudioSession(false).catch(() => setNotice('Audio session could not be restored. Try again.'));
    }
  }

  useEffect(() => {
    finishRef.current = finish;
  });

  async function start(action: 'speak' | 'listen') {
    if (!chat || leaseRef.current || !activeRef.current || AudioPlaybackCoordinator.isRecording() || state.busy) return;
    audioPlayback.stop();

    const isSpeak = action === 'speak';
    const speaker = isSpeak ? 'me' : 'them';
    const sourceLanguage = isSpeak ? state.myLanguage : state.theirLanguage;
    const targetLanguage = isSpeak ? state.theirLanguage : state.myLanguage;

    const next = chat.beginVoiceCapture({
      originMode: 'single',
      speaker,
      sourceLanguage,
      targetLanguage,
    });
    if (!next) return;

    leaseRef.current = next;
    preparingRef.current = true;
    cancelledRef.current = false;
    durationMsRef.current = 0;
    AudioPlaybackCoordinator.setRecording(true);
    setActiveAction(action);
    setPhase('preparing');
    setNotice(null);

    try {
      const permission = await requestNativeMicrophoneAccess();
      setDenied(!permission.granted);
      if (!permission.granted) {
        throw new Error('Microphone access is off. Enable it in Settings to record audio.');
      }
      if (cancelledRef.current || !activeRef.current || AppState.currentState !== 'active') {
        throw new Error('Recording cancelled. Tap Speak or Listen when you return.');
      }
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      if (cancelledRef.current || !activeRef.current || AppState.currentState !== 'active') {
        throw new Error('Recording cancelled. Tap Speak or Listen when you return.');
      }
      recorder.record({ forDuration: 30 });
      setPhase('recording');
    } catch (error) {
      if (recorder.getStatus().canRecord) await recorder.stop().catch(() => undefined);
      next.cancel();
      leaseRef.current = null;
      setPhase('idle');
      setActiveAction(null);
      AudioPlaybackCoordinator.setRecording(false);
      setNotice(error instanceof Error ? error.message : 'Could not start recording.');
      await configureNativeAudioSession(false).catch(() => undefined);
    } finally {
      preparingRef.current = false;
    }
  }

  // 30-second cap automatic stop
  useEffect(() => {
    if (phase === 'recording') {
      if (recordingState.durationMillis >= 30000 || (durationMsRef.current > 500 && !recordingState.isRecording)) {
        void finishRef.current();
      }
    }
  }, [phase, recordingState.isRecording, recordingState.durationMillis]);

  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      cancelledRef.current = false;
      const subscription = AppState.addEventListener('change', appState => {
        if (appState !== 'active') {
          AudioPlaybackCoordinator.setRecording(false);
          cancelledRef.current = true;
          chatRef.current?.interruptVoiceRequest();
          audioPlaybackRef.current.stop();
          void finishRef.current();
        }
      });
      return () => {
        activeRef.current = false;
        cancelledRef.current = true;
        chatRef.current?.interruptVoiceRequest();
        AudioPlaybackCoordinator.setRecording(false);
        subscription.remove();
        audioPlaybackRef.current.stop();
        void finishRef.current();
      };
    }, []),
  );

  const secondsRecorded = Math.min(30, Math.floor(recordingState.durationMillis / 1000));
  const secondsRemaining = Math.max(0, 30 - secondsRecorded);
  const latestMessage = state.messages[state.messages.length - 1];
  const isSpeakActive = activeAction === 'speak' && phase === 'recording';
  const isSpeakDisabled = isSpeakActive ? false : (phase !== 'idle' || state.busy);
  const isListenActive = activeAction === 'listen' && phase === 'recording';
  const isListenDisabled = isListenActive ? false : (phase !== 'idle' || state.busy);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.historyRow}>
        <IconButton name="menu" accessibilityLabel="Open history" disabled={!chat} onPress={() => setHistoryVisible(true)} />
      </View>
      <View style={styles.stage}>
        {latestMessage ? <View style={styles.latestCardWrap}>
          <MessageCard
            message={latestMessage}
            disabled={locked}
            onRetry={messageId => { void chat?.retry(messageId); }}
            onPlaySource={audioPlayback.playSource}
            onPlayTranslated={audioPlayback.playTranslated}
            onSaveToPhrasebook={phrasebook.save}
            isSavedInPhrasebook={phrasebook.isSaved(latestMessage.id)}
            isSavingPhrase={phrasebook.isSaving(latestMessage.id)}
            isPlayingSource={audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'source'}
            isPlayingTranslated={audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'translated'}
            isGeneratingSpeech={audioPlayback.generatingId === latestMessage.id}
            onStopPlayback={audioPlayback.stop}
          />
        </View> : <View style={styles.emptyState}>
          <View style={styles.brandBadge}><Image source={require('../../assets/stringphone-logo.png')} resizeMode="contain" style={styles.brandMark} /></View>
          <Text style={styles.brandText}>StringPhone</Text>
        </View>}
      </View>

      {chat && <LiveTranslationControls chat={chat} state={state} mode="single" disabled={locked} />}

      {/* Status banner */}
      <View style={styles.statusSection}>
        {(phrasebook.error || phrasebook.notice) && (
          <Text accessibilityRole={phrasebook.error ? 'alert' : undefined} accessibilityLiveRegion="polite"
            style={phrasebook.error ? styles.error : styles.noticeText} onPress={phrasebook.clearNotices}>
            {phrasebook.error || phrasebook.notice}
          </Text>
        )}
        {audioPlayback.errorNotice && (
          <Text accessibilityRole="alert" style={styles.error} onPress={audioPlayback.clearErrorNotice}>
            {audioPlayback.errorNotice}
          </Text>
        )}
        {(loadError || state.error) && <Text accessibilityRole="alert" style={styles.error}>{loadError || state.error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={styles.noticeText}>{notice}</Text>}
        {denied && (
          <ActionButton
            label="Open microphone settings"
            tone="secondary"
            onPress={() => {
              void Linking.openSettings().catch(() => setNotice('Open phone Settings and enable microphone for StringPhone.'));
            }}
          />
        )}
        {state.voiceRequest && (
          <View style={styles.processingBanner}>
            <Text accessibilityLiveRegion="polite" style={styles.processingText}>
              {state.voiceRequest.phase === 'uploading' ? 'Uploading recording & translating...' : 'Processing translation and saving audio...'}
            </Text>
            <ActionButton label="Cancel" tone="secondary" onPress={() => chat?.interruptVoiceRequest()} />
          </View>
        )}
        {phase === 'recording' && (
          <View style={styles.recordingPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.recordingTimerText}>
              {activeAction === 'speak' ? 'Listening to you' : 'Listening to partner'} Â· {secondsRemaining}s remaining
            </Text>
          </View>
        )}
        {phase === 'save-failed' && (
          <ActionButton label="Retry saving recording" onPress={() => { void save(); }} />
        )}
      </View>

      {/* Speak & Listen action controls */}
      <View style={styles.actionsBar}>
        {/* Speak Column */}
        <View style={styles.actionCol}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isSpeakActive
                ? `Stop speaking recording (${secondsRecorded}/30 seconds)`
                : `Speak in ${languageName(state.myLanguage)}`
            }
            accessibilityState={{
              disabled: isSpeakDisabled,
            }}
            disabled={isSpeakDisabled}
            style={({ pressed }) => [
              styles.actionButton,
              styles.speakButton,
              isSpeakActive && styles.actionButtonActive,
              isSpeakDisabled && styles.actionButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => {
              if (isSpeakActive) {
                void finish();
              } else if (phase === 'idle') {
                void start('speak');
              }
            }}
          >
            <Feather name={isSpeakActive ? 'square' : 'mic'} size={24} color={palette.text} strokeWidth={1.7} />
            <Text style={styles.actionLabel}>
              {isSpeakActive ? `Stop (${secondsRemaining}s)` : 'Speak'}
            </Text>
          </Pressable>
          <LanguagePicker label="My language" value={state.myLanguage} disabled={locked || phase !== 'idle'} compact
            onSelect={code => { void chat?.setLanguages(code, state.theirLanguage, 'single'); }} />
        </View>

        {/* Listen Column */}
        <View style={styles.actionCol}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              isListenActive
                ? `Stop listening recording (${secondsRecorded}/30 seconds)`
                : `Listen in ${languageName(state.theirLanguage)}`
            }
            accessibilityState={{
              disabled: isListenDisabled,
            }}
            disabled={isListenDisabled}
            style={({ pressed }) => [
              styles.actionButton,
              styles.listenButton,
              isListenActive && styles.actionButtonActive,
              isListenDisabled && styles.actionButtonDisabled,
              pressed && styles.actionButtonPressed,
            ]}
            onPress={() => {
              if (isListenActive) {
                void finish();
              } else if (phase === 'idle') {
                void start('listen');
              }
            }}
          >
            <Feather name={isListenActive ? 'square' : 'headphones'} size={24} color={palette.text} strokeWidth={1.7} />
            <Text style={styles.actionLabel}>
              {isListenActive ? `Stop (${secondsRemaining}s)` : 'Listen'}
            </Text>
          </Pressable>
          <LanguagePicker label="Their language" value={state.theirLanguage} disabled={locked || phase !== 'idle'} compact
            onSelect={code => { void chat?.setLanguages(state.myLanguage, code, 'single'); }} />
        </View>
      </View>

      {chat && <HistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} state={state} chat={chat}
        newLabel="New single session" onNewChat={() => { void chat.newModeConversation('single').then(() => setHistoryVisible(false)); }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  historyRow: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 4 },
  stage: { flex: 1, minHeight: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  latestCardWrap: { width: '100%', maxWidth: 520, maxHeight: '100%' },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  brandBadge: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  brandMark: { width: 78, height: 78, tintColor: palette.text },
  brandText: { color: palette.text, fontSize: 23, fontWeight: '600', letterSpacing: 4 },
  statusSection: { paddingHorizontal: 16, paddingVertical: 4, gap: 6 },
  error: { color: palette.danger, fontSize: 14, fontWeight: '500' },
  noticeText: { color: palette.emerald, fontSize: 13 },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.16)',
    padding: 8,
    borderRadius: 18,
  },
  processingText: { fontSize: 13, color: '#FDE68A', flex: 1 },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244,63,94,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.26)',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 8,
    alignSelf: 'center',
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.rose },
  recordingTimerText: { color: '#FDA4AF', fontSize: 14, fontWeight: '600' },
  actionsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 14 : 10,
    gap: 20,
  },
  actionCol: { flex: 1, alignItems: 'center', gap: 8 },
  actionButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: palette.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 8,
  },
  speakButton: { backgroundColor: palette.surface },
  listenButton: { backgroundColor: palette.surface },
  actionButtonActive: { transform: [{ scale: 1.02 }], borderWidth: 2, borderColor: palette.rose, backgroundColor: 'rgba(244,63,94,0.12)' },
  actionButtonDisabled: { opacity: 0.35 },
  actionButtonPressed: { transform: [{ scale: 0.98 }] },
  actionLabel: { fontSize: 10, fontWeight: '700', color: palette.textMuted, letterSpacing: 1.6, textTransform: 'uppercase' },
});
