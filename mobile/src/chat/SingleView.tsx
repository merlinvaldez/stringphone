import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
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
import { LanguagePicker } from '../components/LanguagePicker';
import type { MessageRow } from '../storage/history';
import type { ChatState, createTextChatController } from './controller';
import { HistorySheet } from './HistorySheet';
import { MessageCard } from './MessageCard';
import { languageName } from './presentation';
import { useAudioPlayback } from './useAudioPlayback';

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
  const listRef = useRef<FlatList<MessageRow>>(null);

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
    if (isFocused && chat && state.conversation?.origin_mode !== 'single') {
      void chat.ensureConversationForMode('single');
    }
  }, [isFocused, chat, state.conversation?.origin_mode]);

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
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
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
  const isSpeakActive = activeAction === 'speak' && phase === 'recording';
  const isSpeakDisabled = isSpeakActive ? false : (phase !== 'idle' || state.busy);
  const isListenActive = activeAction === 'listen' && phase === 'recording';
  const isListenDisabled = isListenActive ? false : (phase !== 'idle' || state.busy);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <View style={styles.toolbar}>
        <View style={styles.titleArea}>
          <Text accessibilityRole="header" style={styles.title}>Single</Text>
          <Text style={styles.subtitle}>Hold device & take turns</Text>
        </View>
        <ActionButton label="History" tone="secondary" disabled={locked && phase === 'idle'} onPress={() => setHistoryVisible(true)} />
        <ActionButton label="New session" disabled={locked} onPress={() => { void chat?.newModeConversation('single'); }} />
      </View>

      <View style={styles.languagesBar}>
        <View style={styles.langCol}>
          <Text style={styles.langTag}>You speak ({languageName(state.myLanguage)})</Text>
          <LanguagePicker
            label="My language"
            value={state.myLanguage}
            disabled={locked || phase !== 'idle'}
            compact
            onSelect={code => { void chat?.setLanguages(code, state.theirLanguage, 'single'); }}
          />
        </View>
        <ActionButton
          label="Swap"
          hint="Exchange my language and partner language"
          tone="secondary"
          disabled={locked || phase !== 'idle' || state.myLanguage === state.theirLanguage}
          onPress={() => { void chat?.swapLanguages('single'); }}
        />
        <View style={styles.langCol}>
          <Text style={styles.langTag}>They speak ({languageName(state.theirLanguage)})</Text>
          <LanguagePicker
            label="Their language"
            value={state.theirLanguage}
            disabled={locked || phase !== 'idle'}
            compact
            onSelect={code => { void chat?.setLanguages(state.myLanguage, code, 'single'); }}
          />
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={state.messages}
        keyExtractor={item => item.id}
        style={styles.list}
        contentContainerStyle={styles.messages}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Ready for conversation</Text>
            <Text style={styles.emptyNote}>Tap Speak to talk in your language, or Listen for the other person&apos;s language.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <MessageCard
            message={item}
            disabled={locked}
            onRetry={messageId => { void chat?.retry(messageId); }}
            onPlaySource={audioPlayback.playSource}
            onPlayTranslated={audioPlayback.playTranslated}
            isPlayingSource={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'source'}
            isPlayingTranslated={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'translated'}
            isGeneratingSpeech={audioPlayback.generatingId === item.id}
            onStopPlayback={audioPlayback.stop}
          />
        )}
      />

      {/* Status banner */}
      <View style={styles.statusSection}>
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
              {activeAction === 'speak' ? 'Listening to you' : 'Listening to partner'} · {secondsRemaining}s remaining
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
            <Text style={styles.actionIcon}>{isSpeakActive ? '⏹' : '🎤'}</Text>
            <Text style={styles.actionLabel}>
              {isSpeakActive ? `Stop (${secondsRemaining}s)` : 'Speak'}
            </Text>
            <Text style={styles.actionLang}>{languageName(state.myLanguage)}</Text>
          </Pressable>
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
            <Text style={styles.actionIcon}>{isListenActive ? '⏹' : '👂'}</Text>
            <Text style={styles.actionLabel}>
              {isListenActive ? `Stop (${secondsRemaining}s)` : 'Listen'}
            </Text>
            <Text style={styles.actionLang}>{languageName(state.theirLanguage)}</Text>
          </Pressable>
        </View>
      </View>

      {chat && <HistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} state={state} chat={chat} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2' },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  titleArea: { flexGrow: 1 },
  title: { color: '#182A23', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#48574F', fontSize: 13 },
  languagesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#DEE5DF',
    gap: 8,
  },
  langCol: { flex: 1, gap: 4 },
  langTag: { fontSize: 12, fontWeight: '600', color: '#48574F' },
  list: { flex: 1 },
  messages: { padding: 16, gap: 12 },
  emptyContainer: { padding: 24, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#182A23' },
  emptyNote: { fontSize: 14, color: '#48574F', textAlign: 'center' },
  statusSection: { paddingHorizontal: 16, paddingVertical: 4, gap: 6 },
  error: { color: '#9B2727', fontSize: 14, fontWeight: '500' },
  noticeText: { color: '#285B48', fontSize: 14 },
  processingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEF3C7', padding: 8, borderRadius: 8 },
  processingText: { fontSize: 13, color: '#92400E', flex: 1 },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    gap: 8,
    alignSelf: 'center',
  },
  pulseDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
  recordingTimerText: { color: '#991B1B', fontSize: 14, fontWeight: '600' },
  actionsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 16,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#DEE5DF',
    backgroundColor: '#FFFFFF',
  },
  actionCol: { flex: 1 },
  actionButton: {
    minHeight: 84,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  speakButton: { backgroundColor: '#DC2626' },
  listenButton: { backgroundColor: '#4338CA' },
  actionButtonActive: { transform: [{ scale: 1.02 }], borderWidth: 3, borderColor: '#FDE047' },
  actionButtonDisabled: { opacity: 0.35 },
  actionButtonPressed: { transform: [{ scale: 0.98 }] },
  actionIcon: { fontSize: 24, color: '#FFFFFF' },
  actionLabel: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  actionLang: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
});
