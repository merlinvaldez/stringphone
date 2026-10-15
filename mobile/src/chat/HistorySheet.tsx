import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import type { ChatState, createTextChatController } from './controller';
import { languageName } from './presentation';

type Props = { visible: boolean; onClose: () => void; state: ChatState; chat: ReturnType<typeof createTextChatController> };
export function HistorySheet({ visible, onClose, state, chat }: Props) {
  const [query, setQuery] = useState('');
  const disabled = state.busy || state.historyBusy;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
    <SafeAreaView style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>Conversation history</Text>
      <Text style={styles.note}>Saved on this phone. Search and reopen chats without internet.</Text>
      <TextInput accessibilityLabel="Search conversation history" placeholder="Search titles or messages" value={query} onChangeText={setQuery}
        onSubmitEditing={() => { void chat.searchHistory(query); }} returnKeyType="search" editable={!state.busy} style={styles.search} maxLength={500} />
      <View style={styles.actions}>
        <ActionButton label="Search history" tone="secondary" disabled={disabled} onPress={() => { void chat.searchHistory(query); }} />
        <ActionButton label="Clear search" tone="secondary" disabled={disabled} onPress={() => { setQuery(''); void chat.searchHistory(''); }} />
      </View>
      {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
      {state.notice && <Text accessibilityLiveRegion="polite" style={styles.note}>{state.notice}</Text>}
      {state.maintenancePending && <ActionButton label="Retry storage cleanup" disabled={disabled} onPress={() => { void chat.retryStorageCleanup(); }} />}
      {state.historyBusy && <Text accessibilityLiveRegion="polite">Loading history...</Text>}
      <FlatList data={state.conversations} keyExtractor={item => item.id} contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
        ListEmptyComponent={!state.historyBusy ? <Text>{state.historyQuery.trim() ? 'No conversations match your search.' : 'No saved conversations. Start a new chat.'}</Text> : null}
        ListFooterComponent={state.historyCursor ? <ActionButton label="Load more conversations" disabled={disabled} onPress={() => { void chat.loadMoreHistory(); }} /> : null}
        renderItem={({ item }) => <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.title || 'Untitled conversation'}`}
            accessibilityState={{ disabled, selected: item.id === state.conversation?.id }} disabled={disabled}
            onPress={() => { void chat.openConversation(item.id).then(opened => { if (opened) onClose(); }); }} style={styles.open}>
            <Text style={styles.heading}>{item.title || 'Untitled conversation'}</Text>
            <Text style={styles.note}>{languageName(item.my_language)} → {languageName(item.their_language)} · {item.origin_mode}</Text>
            <Text style={styles.note}>{new Date(item.updated_at).toLocaleString()}{item.id === state.conversation?.id ? ' · Current chat' : ''}</Text>
          </Pressable>
          <ActionButton label={`Delete ${item.title || 'untitled conversation'}`} tone="danger" disabled={disabled}
            hint="Asks for confirmation before permanent deletion" onPress={() => { void chat.deleteConversation(item.id); }} />
        </View>} />
      <ActionButton label="Close history" onPress={onClose} />
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2', padding: 20, gap: 12 }, list: { gap: 12, paddingBottom: 12 },
  title: { fontSize: 26, color: '#182A23', fontWeight: '700' }, heading: { fontSize: 18, color: '#182A23', fontWeight: '600' },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 12, gap: 8 }, open: { minHeight: 48, gap: 6, padding: 6 },
  search: { minHeight: 48, borderWidth: 1, borderColor: '#66736C', borderRadius: 10, padding: 12, fontSize: 18, backgroundColor: '#FFF', color: '#182A23' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, note: { color: '#48574F', fontSize: 15 }, error: { color: '#9B2727', fontSize: 16 },
});
