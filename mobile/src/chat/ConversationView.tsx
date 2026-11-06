import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

export function ConversationView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [historyVisible, setHistoryVisible] = useState(false);

  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));
  const locked = !chat || state.busy || state.historyBusy;

  const liveFlow = useLiveTurnFlow({
    chat,
    state,
    mode: 'conversation',
    disabled: locked,
  });

  useEffect(() => {
    if (isFocused && !state.busy && chat && state.conversation?.origin_mode !== 'conversation') {
      void chat.ensureConversationForMode('conversation');
    }
  }, [isFocused, state.busy, chat, state.conversation?.origin_mode]);

  const isRecording = liveFlow.status === 'recording';
  const isProcessing = liveFlow.status === 'processing';
  const activeSide = liveFlow.activeSide;

  const displayMessages: MessageRow[] = liveFlow.liveDraft
    ? [
        ...state.messages,
        {
          id: liveFlow.liveDraft.id,
          conversation_id: state.conversation?.id ?? '',
          request_id: liveFlow.liveDraft.id,
          speaker: liveFlow.liveDraft.speaker,
          origin_mode: 'conversation',
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

  const activeError = loadError || liveFlow.error || audioPlayback.errorNotice || phrasebook.error;
  const activeNotice = phrasebook.notice || liveFlow.notice || state.notice;

  function handleMicPress(side: 'partner' | 'self') {
    audioPlayback.stop();
    if (isRecording && activeSide === side) {
      void liveFlow.stopRecording();
      return;
    }
    if (liveFlow.status !== 'idle') return;
    const isPartner = side === 'partner';
    void liveFlow.startRecording({
      action: isPartner ? 'listen' : 'speak',
      side,
      speaker: isPartner ? 'them' : 'me',
      sourceLanguage: isPartner ? state.theirLanguage : state.myLanguage,
      targetLanguage: isPartner ? state.myLanguage : state.theirLanguage,
    });
  }

  function renderUserSection(side: 'partner' | 'self') {
    const isTop = side === 'partner';
    const isActive = activeSide === side;
    const isOtherActive = activeSide !== null && activeSide !== side;
    const isCurrentRecording = isActive && isRecording;
    const isCurrentProcessing = isActive && isProcessing;
    const currentLang = isTop ? state.theirLanguage : state.myLanguage;
    const sectionSpeaker: 'me' | 'them' = isTop ? 'them' : 'me';
    const showWaveform = isCurrentRecording && !liveFlow.liveDraft?.transcript;

    const statusLabel = isCurrentRecording
      ? 'LISTENING'
      : isCurrentProcessing
        ? 'TRANSLATING'
        : isOtherActive
          ? "PARTNER'S TURN"
          : '';

    const statusColor = isCurrentRecording
      ? '#FB7185'
      : isCurrentProcessing
        ? '#FBBF24'
        : palette.textSubtle;

    const transcriptBlock = (
      <View
        key="transcript"
        style={[styles.transcriptBlock, isLandscape && styles.transcriptBlockLandscape]}
      >
        {showWaveform ? (
          <AudioWave active />
        ) : (
          <TranscriptCarousel
            history={displayMessages}
            viewerLanguageCode={currentLang}
            playbackMode={msg => (msg.speaker === sectionSpeaker ? 'original' : 'translated')}
            disabled={locked}
            onPlaySource={audioPlayback.playSource}
            onPlayTranslated={audioPlayback.playTranslated}
            onStopPlayback={audioPlayback.stop}
            onSaveToPhrasebook={phrasebook.save}
            isSavedInPhrasebook={phrasebook.isSaved}
            isSavingPhrase={phrasebook.isSaving}
            activeAudio={audioPlayback.activeAudio}
            generatingId={audioPlayback.generatingId}
            compact
          />
        )}
      </View>
    );

    const interactionBlock = (
      <View
        key="interaction"
        style={[styles.interactionBlock, isLandscape && styles.interactionBlockLandscape]}
      >
        <View style={styles.statusSlot}>
          {!!statusLabel && (
            <Text style={[styles.statusLabelText, { color: statusColor }]}>
              {statusLabel}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isCurrentRecording
              ? `Stop ${getNativeLanguageName(currentLang)} recording`
              : `Tap to speak (${getNativeLanguageName(currentLang)})`
          }
          disabled={isOtherActive || isProcessing || (!chat && !isCurrentRecording)}
          onPress={() => handleMicPress(side)}
          style={[
            styles.micCircle,
            isLandscape && styles.micCircleLandscape,
            isCurrentRecording && styles.micCircleRecording,
            isCurrentProcessing && styles.micCircleProcessing,
          ]}
        >
          {isCurrentRecording ? (
            <View style={styles.stopSquare} />
          ) : isCurrentProcessing ? (
            <ActivityIndicator size="small" color={palette.text} />
          ) : (
            <>
              <Feather name="mic" size={20} color={palette.text} />
              <Text style={styles.micTapLabel}>TAP</Text>
            </>
          )}
        </Pressable>
      </View>
    );

    // Match web order: in portrait, top section puts Transcript near the center divider and Mic near the outer edge
    // (because the entire top section is rotated 180deg, placing Transcript first in flex order puts it visually near the center divider).
    const orderedBlocks = [transcriptBlock, interactionBlock];

    return (
      <View
        style={[
          styles.userSection,
          isLandscape && styles.userSectionLandscape,
          isTop && !isLandscape && styles.topSectionPortrait,
          isTop && isLandscape && styles.leftSectionLandscape,
          isOtherActive && styles.sectionDimmed,
        ]}
      >
        <View style={styles.sectionHeader}>
          <View style={styles.languagePickerWrap}>
            <LanguagePicker
              label={isTop ? 'Partner language' : 'My language'}
              value={currentLang}
              disabled={locked || isRecording || isProcessing}
              compact
              onSelect={code => {
                if (isTop) {
                  void chat?.setLanguages(state.myLanguage, code, 'conversation');
                } else {
                  void chat?.setLanguages(code, state.theirLanguage, 'conversation');
                }
              }}
            />
          </View>

          {isCurrentRecording && (
            <View style={styles.timerPill}>
              <View style={styles.timerDot} />
              <Text style={styles.timerText}>{liveFlow.recordingTimer}s</Text>
            </View>
          )}
        </View>

        <View style={styles.sectionBody}>{orderedBlocks}</View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.floatingToolbar} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open history"
          disabled={!chat || isRecording || isProcessing}
          onPress={() => setHistoryVisible(true)}
          style={styles.historyBtn}
        >
          <Feather name="menu" size={18} color={palette.text} />
        </Pressable>
      </View>

      <View style={[styles.splitArea, isLandscape && styles.splitAreaLandscape]}>
        {renderUserSection('partner')}

        <View style={[styles.dividerWrap, isLandscape && styles.dividerWrapLandscape]} pointerEvents="none">
          <View style={[styles.dividerLine, isLandscape && styles.dividerLineLandscape]} />
          <View
            style={[
              styles.dividerBadge,
              isLandscape && styles.dividerBadgeLandscape,
            ]}
          >
            <Image
              source={require('../../assets/stringphone-logo.png')}
              resizeMode="contain"
              style={styles.dividerLogo}
            />
          </View>
        </View>

        {renderUserSection('self')}
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

      {chat && (
        <HistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          state={state}
          chat={chat}
          newLabel="New Conversation"
          onNewChat={() => {
            void chat.newModeConversation('conversation').then(() => setHistoryVisible(false));
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
  floatingToolbar: {
    position: 'absolute',
    top: 6,
    left: 16,
    zIndex: 30,
  },
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitArea: {
    flex: 1,
    flexDirection: 'column',
  },
  splitAreaLandscape: {
    flexDirection: 'row',
  },
  userSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'space-between',
    minHeight: 0,
  },
  userSectionLandscape: {
    paddingVertical: 8,
  },
  topSectionPortrait: {
    backgroundColor: 'rgba(24,24,27,0.35)',
    transform: [{ rotate: '180deg' }],
  },
  leftSectionLandscape: {
    backgroundColor: 'rgba(24,24,27,0.35)',
  },
  sectionDimmed: {
    opacity: 0.3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingVertical: 6,
  },
  languagePickerWrap: {
    width: 148,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.25)',
    backgroundColor: 'rgba(244,63,94,0.12)',
  },
  timerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FB7185',
  },
  timerText: {
    color: '#FDA4AF',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionBody: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transcriptBlock: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptBlockLandscape: {
    paddingVertical: 2,
  },
  interactionBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  interactionBlockLandscape: {
    gap: 4,
    paddingBottom: 2,
  },
  statusSlot: {
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabelText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  micCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#18181B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 6,
  },
  micCircleLandscape: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  micCircleRecording: {
    backgroundColor: '#E11D48',
    borderColor: '#FB7185',
    transform: [{ scale: 1.05 }],
  },
  micCircleProcessing: {
    backgroundColor: '#27272A',
    borderColor: 'rgba(245,158,11,0.45)',
  },
  stopSquare: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: palette.text,
  },
  micTapLabel: {
    color: palette.textMuted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  dividerWrap: {
    height: 2,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  dividerWrapLandscape: {
    width: 2,
    height: '100%',
  },
  dividerLine: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dividerLineLandscape: {
    width: 1,
    height: '100%',
  },
  dividerBadge: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  dividerBadgeLandscape: {
    transform: [{ rotate: '-90deg' }],
  },
  dividerLogo: {
    width: 30,
    height: 30,
    tintColor: palette.text,
  },
  errorPill: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(24,24,27,0.96)',
    zIndex: 35,
  },
  errorPillText: {
    color: '#FFE4E6',
    fontSize: 12,
    fontWeight: '500',
  },
  noticePill: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(24,24,27,0.88)',
    zIndex: 35,
  },
  noticePillText: {
    color: palette.textMuted,
    fontSize: 12,
  },
  settingsRow: {
    position: 'absolute',
    bottom: 52,
    alignSelf: 'center',
    zIndex: 35,
  },
});
