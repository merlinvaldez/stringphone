import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { getNativePhrasebookServices } from '../chat/native';
import type { PhrasebookCursor, PhrasebookInput, PhrasebookRow } from '../storage/phrasebook';
import { languageName } from '../chat/presentation';
import { deleteNativePhrase, retryNativePhrasebookMaintenance } from '../phrasebook/native';
import { PhraseCard } from '../phrasebook/PhraseCard';
import { PhraseEditorModal } from '../phrasebook/PhraseEditorModal';
import { usePhrasebookAudioPlayback } from '../phrasebook/usePhrasebookAudioPlayback';

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

  return <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
    <FlatList
      data={displayItems}
      keyExtractor={item => item.key}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReached={() => { void loadMore(); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={<View style={styles.header}>
        <Text style={styles.brand}>StringPhone</Text>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>Phrasebook</Text>
          <ActionButton label="Add phrase" disabled={mutating} onPress={openCreate} />
        </View>
        <Text style={styles.description}>Saved learning material stays on this phone. Browse and saved audio work offline; generating missing speech needs internet.</Text>
        <TextInput accessibilityLabel="Search Phrasebook" placeholder="Search phrases, translations, or pronunciation"
          value={query} onChangeText={setQuery}
          onSubmitEditing={() => setCommittedQuery(query.trim())} returnKeyType="search" autoCorrect={false} maxLength={500}
          style={styles.search} />
        <View style={styles.headerActions}>
          <ActionButton label="Search phrases" tone="secondary" disabled={loading} onPress={() => setCommittedQuery(query.trim())} />
          <ActionButton label="Clear search" tone="secondary" disabled={!query && !committedQuery} onPress={() => { setQuery(''); setCommittedQuery(''); }} />
        </View>
        {loading && <Text accessibilityLiveRegion="polite" style={styles.note}>Loading saved phrases...</Text>}
        {error && <Text accessibilityRole="alert" style={styles.error} onPress={() => setError(null)}>{error}</Text>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.note} onPress={() => setNotice(null)}>{notice}</Text>}
        {playback.errorNotice && <Text accessibilityRole="alert" style={styles.error} onPress={playback.clearErrorNotice}>{playback.errorNotice}</Text>}
        {maintenancePending && <ActionButton label="Retry storage cleanup" tone="secondary" disabled={mutating} onPress={() => { void retryMaintenance(); }} />}
      </View>}
      ListEmptyComponent={!loading ? <Text style={styles.empty}>{committedQuery ? 'No saved phrases match this search.' : 'Your Phrasebook is empty. Save a translated message or add a phrase.'}</Text> : null}
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
      ListFooterComponent={loadingMore ? <Text style={styles.note}>Loading more phrases...</Text> : cursor ? <ActionButton label="Load more phrases" tone="secondary" disabled={loadingMore} onPress={() => { void loadMore(); }} /> : null}
    />
    {editorVisible && <PhraseEditorModal visible phrase={editingPhrase} busy={mutating}
      onClose={() => { setEditorVisible(false); setEditingPhrase(null); }} onSubmit={input => { void submitEditor(input); }} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2' },
  list: { padding: 16, gap: 12, paddingBottom: 28 },
  header: { gap: 12, paddingBottom: 8 },
  brand: { color: '#285B48', fontSize: 17, fontWeight: '600' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { color: '#182A23', fontSize: 30, fontWeight: '700', flexGrow: 1 },
  description: { color: '#48574F', fontSize: 15, lineHeight: 22 },
  search: { minHeight: 48, borderWidth: 1, borderColor: '#66736C', borderRadius: 10, padding: 12, fontSize: 17, backgroundColor: '#FFF', color: '#182A23' },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { color: '#285B48', fontSize: 15 },
  error: { color: '#9B2727', fontSize: 15 },
  empty: { color: '#48574F', fontSize: 16, paddingVertical: 16 },
  group: { color: '#182A23', fontSize: 18, fontWeight: '700', paddingTop: 12 },
});
