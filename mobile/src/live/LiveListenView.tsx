import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LanguagePicker } from '../components/LanguagePicker';
import { HistorySheet } from '../chat/HistorySheet';
import { MessageCard } from '../chat/MessageCard';
import type { ChatState, createTextChatController } from '../chat/controller';
import { useAudioPlayback } from '../chat/useAudioPlayback';
import { useUiStrings } from '../chat/useUiStrings';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import type { MessageRow } from '../storage/history';
import { palette } from '../theme';
import { useNativeLiveListen } from './useNativeLiveListen';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

export function LiveListenView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [historyVisible, setHistoryVisible] = useState(false);
  const list = useRef<FlatList<MessageRow>>(null);
  const scrollAfterUpdate = useRef(false);

  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));

  const liveListen = useNativeLiveListen({
    chat,
    state,
    isPlaybackActive: Boolean(audioPlayback.activeAudio),
    onSegmentSaved: () => {
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

  const activeError = loadError || liveListen.error || audioPlayback.errorNotice || phrasebook.error;
  const activeNotice = phrasebook.notice || liveListen.notice || state.notice;
  const listenButtonLabel = isListening ? strings.liveListening : strings.listen;

  function handleToggleListen() {
    if (isStarting || isStopping) return;
    if (isListening) {
      void liveListen.stopListening();
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
        <View style={styles.headerSpacer} />
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
              audioPlayback.activeAudio?.messageId === item.id &&
              audioPlayback.activeAudio.role === 'translated'
            }
            isGeneratingSourceSpeech={audioPlayback.generatingSourceId === item.id}
            isGeneratingSpeech={audioPlayback.generatingId === item.id}
            onStopPlayback={audioPlayback.stop}
          />
        )}
      />

      <View style={[styles.composerArea, { paddingBottom: Math.max(12, insets.bottom) }]}>
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

        <View style={styles.controlsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={listenButtonLabel}
            accessibilityState={{ selected: isListening }}
            disabled={!isListening && (!chat || !id || isStarting || isStopping || locked)}
            onPress={handleToggleListen}
            style={[
              styles.listenBtn,
              isListening ? styles.listenBtnActive : styles.listenBtnIdle,
            ]}
          >
            {isStarting || isStopping ? (
              <ActivityIndicator size="small" color={palette.text} />
            ) : (
              <Feather name="headphones" size={18} color={palette.text} />
            )}
            <Text style={styles.listenBtnText}>{listenButtonLabel}</Text>
          </Pressable>
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
    justifyContent: 'space-between',
    gap: 12,
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
  headerSpacer: { width: 44, height: 44 },
  languagePickerWrap: { flex: 1, maxWidth: 220 },
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
  composerArea: { paddingHorizontal: 16, paddingTop: 8, gap: 10, alignItems: 'center' },
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listenBtn: {
    height: 54,
    paddingHorizontal: 28,
    borderRadius: 27,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  listenBtnIdle: {
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(39,39,42,0.92)',
  },
  listenBtnActive: {
    borderColor: 'rgba(251,113,133,0.55)',
    backgroundColor: '#E11D48',
  },
  listenBtnText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});
