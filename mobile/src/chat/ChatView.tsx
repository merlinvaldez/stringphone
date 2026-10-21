import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { LanguagePicker } from '../components/LanguagePicker';
import type { MessageRow } from '../storage/history';
import type { ChatState, createTextChatController } from './controller';
import { MessageCard } from './MessageCard';
import { HistorySheet } from './HistorySheet';
import { languageName, messageDirection } from './presentation';
import { VoiceControls } from './VoiceControls';
import { useAudioPlayback } from './useAudioPlayback';
import { useSaveToPhrasebook } from '../phrasebook/useSaveToPhrasebook';
import { LiveTranslationControls } from '../live/LiveTranslationControls';
import { IconButton } from '../components/IconButton';
import { palette } from '../theme';

type Props = { chat: ReturnType<typeof createTextChatController> | null; state: ChatState; loadError: string | null };
export function ChatView({ chat, state, loadError }: Props) {
  const isFocused = useIsFocused();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const audioPlayback = useAudioPlayback();
  const phrasebook = useSaveToPhrasebook(state.messages.map(message => message.id));
  const list = useRef<FlatList<MessageRow>>(null);
  const input = useRef<TextInput>(null);
  const scrollAfterSend = useRef(false);
  const id = state.conversation?.id ?? '';
  const draft = drafts[id] ?? '';
  const locked = !chat || state.busy || state.historyBusy;
  const readOnly = state.conversation !== null && state.conversation.origin_mode !== 'chat';
  const sendDisabled = locked || !id || readOnly || !draft.trim();
  const languageControlsDisabled = locked || readOnly;
  useEffect(() => {
    if (isFocused && !state.busy && chat && state.conversation?.origin_mode !== 'chat') {
      void chat.ensureConversationForMode('chat');
    }
  }, [isFocused, state.busy, chat, state.conversation?.origin_mode]);
  async function send() {
    if (!chat || sendDisabled) return;
    const text = draft;
    const conversationId = id;
    scrollAfterSend.current = true;
    if (await chat.send(text)) {
      setDrafts(current => current[conversationId] === text ? { ...current, [conversationId]: '' } : current);
    }
    requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
  }
  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.chatHeader}>
        <IconButton name="menu" accessibilityLabel="Open history" disabled={!chat} onPress={() => setHistoryVisible(true)} />
        <LanguagePicker label="My language" value={state.myLanguage} disabled={languageControlsDisabled}
          compact onSelect={code => { void chat?.setLanguages(code, state.theirLanguage); }} />
        <IconButton name="repeat" accessibilityLabel="Invert languages" disabled={languageControlsDisabled || state.myLanguage === state.theirLanguage}
          onPress={() => { void chat?.swapLanguages(); }} />
        <LanguagePicker label="Their language" value={state.theirLanguage} disabled={languageControlsDisabled}
          compact onSelect={code => { void chat?.setLanguages(state.myLanguage, code); }} />
      </View>
      <FlatList key={id || 'empty'} ref={list} data={state.messages} keyExtractor={message => message.id} style={styles.list}
        contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        onContentSizeChange={() => { if (scrollAfterSend.current) { list.current?.scrollToEnd({ animated: true }); scrollAfterSend.current = false; } }}
        ListHeaderComponent={<View style={styles.listHeader}>
          {readOnly && <Text style={styles.note}>Saved {state.conversation?.origin_mode} conversation. Start a new chat to send typed messages.</Text>}
          {!chat && !loadError && <Text>Opening local history...</Text>}
          {state.messageCursor && <ActionButton label="Load older messages" tone="secondary" disabled={locked} onPress={() => { void chat?.loadOlderMessages(); }} />}
        </View>}
        ListEmptyComponent={chat ? <View style={styles.emptyState}>
          <View style={styles.emptyBadge}><Image source={require('../../assets/stringphone-logo.png')} resizeMode="contain" style={styles.emptyLogo} /></View>
          <Text style={styles.emptyBrand}>StringPhone</Text>
        </View> : null}
        renderItem={({ item }) => <MessageCard
          message={item}
          disabled={locked}
          onRetry={messageId => { void chat?.retry(messageId); }}
          onPlaySource={audioPlayback.playSource}
          onPlayTranslated={audioPlayback.playTranslated}
          onSaveToPhrasebook={phrasebook.save}
          isSavedInPhrasebook={phrasebook.isSaved(item.id)}
          isSavingPhrase={phrasebook.isSaving(item.id)}
          isPlayingSource={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'source'}
          isPlayingTranslated={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'translated'}
          isGeneratingSpeech={audioPlayback.generatingId === item.id}
          onStopPlayback={audioPlayback.stop}
        />} />
      <View style={styles.composerArea}>
        {(phrasebook.error || phrasebook.notice) && <Text accessibilityRole={phrasebook.error ? 'alert' : undefined}
          accessibilityLiveRegion="polite" style={phrasebook.error ? styles.error : styles.note} onPress={phrasebook.clearNotices}>
          {phrasebook.error || phrasebook.notice}
        </Text>}
        {audioPlayback.errorNotice && <Text accessibilityRole="alert" style={styles.error} onPress={audioPlayback.clearErrorNotice}>{audioPlayback.errorNotice}</Text>}
        {(loadError || state.error) && <Text accessibilityRole="alert" style={styles.error}>{loadError || state.error}</Text>}
        {!!state.notice && <Text accessibilityLiveRegion="polite" style={styles.note}>{state.notice}</Text>}
        {state.voiceRequest && <View>
          <Text accessibilityLiveRegion="polite">{state.voiceRequest.phase === 'uploading' ? 'Uploading recording and waiting for translation...' : 'Processing translation and saving audio...'}</Text>
          <ActionButton label="Cancel voice translation" tone="secondary" onPress={() => chat?.interruptVoiceRequest()} />
        </View>}
        {state.maintenancePending && <ActionButton label="Retry storage cleanup" disabled={locked} onPress={() => { void chat?.retryStorageCleanup(); }} />}
        {chat && <LiveTranslationControls chat={chat} state={state} mode="chat" disabled={locked || readOnly || !id} />}
        <View style={styles.composer}>
          <TextInput ref={input} accessibilityLabel={`Message draft in ${languageName(state.myLanguage)}`}
            placeholder={id ? `Type message in ${languageName(state.myLanguage)}` : 'Start a new chat first'}
            value={draft} onChangeText={text => { if (id) setDrafts(current => ({ ...current, [id]: text })); }}
            editable={!!chat && !!id && !readOnly} multiline={false} returnKeyType="send" onSubmitEditing={() => { void send(); }}
            style={[styles.input, messageDirection(state.myLanguage)]} />
          {draft.trim()
            ? <IconButton name="send" accessibilityLabel={state.busy ? 'Processing message' : 'Send text message'} tone="primary" disabled={sendDisabled} onPress={() => { void send(); }} />
            : chat ? <VoiceControls compact chat={chat} disabled={locked || !id || readOnly} messageIds={[]} /> : null}
        </View>
      </View>
      {chat && <HistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} state={state} chat={chat}
        onNewChat={() => { void chat.newConversation().then(() => setHistoryVisible(false)); }} />}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 8 },
  list: { flex: 1, minHeight: 0 }, messages: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, gap: 12 },
  listHeader: { gap: 10, paddingBottom: 4 },
  emptyState: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyBadge: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 30, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceSoft,
    shadowColor: palette.sky, shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  emptyLogo: { width: 78, height: 78, tintColor: palette.text },
  emptyBrand: { color: palette.text, fontSize: 23, fontWeight: '600', letterSpacing: 4 },
  composerArea: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4 },
  composer: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderWidth: 1, borderColor: palette.border,
    borderRadius: 34, backgroundColor: 'rgba(24,24,27,0.92)', shadowColor: '#000', shadowOpacity: 0.48, shadowRadius: 18, shadowOffset: { width: 0, height: 7 }, elevation: 8 },
  input: { flex: 1, minHeight: 48, paddingHorizontal: 15, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 26,
    fontSize: 14, color: palette.text, backgroundColor: 'rgba(0,0,0,0.22)' },
  note: { color: palette.textMuted, fontSize: 13 }, error: { color: palette.danger, fontSize: 14 },
});
