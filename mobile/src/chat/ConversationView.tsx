import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
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
import type { ChatState, createTextChatController } from './controller';
import { HistorySheet } from './HistorySheet';
import { languageName, messageDirection } from './presentation';
import { useAudioPlayback } from './useAudioPlayback';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

type ActiveSide = 'partner' | 'self' | null;

export function ConversationView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [historyVisible, setHistoryVisible] = useState(false);
  const [activeSide, setActiveSide] = useState<ActiveSide>(null);
  const [phase, setPhase] = useState<'idle' | 'preparing' | 'recording' | 'saving' | 'save-failed'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const audioPlayback = useAudioPlayback();

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

  // Select this mode only while its tab is actually focused. Native tabs may
  // keep the other mode screens mounted in the background.
  useEffect(() => {
    if (isFocused && chat && state.conversation?.origin_mode !== 'conversation') {
      void chat.ensureConversationForMode('conversation');
    }
  }, [isFocused, chat, state.conversation?.origin_mode]);

  const locked = !chat || state.busy || state.historyBusy || phase === 'recording' || phase === 'preparing' || phase === 'saving';

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
      setActiveSide(null);
      setNotice('Turn saved.');
    } catch (error) {
      setPhase('save-failed');
      setNotice(`Recording save is unconfirmed. Tap Retry. ${error instanceof Error ? error.message : ''}`);
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
      if (!uri || duration <= 0) throw new Error('No usable recording captured. Try again.');
      capturedRef.current = { uri, duration };
      await save();
    } catch (error) {
      leaseRef.current?.cancel();
      leaseRef.current = null;
      setPhase('idle');
      setActiveSide(null);
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

  async function start(side: 'partner' | 'self') {
    if (!chat || leaseRef.current || !activeRef.current || AudioPlaybackCoordinator.isRecording() || state.busy) return;
    audioPlayback.stop();

    const isSelf = side === 'self';
    const speaker = isSelf ? 'me' : 'them';
    const sourceLanguage = isSelf ? state.myLanguage : state.theirLanguage;
    const targetLanguage = isSelf ? state.theirLanguage : state.myLanguage;

    const next = chat.beginVoiceCapture({
      originMode: 'conversation',
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
    setActiveSide(side);
    setPhase('preparing');
    setNotice(null);

    try {
      const permission = await requestNativeMicrophoneAccess();
      setDenied(!permission.granted);
      if (!permission.granted) {
        throw new Error('Microphone access is off. Enable it in Settings to record.');
      }
      if (cancelledRef.current || !activeRef.current || AppState.currentState !== 'active') {
        throw new Error('Recording cancelled.');
      }
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      if (cancelledRef.current || !activeRef.current || AppState.currentState !== 'active') {
        throw new Error('Recording cancelled.');
      }
      recorder.record({ forDuration: 30 });
      setPhase('recording');
    } catch (error) {
      if (recorder.getStatus().canRecord) await recorder.stop().catch(() => undefined);
      next.cancel();
      leaseRef.current = null;
      setPhase('idle');
      setActiveSide(null);
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

  // Filter messages for conversation mode
  const messages = state.messages;
  const latestMessage = messages[messages.length - 1] ?? null;
  const phrasebook = useSaveToPhrasebook(latestMessage ? [latestMessage.id] : []);

  function renderSideContent(side: 'partner' | 'self') {
    const isPartner = side === 'partner';
    const isThisSideActive = activeSide === side && phase === 'recording';
    const isOtherSideActive = activeSide !== null && activeSide !== side && phase === 'recording';
    const currentLang = isPartner ? state.theirLanguage : state.myLanguage;
    const sideTitle = isPartner ? 'Partner' : 'You';

    return (
      <View style={[styles.sideContent, isLandscape && styles.sideContentLandscape]}>
        {/* Top bar for this half */}
        <View style={[styles.sideHeader, isLandscape && styles.sideHeaderLandscape]}>
          <View>
            <Text style={styles.sideLabel}>{sideTitle} ({languageName(currentLang)})</Text>
          </View>
          <LanguagePicker
            label={isPartner ? 'Partner language' : 'My language'}
            value={currentLang}
            disabled={locked || phase !== 'idle'}
            onSelect={code => {
              if (isPartner) {
                void chat?.setLanguages(state.myLanguage, code, 'conversation');
              } else {
                void chat?.setLanguages(code, state.theirLanguage, 'conversation');
              }
            }}
          />
        </View>

        {/* Transcript / message preview for this side */}
        <View style={[styles.transcriptBox, isLandscape && styles.transcriptBoxLandscape]}>
          {latestMessage ? (
            <View style={[styles.latestCard, isLandscape && styles.latestCardLandscape]}>
              <Text style={styles.turnSpeakerTag}>
                {latestMessage.speaker === (isPartner ? 'them' : 'me') ? 'Latest: Original' : 'Latest: Translated'}
              </Text>
              <Text
                selectable
                style={[
                  styles.primaryText,
                  isLandscape && styles.primaryTextLandscape,
                  messageDirection(isPartner ? latestMessage.target_language : latestMessage.source_language),
                ]}
              >
                {isPartner
                  ? (latestMessage.speaker === 'them' ? latestMessage.original_text : latestMessage.translated_text || 'Translating...')
                  : (latestMessage.speaker === 'me' ? latestMessage.original_text : latestMessage.translated_text || 'Translating...')}
              </Text>
              {latestMessage.status === 'ready' && (
                <View style={[styles.audioRow, isLandscape && styles.audioRowLandscape]}>
                  {/* Option to play original recording */}
                  {latestMessage.input_kind === 'voice' && (
                    <ActionButton
                      label={
                        audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'source'
                          ? 'Stop'
                          : 'Play recording'
                      }
                      tone="secondary"
                      disabled={locked}
                      onPress={() => {
                        if (audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'source') {
                          audioPlayback.stop();
                        } else {
                          void audioPlayback.playSource(latestMessage.id);
                        }
                      }}
                    />
                  )}
                  {/* Option to play translated speech */}
                  {latestMessage.translated_text?.trim() && (
                    <ActionButton
                      label={
                        audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'translated'
                          ? 'Stop'
                          : audioPlayback.generatingId === latestMessage.id
                            ? 'Generating...'
                            : 'Play speech'
                      }
                      tone="secondary"
                      disabled={locked || audioPlayback.generatingId === latestMessage.id}
                      onPress={() => {
                        if (audioPlayback.activeAudio?.messageId === latestMessage.id && audioPlayback.activeAudio.role === 'translated') {
                          audioPlayback.stop();
                        } else {
                          void audioPlayback.playTranslated(latestMessage.id);
                        }
                      }}
                    />
                  )}
                  {!isPartner && latestMessage.translated_text?.trim() && latestMessage.original_text.trim() && (
                    <ActionButton
                      label={phrasebook.isSaved(latestMessage.id) ? 'Saved to Phrasebook' : phrasebook.isSaving(latestMessage.id) ? 'Saving phrase...' : 'Save phrase'}
                      tone="secondary"
                      disabled={locked || phrasebook.isSaved(latestMessage.id) || phrasebook.isSaving(latestMessage.id)}
                      onPress={() => { void phrasebook.save(latestMessage.id); }}
                    />
                  )}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.emptyPrompt}>Tap the button below to speak</Text>
          )}
        </View>

        {/* Status / Locking Notice */}
        {isOtherSideActive && (
          <View style={styles.lockedPill}>
            <Text style={styles.lockedText}>Partner&apos;s turn to speak</Text>
          </View>
        )}
        {isThisSideActive && (
          <View style={styles.activeRecordingPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.activeRecordingText}>Listening... {secondsRemaining}s</Text>
          </View>
        )}

        {/* Circular Record Button */}
        <View style={[styles.buttonWrapper, isLandscape && styles.buttonWrapperLandscape]}>
          {(() => {
            const isButtonDisabled = isThisSideActive ? false : (isOtherSideActive || phase !== 'idle' || state.busy);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isThisSideActive
                    ? `Stop recording (${secondsRecorded}/30 seconds)`
                    : isOtherSideActive
                      ? "Partner's turn"
                      : `Tap to speak in ${languageName(currentLang)}`
                }
                accessibilityState={{
                  disabled: isButtonDisabled,
                }}
                disabled={isButtonDisabled}
                style={({ pressed }) => [
                  styles.micCircle,
                  isLandscape && styles.micCircleLandscape,
                  isPartner ? styles.partnerCircle : styles.selfCircle,
                  isThisSideActive && styles.micCircleActive,
                  isButtonDisabled && styles.micCircleDisabled,
                  pressed && styles.micCirclePressed,
                ]}
                onPress={() => {
                  if (isThisSideActive) {
                    void finish();
                  } else if (phase === 'idle') {
                    void start(side);
                  }
                }}
              >
                <Text style={styles.micIcon}>{isThisSideActive ? '⏹' : '🎤'}</Text>
                <Text style={styles.micBtnText}>
                  {isThisSideActive ? `${secondsRemaining}s` : 'Tap to speak'}
                </Text>
              </Pressable>
            );
          })()}
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      {/* Top utility toolbar */}
      <View style={styles.topToolbar}>
        <Text style={styles.screenTitle}>Conversation</Text>
        <ActionButton label="History" tone="secondary" disabled={locked && phase === 'idle'} onPress={() => setHistoryVisible(true)} />
        <ActionButton label="New session" disabled={locked} onPress={() => { void chat?.newModeConversation('conversation'); }} />
      </View>

      {audioPlayback.errorNotice && (
        <Text accessibilityRole="alert" style={styles.error} onPress={audioPlayback.clearErrorNotice}>
          {audioPlayback.errorNotice}
        </Text>
      )}
      {(phrasebook.error || phrasebook.notice) && (
        <Text accessibilityRole={phrasebook.error ? 'alert' : undefined} accessibilityLiveRegion="polite"
          style={phrasebook.error ? styles.error : styles.notice} onPress={phrasebook.clearNotices}>
          {phrasebook.error || phrasebook.notice}
        </Text>
      )}
      {(loadError || state.error) && <Text accessibilityRole="alert" style={styles.error}>{loadError || state.error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      {denied && (
        <ActionButton
          label="Open microphone settings"
          tone="secondary"
          onPress={() => {
            void Linking.openSettings().catch(() => setNotice('Open phone Settings and enable microphone for StringPhone.'));
          }}
        />
      )}

      {/* Main split view container */}
      <View style={[styles.splitArea, isLandscape && styles.splitAreaLandscape]}>
        {/* Top / Left Section (Partner) */}
        <View
          style={[
            styles.halfSection,
            isLandscape && styles.halfSectionLandscape,
            styles.partnerSection,
            !isLandscape && styles.partnerSectionPortrait,
          ]}
        >
          {renderSideContent('partner')}
        </View>

        {/* Divider bar */}
        <View style={[styles.divider, isLandscape && styles.dividerLandscape]}>
          {!isLandscape && <Text style={styles.dividerBrand}>STRINGPHONE</Text>}
        </View>

        {/* Bottom / Right Section (Self) */}
        <View style={[styles.halfSection, isLandscape && styles.halfSectionLandscape, styles.selfSection]}>
          {renderSideContent('self')}
        </View>
      </View>

      {chat && <HistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} state={state} chat={chat} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#182A23' },
  topToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#111D18',
    borderBottomWidth: 1,
    borderBottomColor: '#285B48',
  },
  screenTitle: { color: '#E8EFEA', fontSize: 18, fontWeight: '700' },
  splitArea: { flex: 1, flexDirection: 'column' },
  splitAreaLandscape: { flexDirection: 'row' },
  halfSection: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  halfSectionLandscape: { paddingVertical: 8 },
  partnerSection: { backgroundColor: '#15241E' },
  partnerSectionPortrait: {
    // 180 degree rotation in portrait so partner sitting across the table sees it right-side-up!
    transform: [{ rotate: '180deg' }],
  },
  selfSection: { backgroundColor: '#182A23' },
  sideContent: { flex: 1, justifyContent: 'space-between' },
  sideContentLandscape: { minHeight: 0 },
  sideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  sideHeaderLandscape: { paddingBottom: 2 },
  sideLabel: { color: '#A5C2B4', fontSize: 13, fontWeight: '600' },
  transcriptBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  transcriptBoxLandscape: { minHeight: 0, paddingVertical: 2 },
  latestCard: {
    backgroundColor: '#20372D',
    borderRadius: 12,
    padding: 12,
    width: '100%',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2D4E40',
  },
  latestCardLandscape: { padding: 8, gap: 4 },
  turnSpeakerTag: { color: '#88AB9A', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  primaryText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  primaryTextLandscape: { fontSize: 16 },
  audioRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  audioRowLandscape: { marginTop: 0, gap: 4 },
  emptyPrompt: { color: '#688878', fontSize: 14, fontStyle: 'italic' },
  lockedPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 6,
  },
  lockedText: { color: '#88AB9A', fontSize: 12, fontWeight: '600' },
  activeRecordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7F1D1D',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'center',
    marginBottom: 6,
    gap: 6,
  },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  activeRecordingText: { color: '#FCA5A5', fontSize: 12, fontWeight: '600' },
  buttonWrapper: { alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  buttonWrapperLandscape: { paddingVertical: 0 },
  micCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    gap: 2,
  },
  micCircleLandscape: { width: 60, height: 60, borderRadius: 30 },
  partnerCircle: { backgroundColor: '#1E40AF' },
  selfCircle: { backgroundColor: '#B91C1C' },
  micCircleActive: {
    borderWidth: 3,
    borderColor: '#FDE047',
    transform: [{ scale: 1.05 }],
  },
  micCircleDisabled: { opacity: 0.25 },
  micCirclePressed: { transform: [{ scale: 0.95 }] },
  micIcon: { fontSize: 24, color: '#FFFFFF' },
  micBtnText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  divider: {
    height: 18,
    backgroundColor: '#0F1814',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerLandscape: {
    width: 20,
    height: '100%',
  },
  dividerBrand: {
    color: '#3B6854',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
  },
  error: { color: '#F87171', fontSize: 13, paddingHorizontal: 16, paddingVertical: 4 },
  notice: { color: '#6EE7B7', fontSize: 13, paddingHorizontal: 16, paddingVertical: 4 },
});
