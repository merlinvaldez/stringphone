import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { ActionButton } from '../components/ActionButton';
import { AudioWave } from '../components/AudioWave';
import { LanguagePicker } from '../components/LanguagePicker';
import { getNativeLanguageName } from '../components/LanguageFlag';
import type { MessageRow } from '../storage/history';
import type { ChatState, createTextChatController } from './controller';
import { HistorySheet } from './HistorySheet';
import { TranscriptCarousel } from './TranscriptCarousel';
import { useAudioPlayback } from './useAudioPlayback';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import { useLiveTurnFlow } from '../live/useLiveTurnFlow';
import { palette } from '../theme';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

export function SingleView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [historyVisible, setHistoryVisible] = useState(false);

  const systemNavGap =
    Platform.OS === 'android'
      ? Math.max(0, Math.round(Dimensions.get('screen').height - Dimensions.get('window').height - insets.top))
      : 0;
  const bottomNavClearance =
    Platform.OS === 'ios'
      ? Math.max(20, insets.bottom + 8)
      : Math.max(insets.bottom, systemNavGap, 44) + 12;

  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));
  const locked = !chat || state.busy || state.historyBusy;

  const liveFlow = useLiveTurnFlow({
    chat,
    state,
    mode: 'single',
    disabled: locked,
  });

  useEffect(() => {
    if (isFocused && !state.busy && chat && !state.conversation) {
      void chat.ensureConversationForMode('single');
    }
  }, [isFocused, state.busy, chat, state.conversation]);

  const isRecording = liveFlow.status === 'recording';
  const isProcessing = liveFlow.status === 'processing';
  const activeAction = liveFlow.activeAction;

  const displayMessages: MessageRow[] = liveFlow.liveDraft
    ? [
        ...state.messages,
        {
          id: liveFlow.liveDraft.id,
          conversation_id: state.conversation?.id ?? '',
          request_id: liveFlow.liveDraft.id,
          speaker: liveFlow.liveDraft.speaker,
          origin_mode: 'single',
          input_kind: 'voice',
          source_language: liveFlow.liveDraft.sourceLanguage,
          target_language: liveFlow.liveDraft.targetLanguage,
          original_text: liveFlow.liveDraft.transcript,
          translated_text: liveFlow.liveDraft.translatedText || 'Translating...',
          original_pronunciation: null,
          translated_pronunciation: null,
          status: 'pending',
          error_code: null,
          error_message: null,
          created_at: liveFlow.liveDraft.createdAt,
          updated_at: liveFlow.liveDraft.createdAt,
          processing_attempt: 1,
        },
      ]
    : state.messages;

  const showWaveform = (isRecording || isProcessing) && !liveFlow.liveDraft?.transcript;
  const activeError = loadError || liveFlow.error || audioPlayback.errorNotice || phrasebook.error;
  const activeNotice = phrasebook.notice || liveFlow.notice || state.notice;
  const languageControlsDisabled = locked || isRecording || isProcessing;

  function handleActionPress(action: 'speak' | 'listen') {
    if (isRecording) {
      void liveFlow.stopRecording();
      return;
    }
    if (isProcessing) return;
    const isSpeak = action === 'speak';
    void liveFlow.startRecording({
      action,
      side: isSpeak ? 'self' : 'partner',
      speaker: isSpeak ? 'me' : 'them',
      sourceLanguage: isSpeak ? state.myLanguage : state.theirLanguage,
      targetLanguage: isSpeak ? state.theirLanguage : state.myLanguage,
    });
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.historyRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open history"
          disabled={!chat}
          onPress={() => setHistoryVisible(true)}
          style={styles.historyBtn}
        >
          <Feather name="menu" size={18} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.stage}>
        <View style={styles.topStatusSlot}>
          {isRecording && (
            <View style={styles.recordingPill}>
              <View
                style={[
                  styles.pulseDot,
                  activeAction === 'speak' ? styles.dotRose : styles.dotIndigo,
                ]}
              />
              <Text style={styles.recordingTimerText}>{liveFlow.recordingTimer}s</Text>
            </View>
          )}
          {isProcessing && (
            <Text style={styles.translatingStatusText}>TRANSLATING</Text>
          )}
        </View>

        <View style={styles.centerContent}>
          {showWaveform ? (
            <AudioWave
              active
              color={activeAction === 'speak' ? '#FB7185' : '#818CF8'}
            />
          ) : displayMessages.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.brandBadge}>
                <Image
                  source={require('../../assets/stringphone-logo.png')}
                  resizeMode="contain"
                  style={styles.brandMark}
                />
              </View>
              <Text style={styles.brandText}>StringPhone</Text>
            </View>
          ) : (
            <TranscriptCarousel
              history={displayMessages}
              playbackMode="translated"
              viewerLanguageCode={state.myLanguage}
              disabled={locked}
              onPlaySource={audioPlayback.playSource}
              onPlayTranslated={audioPlayback.playTranslated}
              onStopPlayback={audioPlayback.stop}
              onSaveToPhrasebook={phrasebook.save}
              isSavedInPhrasebook={phrasebook.isSaved}
              isSavingPhrase={phrasebook.isSaving}
              activeAudio={audioPlayback.activeAudio}
              generatingId={audioPlayback.generatingId}
              generatingSourceId={audioPlayback.generatingSourceId}
            />
          )}
        </View>
      </View>

      {!!activeError && (
        <Pressable
          accessibilityRole="alert"
          onPress={() => {
            liveFlow.clearError();
            audioPlayback.clearErrorNotice();
            phrasebook.clearNotices();
          }}
          style={styles.errorPill}
        >
          <Feather name="alert-circle" size={14} color="#FB7185" />
          <Text style={styles.errorPillText}>{activeError}</Text>
        </Pressable>
      )}
      {!activeError && !!activeNotice && (
        <Pressable onPress={phrasebook.clearNotices} style={styles.noticePill}>
          <Text accessibilityLiveRegion="polite" style={styles.noticePillText}>
            {activeNotice}
          </Text>
        </Pressable>
      )}
      {liveFlow.denied && (
        <View style={styles.settingsRow}>
          <ActionButton
            label="Open microphone settings"
            tone="secondary"
            onPress={() => {
              void Linking.openSettings();
            }}
          />
        </View>
      )}

      <View style={[styles.actionsBar, { paddingBottom: bottomNavClearance }]}>
        <View style={styles.actionButtonsRow}>
          <View style={styles.actionBtnSlot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isRecording && activeAction === 'speak'
                  ? 'Stop speak recording'
                  : `Speak (${getNativeLanguageName(state.myLanguage)})`
              }
              disabled={activeAction === 'listen' || isProcessing || (!chat && !(isRecording && activeAction === 'speak'))}
              onPress={() => handleActionPress('speak')}
              style={[
                styles.actionButton,
                activeAction === 'listen' && styles.actionButtonDimmed,
                isRecording && activeAction === 'speak' && styles.speakButtonActive,
                isProcessing && activeAction === 'speak' && styles.actionButtonProcessing,
              ]}
            >
              {isRecording && activeAction === 'speak' ? (
                <View style={styles.stopSquare} />
              ) : isProcessing && activeAction === 'speak' ? (
                <ActivityIndicator size="small" color={palette.text} />
              ) : (
                <>
                  <Feather name="mic" size={24} color={palette.text} />
                  <Text style={styles.actionLabel}>SPEAK</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.invertBtnSpacer} />

          <View style={styles.actionBtnSlot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isRecording && activeAction === 'listen'
                  ? 'Stop listen recording'
                  : `Listen (${getNativeLanguageName(state.theirLanguage)})`
              }
              disabled={activeAction === 'speak' || isProcessing || (!chat && !(isRecording && activeAction === 'listen'))}
              onPress={() => handleActionPress('listen')}
              style={[
                styles.actionButton,
                activeAction === 'speak' && styles.actionButtonDimmed,
                isRecording && activeAction === 'listen' && styles.listenButtonActive,
                isProcessing && activeAction === 'listen' && styles.actionButtonProcessing,
              ]}
            >
              {isRecording && activeAction === 'listen' ? (
                <View style={styles.stopSquare} />
              ) : isProcessing && activeAction === 'listen' ? (
                <ActivityIndicator size="small" color={palette.text} />
              ) : (
                <>
                  <Feather name="headphones" size={24} color={palette.text} />
                  <Text style={styles.actionLabel}>LISTEN</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.languageRow}>
          <View style={[styles.languagePickerWrap, activeAction === 'listen' && styles.actionButtonDimmed]}>
            <LanguagePicker
              label="My language"
              value={state.myLanguage}
              disabled={languageControlsDisabled}
              compact
              onSelect={code => {
                void chat?.setLanguages(code, state.theirLanguage, 'single');
              }}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Invert languages"
            disabled={languageControlsDisabled || state.myLanguage === state.theirLanguage}
            onPress={() => {
              void chat?.swapLanguages('single');
            }}
            style={[
              styles.invertBtn,
              (languageControlsDisabled || state.myLanguage === state.theirLanguage) && styles.disabledBtn,
            ]}
          >
            <Feather name="repeat" size={16} color="#E4E4E7" />
          </Pressable>

          <View style={[styles.languagePickerWrap, activeAction === 'speak' && styles.actionButtonDimmed]}>
            <LanguagePicker
              label="Their language"
              value={state.theirLanguage}
              disabled={languageControlsDisabled}
              compact
              onSelect={code => {
                void chat?.setLanguages(state.myLanguage, code, 'single');
              }}
            />
          </View>
        </View>
      </View>

      {chat && (
        <HistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          state={state}
          chat={chat}
          newLabel="New Conversation"
          onNewChat={() => {
            void chat.newModeConversation('single').then(() => setHistoryVisible(false));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  historyRow: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 4,
  },
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topStatusSlot: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotRose: {
    backgroundColor: '#FB7185',
  },
  dotIndigo: {
    backgroundColor: '#818CF8',
  },
  recordingTimerText: {
    color: '#D4D4D8',
    fontSize: 12,
    fontWeight: '700',
  },
  translatingStatusText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
  },
  centerContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  brandBadge: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    shadowColor: palette.sky,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  brandMark: {
    width: 78,
    height: 78,
    tintColor: palette.text,
  },
  brandText: {
    color: palette.text,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: 4,
  },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(24,24,27,0.96)',
  },
  errorPillText: {
    color: '#FFE4E6',
    fontSize: 12,
    fontWeight: '500',
  },
  noticePill: {
    alignSelf: 'center',
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(24,24,27,0.85)',
  },
  noticePillText: {
    color: palette.textMuted,
    fontSize: 12,
  },
  settingsRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  actionsBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 24,
    gap: 14,
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 10,
  },
  actionBtnSlot: {
    flex: 1,
    alignItems: 'center',
  },
  invertBtnSpacer: {
    width: 44,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    gap: 10,
  },
  languagePickerWrap: {
    flex: 1,
    minWidth: 0,
  },
  invertBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.35,
  },
  actionButtonDimmed: {
    opacity: 0.3,
  },
  actionButton: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#18181B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 8,
  },
  speakButtonActive: {
    backgroundColor: '#E11D48',
    borderColor: '#FB7185',
    transform: [{ scale: 1.05 }],
  },
  listenButtonActive: {
    backgroundColor: '#4F46E5',
    borderColor: '#818CF8',
    transform: [{ scale: 1.05 }],
  },
  actionButtonProcessing: {
    backgroundColor: '#27272A',
    borderColor: 'rgba(245,158,11,0.45)',
  },
  stopSquare: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: palette.text,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: palette.textMuted,
    letterSpacing: 1.8,
  },
});
