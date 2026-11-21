import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { interpolateTemplate } from '../../../shared/uiStrings';
import { AudioWave } from '../components/AudioWave';
import { getNativeLanguageName } from '../components/LanguageFlag';
import { LanguagePicker } from '../components/LanguagePicker';
import { HistorySheet } from '../chat/HistorySheet';
import { MessageCard } from '../chat/MessageCard';
import type { ChatState, createTextChatController } from '../chat/controller';
import { compactLabelStyle, languageName, messageDirection } from '../chat/presentation';
import { useAudioPlayback } from '../chat/useAudioPlayback';
import { useUiStrings } from '../chat/useUiStrings';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import type { MessageRow } from '../storage/history';
import { palette } from '../theme';
import { useNativeLiveAudioQueue } from './useNativeLiveAudioQueue';
import { useNativeLiveListen } from './useNativeLiveListen';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

function formatElapsedTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function LiveListenView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [historyVisible, setHistoryVisible] = useState(false);
  const [composerText, setComposerText] = useState('');
  const list = useRef<FlatList<MessageRow>>(null);
  const scrollAfterUpdate = useRef(false);

  const liveAudioQueue = useNativeLiveAudioQueue();
  const audioPlayback = useAudioPlayback(undefined, {
    onBeforeManualPlay: liveAudioQueue.yieldToManualPlayback,
  });
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));

  const liveListen = useNativeLiveListen({
    chat,
    state,
    isPlaybackActive: liveAudioQueue.isPlaying,
    onEnqueuePlayback: item => {
      liveAudioQueue.enqueue(item);
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    },
    onBeforeStart: () => {
      audioPlayback.stop();
    },
  });

  useEffect(() => {
    if (isFocused && !state.busy && chat && !state.conversation) {
      void chat.ensureConversationForMode('chat');
    }
  }, [isFocused, state.busy, chat, state.conversation]);

  const strings = useUiStrings(state.myLanguage);
  const id = state.conversation?.id ?? '';
  const locked = !chat || state.busy || state.historyBusy;
  const isStarting = liveListen.status === 'starting';
  const isListening = liveListen.status === 'listening';
  const isStopping = liveListen.status === 'stopping';
  const isLiveActive = isStarting || isListening || isStopping;
  const languageControlsDisabled = locked || isLiveActive;
  const hasDraft = Boolean(composerText.trim());
  const composerLabel = interpolateTemplate(strings.messageIn, {
    language: getNativeLanguageName(state.myLanguage),
  });

  const activeError = loadError || liveListen.error || audioPlayback.errorNotice || phrasebook.error;
  const activeNotice = phrasebook.notice || liveListen.notice || state.notice;
  const autoPlayLabel = liveAudioQueue.autoPlayEnabled
    ? strings.liveAutoPlayOn
    : strings.liveAutoPlayOff;

  async function handleSendText() {
    if (!chat || !id || !hasDraft || isLiveActive || locked) return;
    const text = composerText;
    scrollAfterUpdate.current = true;
    setComposerText('');
    const ok = await chat.send(text);
    if (!ok) {
      setComposerText(current => (current ? current : text));
    }
  }

  function handlePrimaryAction() {
    if (isListening || isStarting) {
      void liveListen.stopListening();
      return;
    }
    if (hasDraft) {
      void handleSendText();
      return;
    }
    scrollAfterUpdate.current = true;
    void liveListen.startListening();
  }

  function handleRetryMessage(message: MessageRow) {
    if (
      message.input_kind === 'voice' &&
      !message.translated_text?.trim() &&
      (message.speaker === 'them' || message.source_language !== state.myLanguage)
    ) {
      void liveListen.retryDraft(message.id);
      return;
    }
    void chat?.retry(message.id);
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.chatHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.openHistory}
          disabled={!chat}
          onPress={() => setHistoryVisible(true)}
          style={styles.headerIconBtn}
        >
          <Feather name="menu" size={18} color={palette.text} />
        </Pressable>
        <View style={styles.languagePickerWrap}>
          <LanguagePicker
            strings={strings}
            label={strings.myLanguage}
            value={state.myLanguage}
            disabled={languageControlsDisabled}
            compact
            onSelect={code => {
              void chat?.setLanguages(code, state.theirLanguage);
            }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={strings.invertLanguages}
          disabled={languageControlsDisabled || state.myLanguage === state.theirLanguage}
          onPress={() => {
            void chat?.swapLanguages();
          }}
          style={[
            styles.headerIconBtn,
            (languageControlsDisabled || state.myLanguage === state.theirLanguage) && styles.disabledBtn,
          ]}
        >
          <Feather name="repeat" size={16} color="#E4E4E7" />
        </Pressable>
        <View style={styles.languagePickerWrap}>
          <LanguagePicker
            strings={strings}
            label={strings.theirLanguage}
            value={state.theirLanguage}
            disabled={languageControlsDisabled}
            compact
            onSelect={code => {
              void chat?.setLanguages(state.myLanguage, code);
            }}
          />
        </View>
      </View>

      <FlatList
        key={id || 'empty'}
        ref={list}
        data={state.messages}
        keyExtractor={message => message.id}
        style={styles.list}
        contentContainerStyle={styles.messages}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => {
          if (scrollAfterUpdate.current || isLiveActive) {
            list.current?.scrollToEnd({ animated: true });
            scrollAfterUpdate.current = false;
          }
        }}
        ListEmptyComponent={
          chat ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyBadge}>
                <Image
                  source={require('../../assets/stringphone-logo.png')}
                  resizeMode="contain"
                  style={styles.emptyLogo}
                />
              </View>
              <Text style={styles.emptyBrand}>StringPhone</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <MessageCard
            strings={strings}
            message={item}
            baseLanguageCode={state.myLanguage}
            disabled={locked && item.status !== 'draft' && item.status !== 'failed' && item.status !== 'interrupted'}
            onRetry={() => handleRetryMessage(item)}
            onPlaySource={audioPlayback.playSource}
            onPlayTranslated={audioPlayback.playTranslated}
            onSaveToPhrasebook={phrasebook.save}
            isSavedInPhrasebook={phrasebook.isSaved(item.id)}
            isSavingPhrase={phrasebook.isSaving(item.id)}
            isPlayingSource={
              audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'source'
            }
            isPlayingTranslated={
              (audioPlayback.activeAudio?.messageId === item.id &&
                audioPlayback.activeAudio.role === 'translated') ||
              liveAudioQueue.activePlayingMessageId === item.id
            }
            isGeneratingSourceSpeech={audioPlayback.generatingSourceId === item.id}
            isGeneratingSpeech={audioPlayback.generatingId === item.id}
            onStopPlayback={() => {
              liveAudioQueue.yieldToManualPlayback();
              audioPlayback.stop();
            }}
          />
        )}
      />

      {liveListen.previewDraft && (
        <View style={styles.previewWrap}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <Feather name="radio" size={14} color="#FB7185" />
              <Text style={styles.previewTitle}>{strings.liveListening}</Text>
            </View>
            <Text style={styles.previewLang}>{liveListen.previewDraft.sourceLanguageLabel || languageName(liveListen.previewDraft.sourceLanguageCode)}</Text>
            <Text selectable style={styles.previewText}>{liveListen.previewDraft.transcript}</Text>
            {liveListen.previewDraft.translatedText ? (
              <>
                <Text style={styles.previewLang}>{liveListen.previewDraft.targetLanguageLabel || languageName(liveListen.previewDraft.targetLanguageCode)}</Text>
                <Text selectable style={styles.previewTranslation}>{liveListen.previewDraft.translatedText}</Text>
              </>
            ) : null}
          </View>
        </View>
      )}

      <View style={[styles.composerArea, { paddingBottom: Math.max(8, insets.bottom) }]}>
        {!!activeError && (
          <Pressable
            accessibilityRole="alert"
            onPress={() => {
              liveListen.clearError();
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

        <View style={styles.composerCard}>
          {isLiveActive && (
            <View style={styles.recordingBanner}>
              <View style={styles.recordingBannerLeft}>
                <View
                  style={[
                    styles.statusDot,
                    isListening ? styles.dotRose : isStarting ? styles.dotSky : styles.dotAmber,
                  ]}
                />
                <Text style={[styles.recordingBannerText, compactLabelStyle(state.myLanguage)]}>
                  {isStarting
                    ? strings.connectingMicrophone
                    : isListening
                      ? `${strings.liveListening} · ${formatElapsedTime(liveListen.elapsedSeconds)}`
                      : strings.livePaused}
                </Text>
              </View>
              {isListening ? (
                <AudioWave active color="#FB7185" style={styles.bannerWave} />
              ) : (
                <ActivityIndicator size="small" color={isStarting ? '#38BDF8' : '#FBBF24'} />
              )}
            </View>
          )}

          <View style={styles.composerRow}>
            <TextInput
              accessibilityLabel={composerLabel}
              placeholder={id ? composerLabel : strings.startChatFirst}
              placeholderTextColor={palette.textSubtle}
              value={composerText}
              onChangeText={setComposerText}
              editable={!!chat && !!id && !isLiveActive}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={() => {
                void handleSendText();
              }}
              style={[styles.input, messageDirection(state.myLanguage)]}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={autoPlayLabel}
              accessibilityState={{ selected: liveAudioQueue.autoPlayEnabled }}
              onPress={liveAudioQueue.toggleAutoPlay}
              style={[
                styles.autoPlayBtn,
                liveAudioQueue.autoPlayEnabled && styles.autoPlayBtnActive,
              ]}
            >
              <Feather
                name={liveAudioQueue.autoPlayEnabled ? 'volume-2' : 'volume-x'}
                size={18}
                color={liveAudioQueue.autoPlayEnabled ? '#A7F3D0' : palette.textMuted}
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isListening
                  ? strings.stopRecording
                  : isStarting
                    ? strings.connectingMicrophone
                    : hasDraft
                      ? strings.sendTextMessage
                      : strings.liveListening
              }
              disabled={!isListening && !isStarting && (!chat || !id || isStopping || (locked && !hasDraft))}
              onPress={handlePrimaryAction}
              style={[
                styles.primaryBtn,
                isListening
                  ? styles.primaryBtnRecording
                  : hasDraft
                    ? styles.primaryBtnSend
                    : styles.primaryBtnMic,
              ]}
            >
              {isStarting || isStopping ? (
                <ActivityIndicator size="small" color={palette.text} />
              ) : isListening ? (
                <Feather name="square" size={18} color={palette.text} />
              ) : hasDraft ? (
                <Feather name="send" size={18} color="#09090B" />
              ) : (
                <Feather name="mic" size={18} color={palette.text} />
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {chat && (
        <HistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          state={state}
          chat={chat}
          strings={strings}
          onNewChat={() => {
            void chat.newConversation().then(() => setHistoryVisible(false));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languagePickerWrap: { flex: 1, minWidth: 0 },
  list: { flex: 1, minHeight: 0 },
  messages: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 14,
  },
  emptyState: {
    flexGrow: 1,
    minHeight: 280,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyBadge: {
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
  emptyLogo: { width: 78, height: 78, tintColor: palette.text },
  emptyBrand: { color: palette.text, fontSize: 23, fontWeight: '600', letterSpacing: 4 },
  previewWrap: { paddingHorizontal: 16, paddingBottom: 6 },
  previewCard: {
    gap: 4,
    padding: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(24,24,27,0.88)',
  },
  previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewTitle: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  previewLang: {
    marginTop: 4,
    color: palette.textSubtle,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  previewText: { color: palette.text, fontSize: 14, lineHeight: 20 },
  previewTranslation: { color: '#E4E4E7', fontSize: 14, fontWeight: '600', lineHeight: 20 },
  composerArea: { paddingHorizontal: 16, paddingTop: 4, gap: 6 },
  errorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(24,24,27,0.96)',
  },
  errorPillText: { color: '#FFE4E6', fontSize: 12, fontWeight: '500' },
  noticePill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(24,24,27,0.85)',
  },
  noticePillText: { color: palette.textMuted, fontSize: 12 },
  composerCard: {
    padding: 8,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.84)',
  },
  recordingBanner: {
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  recordingBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  dotRose: { backgroundColor: '#FB7185' },
  dotSky: { backgroundColor: '#38BDF8' },
  dotAmber: { backgroundColor: '#FBBF24' },
  recordingBannerText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  bannerWave: { height: 24 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    fontSize: 14,
    color: palette.text,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  autoPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoPlayBtnActive: {
    borderColor: 'rgba(52,211,153,0.40)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  primaryBtn: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  primaryBtnRecording: { backgroundColor: '#E11D48' },
  primaryBtnSend: { backgroundColor: '#10B981' },
  primaryBtnMic: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  disabledBtn: { opacity: 0.4 },
});
