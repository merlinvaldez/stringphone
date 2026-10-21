import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { getNativePhrasebookServices } from '../chat/native';
import type { PhrasebookCursor, PhrasebookInput, PhrasebookRow } from '../storage/phrasebook';
import { languageName } from '../chat/presentation';
import { deleteNativePhrase, retryNativePhrasebookMaintenance } from '../phrasebook/native';
import { PhraseCard } from '../phrasebook/PhraseCard';
import { PhraseEditorModal } from '../phrasebook/PhraseEditorModal';
import { usePhrasebookAudioPlayback } from '../phrasebook/usePhrasebookAudioPlayback';
import { palette } from '../theme';

type DisplayItem = { kind: 'group'; key: string; label: string } | { kind: 'phrase'; key: string; phrase: PhrasebookRow };

export default function PhrasebookScreen() {
  const [phrases, setPhrases] = useState<PhrasebookRow[]>([]);
  const [cursor, setCursor] = useState<PhrasebookCursor | null>(null);
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [maintenancePending, setMaintenancePending] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<PhrasebookRow | null>(null);
  const queryRef = useRef(committedQuery);
  const loadMoreRef = useRef(false);
  const playback = usePhrasebookAudioPlayback();

  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => { queryRef.current = committedQuery; }, [committedQuery]);

  const refreshPage = useCallback(async (isActive: () => boolean = () => true) => {
    setLoading(true);
    setError(null);
    try {
      const { phrasebook } = await getNativePhrasebookServices();
      const page = await phrasebook.listPage(committedQuery);
      if (!isActive()) return;
      setPhrases(page.items);
      setCursor(page.cursor);
    } catch (cause) {
      if (isActive()) setError(cause instanceof Error ? cause.message : 'Could not load the local Phrasebook.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, [committedQuery]);

  useFocusEffect(useCallback(() => {
    let active = true;
    void refreshPage(() => active);
    return () => { active = false; };
  }, [refreshPage]));

  const displayItems = useMemo<DisplayItem[]>(() => {
    const result: DisplayItem[] = [];
    let previousPair = '';
    for (const phrase of phrases) {
      const pair = `${phrase.source_language}\u0000${phrase.target_language}`;
      if (pair !== previousPair) {
        result.push({
          kind: 'group',
          key: `group:${pair}`,
          label: `${languageName(phrase.source_language)} → ${languageName(phrase.target_language)}`,
        });
        previousPair = pair;
      }
      result.push({ kind: 'phrase', key: phrase.id, phrase });
    }
    return result;
  }, [phrases]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || loadMoreRef.current) return;
    const pageQuery = committedQuery;
    loadMoreRef.current = true;
    setLoadingMore(true);
    try {
      const { phrasebook } = await getNativePhrasebookServices();
      const page = await phrasebook.listPage(pageQuery, cursor);
      if (queryRef.current === pageQuery) {
        setPhrases(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()]);
        setCursor(page.cursor);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load more phrases.');
    } finally {
      loadMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, committedQuery]);

  const submitEditor = useCallback(async (input: PhrasebookInput) => {
    if (mutating) return;
    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const { phrasebook } = await getNativePhrasebookServices();
      if (editingPhrase) {
        const result = await phrasebook.update(editingPhrase.id, editingPhrase.updated_at, input);
        if (result !== 'updated') {
          setError(result === 'missing' ? 'This phrase no longer exists.' : 'This phrase changed. Reopen it and review the latest version.');
          void refreshPage();
          return;
        }
        setNotice('Phrase updated.');
      } else {
        await phrasebook.create(input);
        setNotice('Phrase added to Phrasebook.');
      }
      setEditorVisible(false);
      setEditingPhrase(null);
      void refreshPage();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this phrase.');
    } finally {
      setMutating(false);
    }
  }, [editingPhrase, mutating, refreshPage]);

  const removePhrase = useCallback(async (id: string) => {
    if (mutating) return;
    if (playback.activeAudio?.phraseId === id) playback.stop();
    setMutating(true);
    setError(null);
    setNotice(null);
    try {
      const report = await deleteNativePhrase(id);
      if (report.status === 'deleted') {
        void refreshPage();
        const pending = !report.compacted || report.maintenanceErrors.length > 0 || (report.cleanup?.failures.length ?? 0) > 0;
        setMaintenancePending(pending);
        setNotice(pending ? 'Phrase deleted. Storage cleanup is pending; retry it below.' : 'Phrase deleted.');
      } else if (report.status === 'changed') {
        setError('This phrase changed while the confirmation was open. Review it and try again.');
        void refreshPage();
      } else if (report.status === 'missing') {
        setNotice('This phrase was already removed.');
        void refreshPage();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete this phrase.');
    } finally {
      setMutating(false);
    }
  }, [mutating, playback, refreshPage]);

  const retryMaintenance = useCallback(async () => {
    setMutating(true);
    setError(null);
    try {
      const report = await retryNativePhrasebookMaintenance();
      const pending = !report.compacted || report.maintenanceErrors.length > 0 || (report.cleanup?.failures.length ?? 0) > 0;
      setMaintenancePending(pending);
      setNotice(pending ? 'Some storage cleanup is still pending.' : 'Phrasebook storage cleanup completed.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry storage cleanup.');
    } finally {
      setMutating(false);
    }
  }, []);

  function openCreate() {
    setEditingPhrase(null);
    setEditorVisible(true);
  }

  function openEdit(phrase: PhrasebookRow) {
    setEditingPhrase(phrase);
    setEditorVisible(true);
  }

  return <SafeAreaView style={styles.screen} edges={['left', 'right']}>
    <FlatList
      data={displayItems}
      keyExtractor={item => item.key}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={() => { void loadMore(); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>Phrasebook</Text>
          <IconButton name="plus" accessibilityLabel="Add phrase" disabled={mutating} onPress={openCreate} tone="primary" />
        </View>
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={palette.textSubtle} />
          <TextInput accessibilityLabel="Search Phrasebook" placeholder="Search your phrasebook"
            value={query} onChangeText={setQuery}
            onSubmitEditing={() => setCommittedQuery(query.trim())} returnKeyType="search" autoCorrect={false} maxLength={500}
            style={styles.search} />
          {!!query && <IconButton name="x" accessibilityLabel="Clear search" disabled={loading} onPress={() => { setQuery(''); setCommittedQuery(''); }} size={15} />}
        </View>
        {loading && <Text accessibilityLiveRegion="polite" style={styles.note}>Loading saved phrases...</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error} onPress={() => setError(null)}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.note} onPress={() => setNotice(null)}>{notice}</Text>}
        {playback.errorNotice && <Text accessibilityRole="alert" style={styles.error} onPress={playback.clearErrorNotice}>{playback.errorNotice}</Text>}
        {maintenancePending && <ActionButton label="Retry storage cleanup" tone="secondary" disabled={mutating} onPress={() => { void retryMaintenance(); }} />}
      </View>}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>{committedQuery ? 'No phrases match this search.' : 'Your Phrasebook is empty.'}</Text> : null}
      renderItem={({ item }) => item.kind === 'group'
        ? <Text accessibilityRole="header" style={styles.group}>{item.label}</Text>
        : <PhraseCard
          phrase={item.phrase}
          disabled={mutating}
          onPlay={(id, role) => { void playback.play(id, role); }}
          isPlaying={playback.isPlaying}
          isGenerating={playback.isGenerating}
          onEdit={openEdit}
          onDelete={id => { void removePhrase(id); }}
        />}
      ListFooterComponent={loadingMore ? <Text style={styles.note}>Loading more phrases...</Text> : cursor ? <Text style={styles.note}>Scroll to load more phrases.</Text> : null}
    />
    {editorVisible && <PhraseEditorModal visible phrase={editingPhrase} busy={mutating}
      onClose={() => { setEditorVisible(false); setEditingPhrase(null); }} onSubmit={input => { void submitEditor(input); }} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 14, paddingBottom: 24 },
  header: { gap: 14, paddingBottom: 8 },
  titleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: palette.text, fontSize: 24, fontWeight: '700', flexGrow: 1 },
  searchRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1,
    borderColor: palette.border, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.20)' },
  search: { flex: 1, paddingVertical: 10, fontSize: 14, color: palette.text },
  note: { color: palette.textMuted, fontSize: 13 },
  error: { color: palette.danger, fontSize: 14 },
  empty: { color: palette.textMuted, fontSize: 15, paddingVertical: 20, textAlign: 'center' },
  group: { color: palette.textSubtle, fontSize: 11, fontWeight: '700', paddingTop: 12, letterSpacing: 1.8, textTransform: 'uppercase' },
});
