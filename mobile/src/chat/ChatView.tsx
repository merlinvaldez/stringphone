import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { AudioWave } from '../components/AudioWave';
import { LanguagePicker } from '../components/LanguagePicker';
import { getNativeLanguageName } from '../components/LanguageFlag';
import type { MessageRow } from '../storage/history';
import type { ChatState, createTextChatController } from './controller';
import { MessageCard } from './MessageCard';
import { HistorySheet } from './HistorySheet';
import { messageDirection } from './presentation';
import { useAudioPlayback } from './useAudioPlayback';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import { useLiveTurnFlow } from '../live/useLiveTurnFlow';
import { palette } from '../theme';

type Props = {
  chat: ReturnType<typeof createTextChatController> | null;
  state: ChatState;
  loadError: string | null;
};

export function ChatView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const [androidKeyboardOffset, setAndroidKeyboardOffset] = useState(0);
  const screenHeightBeforeKeyboard = useRef(0);
  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));
  const list = useRef<FlatList<MessageRow>>(null);
  const input = useRef<TextInput>(null);
  const scrollAfterSend = useRef(false);
  const id = state.conversation?.id ?? '';
  const draft = drafts[id] ?? '';
  const locked = !chat || state.busy || state.historyBusy;
  const liveFlow = useLiveTurnFlow({
    chat,
    state,
    mode: 'chat',
    disabled: locked || !id,
    onCompletedTurn: () => {
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    },
  });

  const isRecording = liveFlow.status === 'recording';
  const isProcessing = liveFlow.status === 'processing';
  const hasDraft = Boolean(draft.trim());
  const sendDisabled = locked || !id || !hasDraft || isRecording || isProcessing;
  const languageControlsDisabled = locked || isRecording || isProcessing;
  const myNativeLanguageName = getNativeLanguageName(state.myLanguage);

  useEffect(() => {
    if (isFocused && !state.busy && chat && !state.conversation) {
      void chat.ensureConversationForMode('chat');
    }
  }, [isFocused, state.busy, chat, state.conversation]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      if (Platform.OS === 'android') {
        const windowHeight = Dimensions.get('window').height;
        const screenY = event.endCoordinates.screenY;
        const rawHeight = event.endCoordinates.height;
        // In Android edge-to-edge mode, AppShell's SafeAreaView already reserves insets.bottom
        // (48dp), while Gboard's top toolbar strip sits ~38dp above event.endCoordinates.height.
        // Setting kbHeight = rawHeight - insets.bottom + 38 places the composer flush (8dp gap)
        // right above the keyboard's top border.
        const overlapFromScreenY =
          typeof screenY === 'number' && screenY > 0 && screenY < windowHeight
            ? windowHeight - screenY - insets.bottom - 10
            : rawHeight - insets.bottom + 38;
        const kbHeight = Math.max(0, Math.round(overlapFromScreenY));
        setAndroidKeyboardOffset(kbHeight);
      }
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      if (Platform.OS === 'android') {
        setAndroidKeyboardOffset(0);
      }
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  async function send() {
    if (!chat || sendDisabled) return;
    const text = draft;
    const conversationId = id;
    scrollAfterSend.current = true;
    setDrafts(current => ({ ...current, [conversationId]: '' }));
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
    const succeeded = await chat.send(text);
    if (!succeeded) {
      setDrafts(current => (current[conversationId] ? current : { ...current, [conversationId]: text }));
    }
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }

  function handlePrimaryAction() {
    if (isRecording) {
      void liveFlow.stopRecording();
      return;
    }
    if (hasDraft) {
      void send();
      return;
    }
    scrollAfterSend.current = true;
    void liveFlow.startRecording({
      action: 'speak',
      side: 'self',
      speaker: 'me',
      sourceLanguage: state.myLanguage,
      targetLanguage: state.theirLanguage,
    });
  }

  const primaryDisabled = isRecording
    ? false
    : hasDraft
      ? sendDisabled
      : locked || !id || isProcessing;

  const activeError = loadError || liveFlow.error || audioPlayback.errorNotice || phrasebook.error;
  const activeNotice = phrasebook.notice || liveFlow.notice || state.notice;

  return (
    <SafeAreaView
      style={styles.screen}
      edges={['left', 'right']}
      onLayout={event => {
        if (Platform.OS !== 'android') return;
        const nextHeight = event.nativeEvent.layout.height;
        if (androidKeyboardOffset === 0) {
          screenHeightBeforeKeyboard.current = nextHeight;
        } else if (
          screenHeightBeforeKeyboard.current > 0 &&
          screenHeightBeforeKeyboard.current - nextHeight > 80
        ) {
          // Window already resized natively for the keyboard; clear manual padding to avoid double offset.
          setAndroidKeyboardOffset(0);
        }
      }}
    >
      <KeyboardAvoidingView
        style={[
          styles.screen,
          Platform.OS === 'android' && androidKeyboardOffset > 0
            ? { paddingBottom: androidKeyboardOffset }
            : null,
        ]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 60 : 0}
      >
        <View style={styles.chatHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open history"
            disabled={!chat}
            onPress={() => setHistoryVisible(true)}
            style={styles.headerIconBtn}
          >
            <Feather name="menu" size={18} color={palette.text} />
          </Pressable>
          <View style={styles.languagePickerWrap}>
            <LanguagePicker
              label="My language"
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
            accessibilityLabel="Invert languages"
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
              label="Their language"
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
          keyboardDismissMode="on-drag"
          onContentSizeChange={() => {
            if (scrollAfterSend.current || liveFlow.liveDraft) {
              list.current?.scrollToEnd({ animated: true });
              scrollAfterSend.current = false;
            }
          }}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {!chat && !loadError && <Text style={styles.note}>Opening local history...</Text>}
              {state.messageCursor && (
                <ActionButton
                  label="Load older messages"
                  tone="secondary"
                  disabled={locked}
                  onPress={() => {
                    void chat?.loadOlderMessages();
                  }}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            chat && !liveFlow.liveDraft ? (
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
          ListFooterComponent={
            liveFlow.liveDraft ? (
              <MessageCard
                message={{
                  id: liveFlow.liveDraft.id,
                  conversation_id: id,
                  request_id: liveFlow.liveDraft.id,
                  speaker: liveFlow.liveDraft.speaker,
                  origin_mode: 'chat',
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
                }}
                baseLanguageCode={state.myLanguage}
                disabled
                onRetry={() => {}}
              />
            ) : null
          }
          renderItem={({ item }) => (
            <MessageCard
              message={item}
              baseLanguageCode={state.myLanguage}
              disabled={locked}
              onRetry={messageId => {
                void chat?.retry(messageId);
              }}
              onPlaySource={audioPlayback.playSource}
              onPlayTranslated={audioPlayback.playTranslated}
              onSaveToPhrasebook={phrasebook.save}
              isSavedInPhrasebook={phrasebook.isSaved(item.id)}
              isSavingPhrase={phrasebook.isSaving(item.id)}
              isPlayingSource={
                audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'source'
              }
              isPlayingTranslated={
                audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'translated'
              }
              isGeneratingSourceSpeech={audioPlayback.generatingSourceId === item.id}
              isGeneratingSpeech={audioPlayback.generatingId === item.id}
              onStopPlayback={audioPlayback.stop}
            />
          )}
        />

        <View style={styles.composerArea}>
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
          {state.maintenancePending && (
            <ActionButton
              label="Retry storage cleanup"
              disabled={locked}
              onPress={() => {
                void chat?.retryStorageCleanup();
              }}
            />
          )}

          <View style={styles.composerCard}>
            {(isRecording || isProcessing) && (
              <View style={styles.recordingBanner}>
                <View style={styles.recordingBannerLeft}>
                  <View style={[styles.statusDot, isRecording ? styles.dotRose : styles.dotAmber]} />
                  <Text style={styles.recordingBannerText}>
                    {isRecording ? `${liveFlow.secondsRemaining}s left` : 'Translating voice note...'}
                  </Text>
                </View>
                {isRecording ? (
                  <AudioWave active color="#FB7185" style={styles.bannerWave} />
                ) : (
                  <ActivityIndicator size="small" color="#FBBF24" />
                )}
              </View>
            )}

            <View style={styles.composerRow}>
              <TextInput
                ref={input}
                accessibilityLabel={`Type message in ${myNativeLanguageName}`}
                placeholder={id ? `Type message in ${myNativeLanguageName}` : 'Start a new chat first'}
                placeholderTextColor={palette.textSubtle}
                value={draft}
                onChangeText={text => {
                  if (id) setDrafts(current => ({ ...current, [id]: text }));
                }}
                editable={!!chat && !!id && !isRecording && !isProcessing}
                multiline={false}
                returnKeyType="send"
                onFocus={() => {
                  setTimeout(() => list.current?.scrollToEnd({ animated: true }), 150);
                }}
                onSubmitEditing={() => {
                  void send();
                }}
                style={[styles.input, messageDirection(state.myLanguage)]}
              />

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isRecording
                    ? 'Stop voice recording'
                    : hasDraft
                      ? 'Send message'
                      : 'Record voice message'
                }
                disabled={primaryDisabled}
                onPress={handlePrimaryAction}
                style={[
                  styles.primaryBtn,
                  isRecording
                    ? styles.primaryBtnRecording
                    : hasDraft
                      ? styles.primaryBtnSend
                      : styles.primaryBtnMic,
                  primaryDisabled && styles.disabledBtn,
                ]}
              >
                {isProcessing && !isRecording ? (
                  <ActivityIndicator size="small" color={palette.text} />
                ) : isRecording ? (
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
            onNewChat={() => {
              void chat.newConversation().then(() => setHistoryVisible(false));
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
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
  languagePickerWrap: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  messages: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 14,
  },
  listHeader: {
    gap: 10,
    paddingBottom: 4,
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
  emptyLogo: {
    width: 78,
    height: 78,
    tintColor: palette.text,
  },
  emptyBrand: {
    color: palette.text,
    fontSize: 23,
    fontWeight: '600',
    letterSpacing: 4,
  },
  composerArea: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 6,
  },
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
  errorPillText: {
    color: '#FFE4E6',
    fontSize: 12,
    fontWeight: '500',
  },
  noticePill: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(24,24,27,0.85)',
  },
  noticePillText: {
    color: palette.textMuted,
    fontSize: 12,
  },
  composerCard: {
    padding: 8,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.84)',
    shadowColor: '#000',
    shadowOpacity: 0.48,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
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
  recordingBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotRose: {
    backgroundColor: '#FB7185',
  },
  dotAmber: {
    backgroundColor: '#FBBF24',
  },
  recordingBannerText: {
    color: '#E4E4E7',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  bannerWave: {
    height: 24,
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
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
  primaryBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnRecording: {
    backgroundColor: '#E11D48',
  },
  primaryBtnSend: {
    backgroundColor: '#10B981',
  },
  primaryBtnMic: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  note: {
    color: palette.textMuted,
    fontSize: 13,
  },
});
