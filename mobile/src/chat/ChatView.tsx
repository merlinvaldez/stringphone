import { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { LanguagePicker } from '../components/LanguagePicker';
import type { MessageRow } from '../storage/history';
import type { ChatState, createTextChatController } from './controller';
import { MessageCard } from './MessageCard';
import { HistorySheet } from './HistorySheet';
import { languageName, messageDirection } from './presentation';
import { VoiceControls } from './VoiceControls';
import { useAudioPlayback } from './useAudioPlayback';

type Props = { chat: ReturnType<typeof createTextChatController> | null; state: ChatState; loadError: string | null };
export function ChatView({ chat, state, loadError }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [historyVisible, setHistoryVisible] = useState(false);
  const audioPlayback = useAudioPlayback();
  const list = useRef<FlatList<MessageRow>>(null);
  const input = useRef<TextInput>(null);
  const scrollAfterSend = useRef(false);
  const id = state.conversation?.id ?? '';
  const draft = drafts[id] ?? '';
  const locked = !chat || state.busy || state.historyBusy;
  const readOnly = state.conversation !== null && state.conversation.origin_mode !== 'chat';
  const sendDisabled = locked || !id || readOnly || !draft.trim();
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
  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.toolbar}>
        <Text accessibilityRole="header" style={styles.title}>Chat</Text>
        <ActionButton label="History" tone="secondary" disabled={locked} onPress={() => { setHistoryVisible(true); }} />
        <ActionButton label="New chat" disabled={locked} onPress={() => { void chat?.newConversation(); }} />
      </View>
      <FlatList key={id || 'empty'} ref={list} data={state.messages} keyExtractor={message => message.id} style={styles.list}
        contentContainerStyle={styles.messages} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        onContentSizeChange={() => { if (scrollAfterSend.current) { list.current?.scrollToEnd({ animated: true }); scrollAfterSend.current = false; } }}
        ListHeaderComponent={<View style={styles.header}>
          <Text style={styles.heading}>{state.conversation?.title || 'Start a new chat'}</Text>
          <View style={styles.languages}>
            <LanguagePicker label="My language" value={state.myLanguage} disabled={locked || readOnly}
              onSelect={code => { void chat?.setLanguages(code, state.theirLanguage); }} />
            <ActionButton label="Swap" hint="Exchange my language and their language" tone="secondary" disabled={locked || readOnly || state.myLanguage === state.theirLanguage}
              onPress={() => { void chat?.swapLanguages(); }} />
            <LanguagePicker label="Their language" value={state.theirLanguage} disabled={locked || readOnly}
              onSelect={code => { void chat?.setLanguages(state.myLanguage, code); }} />
          </View>
          <Text style={styles.note}>Messages are saved on this phone. Translation requires internet.</Text>
          {readOnly && <Text style={styles.note}>Saved {state.conversation?.origin_mode} conversation. Start a new chat to send typed messages.</Text>}
          {!chat && !loadError && <Text>Opening local history...</Text>}
          {state.messageCursor && <ActionButton label="Load older messages" tone="secondary" disabled={locked} onPress={() => { void chat?.loadOlderMessages(); }} />}
        </View>}
        ListEmptyComponent={chat ? <Text style={styles.note}>{id ? 'No messages yet. Type a message to start.' : 'No saved conversations. Tap New chat to begin.'}</Text> : null}
        renderItem={({ item }) => <MessageCard
          message={item}
          disabled={locked}
          onRetry={messageId => { void chat?.retry(messageId); }}
          onPlaySource={audioPlayback.playSource}
          onPlayTranslated={audioPlayback.playTranslated}
          isPlayingSource={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'source'}
          isPlayingTranslated={audioPlayback.activeAudio?.messageId === item.id && audioPlayback.activeAudio.role === 'translated'}
          isGeneratingSpeech={audioPlayback.generatingId === item.id}
          onStopPlayback={audioPlayback.stop}
        />} />
      <View style={styles.composer}>
        {audioPlayback.errorNotice && <Text accessibilityRole="alert" style={styles.error} onPress={audioPlayback.clearErrorNotice}>{audioPlayback.errorNotice}</Text>}
        {(loadError || state.error) && <Text accessibilityRole="alert" style={styles.error}>{loadError || state.error}</Text>}
        {!!state.notice && <Text accessibilityLiveRegion="polite" style={styles.note}>{state.notice}</Text>}
        {state.voiceRequest && <View>
          <Text accessibilityLiveRegion="polite">{state.voiceRequest.phase === 'uploading' ? 'Uploading recording and waiting for translation...' : 'Processing translation and saving audio...'}</Text>
          <ActionButton label="Cancel voice translation" tone="secondary" onPress={() => chat?.interruptVoiceRequest()} />
        </View>}
        {state.maintenancePending && <ActionButton label="Retry storage cleanup" disabled={locked} onPress={() => { void chat?.retryStorageCleanup(); }} />}
        {chat && <VoiceControls chat={chat} disabled={locked || !id || readOnly} messageIds={state.messages.filter(message => message.input_kind === 'voice').map(message => message.id)} />}
        <TextInput ref={input} accessibilityLabel={`Message draft in ${languageName(state.myLanguage)}`} placeholder={id ? 'Type a message...' : 'Start a new chat first'}
          value={draft} onChangeText={text => { if (id) setDrafts(current => ({ ...current, [id]: text })); }}
          editable={!!chat && !!id && !readOnly} multiline textAlignVertical="top"
          style={[styles.input, messageDirection(state.myLanguage)]} />
        <View style={styles.composerActions}>
          <ActionButton label="Done typing" tone="secondary" onPress={() => input.current?.blur()} />
          <ActionButton label={state.busy ? 'Processing...' : 'Send'} disabled={sendDisabled} onPress={() => { void send(); }} />
        </View>
        <Text style={styles.footnote}>Unsent typing stays here until the app closes. Uninstalling or clearing app data can remove history.</Text>
      </View>
      {chat && <HistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} state={state} chat={chat} />}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2' }, toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  title: { color: '#182A23', fontSize: 26, fontWeight: '700', flexGrow: 1 }, heading: { color: '#182A23', fontSize: 20, fontWeight: '600' },
  list: { flex: 1 }, messages: { padding: 16, gap: 12 }, header: { gap: 12, paddingBottom: 4 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  composer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#DEE5DF' },
  composerActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  input: { minHeight: 48, maxHeight: 100, borderWidth: 1, borderColor: '#66736C', borderRadius: 12, padding: 12, fontSize: 18, color: '#182A23', backgroundColor: '#FFFFFF' },
  note: { color: '#48574F', fontSize: 15 }, footnote: { color: '#48574F', fontSize: 12 }, error: { color: '#9B2727', fontSize: 16 },
});
