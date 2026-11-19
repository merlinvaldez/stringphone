import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import {
  LanguageFlag,
  MOBILE_LANGUAGE_CATALOG,
  getNativeLanguageName,
} from '../components/LanguageFlag';
import { getNativePhrasebookServices, getNativeTextChat } from '../chat/native';
import { INITIAL_CHAT_STATE } from '../chat/controller';
import { HistorySheet } from '../chat/HistorySheet';
import { messageDirection } from '../chat/presentation';
import type { PhrasebookInput, PhrasebookRow } from '../storage/phrasebook';
import {
  createTranslatedNativePhrasebookEntry,
  deleteNativePhrase,
  listNativePhrasebookCollections,
  listNativePhrasebookEntriesForLanguage,
  retryNativePhrasebookMaintenance,
  type PhrasebookCollectionSummary,
} from '../phrasebook/native';
import { PhraseEditorModal } from '../phrasebook/PhraseEditorModal';
import { usePhrasebookAudioPlayback } from '../phrasebook/usePhrasebookAudioPlayback';
import { palette } from '../theme';

function formatPronunciation(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (normalized.startsWith('(') && normalized.endsWith(')')) return normalized;
  return `(${normalized})`;
}

export default function PhrasebookScreen() {
  const params = useLocalSearchParams<{ lang?: string }>();
  const [chat, setChat] = useState<Awaited<ReturnType<typeof getNativeTextChat>> | null>(null);
  const [state, setState] = useState(INITIAL_CHAT_STATE);
  const playback = usePhrasebookAudioPlayback();

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    getNativeTextChat()
      .then(controller => {
        if (!mounted) return;
        setChat(controller);
        unsubscribe = controller.subscribe(setState);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const [activeLanguageCode, setActiveLanguageCode] = useState<string | null>(
    typeof params.lang === 'string' && params.lang.trim() ? params.lang.trim() : null,
  );
  const [collections, setCollections] = useState<PhrasebookCollectionSummary[]>([]);
  const [entries, setEntries] = useState<PhrasebookRow[]>([]);
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [maintenancePending, setMaintenancePending] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerLanguageCode, setComposerLanguageCode] = useState(state.theirLanguage || 'es');
  const [composerLanguagePickerOpen, setComposerLanguagePickerOpen] = useState(false);
  const [composerLanguageSearch, setComposerLanguageSearch] = useState('');
  const [composerSourceText, setComposerSourceText] = useState('');
  const [composerSaving, setComposerSaving] = useState(false);

  const [editorVisible, setEditorVisible] = useState(false);
  const [editingPhrase, setEditingPhrase] = useState<PhrasebookRow | null>(null);

  const [openActionEntryId, setOpenActionEntryId] = useState<string | null>(null);
  const [composerKeyboardOffset, setComposerKeyboardOffset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', event => {
      setComposerKeyboardOffset(Math.round(event.endCoordinates.height + 16));
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setComposerKeyboardOffset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);
  const [viewerFlipped, setViewerFlipped] = useState(false);
  const swipeStartXRef = useRef<number | null>(null);

  const [prevLangParam, setPrevLangParam] = useState(params.lang);
  if (params.lang !== prevLangParam) {
    setPrevLangParam(params.lang);
    if (typeof params.lang === 'string' && params.lang.trim()) {
      setActiveLanguageCode(params.lang.trim());
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setCommittedQuery(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const refreshData = useCallback(
    async (isActive: () => boolean = () => true) => {
      setLoading(true);
      setError(null);
      try {
        const [nextCollections, nextEntries] = await Promise.all([
          listNativePhrasebookCollections(activeLanguageCode ? '' : committedQuery),
          activeLanguageCode
            ? listNativePhrasebookEntriesForLanguage(activeLanguageCode, committedQuery)
            : Promise.resolve([]),
        ]);
        if (!isActive()) return;
        setCollections(nextCollections);
        setEntries(nextEntries);
      } catch (cause) {
        if (isActive()) {
          setError(
            cause instanceof Error ? cause.message : 'Could not load the local Phrasebook.',
          );
        }
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [activeLanguageCode, committedQuery],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshData(() => active);
      return () => {
        active = false;
      };
    }, [refreshData]),
  );

  const activeCollection = useMemo(() => {
    if (!activeLanguageCode) return null;
    const found = collections.find(item => item.languageCode === activeLanguageCode);
    return (
      found ?? {
        languageCode: activeLanguageCode,
        languageName: getNativeLanguageName(activeLanguageCode),
        entryCount: entries.length,
        latestUpdatedAt: 0,
      }
    );
  }, [activeLanguageCode, collections, entries.length]);

  const filteredComposerLanguages = useMemo(() => {
    const trimmed = composerLanguageSearch.trim().toLowerCase();
    if (!trimmed) return MOBILE_LANGUAGE_CATALOG;
    return MOBILE_LANGUAGE_CATALOG.filter(
      item =>
        item.code.toLowerCase().includes(trimmed) ||
        item.name.toLowerCase().includes(trimmed) ||
        item.nativeName.toLowerCase().includes(trimmed),
    );
  }, [composerLanguageSearch]);

  function openComposer(defaultLanguageCode?: string) {
    setComposerLanguageCode(defaultLanguageCode || activeLanguageCode || state.theirLanguage || 'es');
    setComposerSourceText('');
    setComposerLanguagePickerOpen(false);
    setComposerLanguageSearch('');
    setComposerOpen(true);
  }

  async function handleSaveComposer() {
    if (!composerSourceText.trim() || composerSaving) return;
    setComposerSaving(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createTranslatedNativePhrasebookEntry({
        sourceText: composerSourceText,
        sourceLanguage: state.myLanguage || 'en',
        targetLanguage: composerLanguageCode,
      });
      setComposerOpen(false);
      setComposerSourceText('');
      setActiveLanguageCode(created.target_language);
      setQuery('');
      setCommittedQuery('');
      const [nextCollections, nextEntries] = await Promise.all([
        listNativePhrasebookCollections(''),
        listNativePhrasebookEntriesForLanguage(created.target_language, ''),
      ]);
      setCollections(nextCollections);
      setEntries(nextEntries);
      const createdIdx = nextEntries.findIndex(item => item.id === created.id);
      setViewerFlipped(false);
      setViewingIndex(createdIdx >= 0 ? createdIdx : 0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not translate and save phrasebook card.',
      );
    } finally {
      setComposerSaving(false);
    }
  }

  const submitEditor = useCallback(
    async (input: PhrasebookInput) => {
      if (mutating) return;
      setMutating(true);
      setError(null);
      setNotice(null);
      try {
        const { phrasebook } = await getNativePhrasebookServices();
        if (editingPhrase) {
          const result = await phrasebook.update(
            editingPhrase.id,
            editingPhrase.updated_at,
            input,
          );
          if (result !== 'updated') {
            setError(
              result === 'missing'
                ? 'This card no longer exists.'
                : 'This card changed. Reopen it and review the latest version.',
            );
            void refreshData();
            return;
          }
          setNotice('Card updated.');
        } else {
          await phrasebook.create(input);
          setNotice('Card added to Phrasebook.');
        }
        setEditorVisible(false);
        setEditingPhrase(null);
        void refreshData();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not save this card.');
      } finally {
        setMutating(false);
      }
    },
    [editingPhrase, mutating, refreshData],
  );

  const removePhrase = useCallback(
    async (id: string) => {
      if (mutating) return;
      if (playback.activeAudio?.phraseId === id) playback.stop();
      setMutating(true);
      setError(null);
      setNotice(null);
      setOpenActionEntryId(null);
      try {
        const report = await deleteNativePhrase(id);
        if (report.status === 'deleted') {
          void refreshData();
          const pending =
            !report.compacted ||
            report.maintenanceErrors.length > 0 ||
            (report.cleanup?.failures.length ?? 0) > 0;
          setMaintenancePending(pending);
          setNotice(
            pending
              ? 'Card deleted. Storage cleanup is pending; retry it below.'
              : 'Card deleted.',
          );
        } else if (report.status === 'changed') {
          setError('This card changed while the confirmation was open. Review it and try again.');
          void refreshData();
        } else if (report.status === 'missing') {
          setNotice('This card was already removed.');
          void refreshData();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not delete this card.');
      } finally {
        setMutating(false);
      }
    },
    [mutating, playback, refreshData],
  );

  const retryMaintenance = useCallback(async () => {
    setMutating(true);
    setError(null);
    try {
      const report = await retryNativePhrasebookMaintenance();
      const pending =
        !report.compacted ||
        report.maintenanceErrors.length > 0 ||
        (report.cleanup?.failures.length ?? 0) > 0;
      setMaintenancePending(pending);
      setNotice(
        pending ? 'Some storage cleanup is still pending.' : 'Phrasebook storage cleanup completed.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry storage cleanup.');
    } finally {
      setMutating(false);
    }
  }, []);

  const currentViewedEntry =
    viewingIndex !== null && entries[viewingIndex] ? entries[viewingIndex] : null;

  function stepViewer(direction: -1 | 1) {
    if (entries.length <= 1 || viewingIndex === null) return;
    playback.stop();
    setViewerFlipped(false);
    setViewingIndex((viewingIndex + direction + entries.length) % entries.length);
  }

  function shuffleViewer() {
    if (entries.length <= 1 || viewingIndex === null) return;
    playback.stop();
    setViewerFlipped(false);
    let next = viewingIndex;
    while (next === viewingIndex) {
      next = Math.floor(Math.random() * entries.length);
    }
    setViewingIndex(next);
  }

  const activeError = error || playback.errorNotice;

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <View style={styles.topNavRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open history"
          disabled={!chat}
          onPress={() => setHistoryVisible(true)}
          style={styles.circleNavBtn}
        >
          <Feather name="menu" size={18} color={palette.text} />
        </Pressable>

        {activeLanguageCode && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to phrasebook"
            onPress={() => {
              setOpenActionEntryId(null);
              setViewingIndex(null);
              setQuery('');
              setCommittedQuery('');
              setActiveLanguageCode(null);
            }}
            style={styles.circleNavBtn}
          >
            <Feather name="chevron-left" size={20} color="#E4E4E7" />
          </Pressable>
        )}
      </View>

      {!activeLanguageCode ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroBadgeGroup}>
                <View style={styles.emeraldIconBadge}>
                  <Feather name="bookmark" size={18} color="#A7F3D0" />
                </View>
                <Text style={styles.heroBadgeLabel}>PHRASEBOOK</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add phrasebook card"
                onPress={() => openComposer()}
                style={styles.addCircleBtn}
              >
                <Feather name="plus" size={18} color="#E4E4E7" />
              </Pressable>
            </View>

            <Text style={styles.heroSubtitle}>
              Words and phrases you want to remember.
            </Text>

            <View style={styles.searchBox}>
              <Feather name="search" size={16} color={palette.textSubtle} />
              <TextInput
                accessibilityLabel="Search phrasebook"
                placeholder="Search phrasebook"
                placeholderTextColor={palette.textSubtle}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {!!query && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => {
                    setQuery('');
                    setCommittedQuery('');
                  }}
                >
                  <Feather name="x" size={15} color={palette.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

          {!!activeError && (
            <Pressable
              accessibilityRole="alert"
              onPress={() => {
                setError(null);
                playback.clearErrorNotice();
              }}
              style={styles.errorBanner}
            >
              <Feather name="alert-circle" size={14} color="#FB7185" />
              <Text style={styles.errorBannerText}>{activeError}</Text>
            </Pressable>
          )}
          {!!notice && (
            <Pressable onPress={() => setNotice(null)} style={styles.noticeBanner}>
              <Text style={styles.noticeBannerText}>{notice}</Text>
            </Pressable>
          )}
          {maintenancePending && (
            <ActionButton
              label="Retry storage cleanup"
              tone="secondary"
              disabled={mutating}
              onPress={() => {
                void retryMaintenance();
              }}
            />
          )}

          <View style={styles.collectionsCard}>
            {loading ? (
              <View style={styles.emptyCardState}>
                <ActivityIndicator size="small" color={palette.emerald} />
              </View>
            ) : collections.length === 0 ? (
              <View style={styles.emptyCardState}>
                <Text style={styles.emptyCardText}>
                  {committedQuery ? 'No phrasebook cards match your search.' : 'No phrasebook cards yet.'}
                </Text>
              </View>
            ) : (
              collections.map((collection, idx) => {
                const countLabel = `${collection.entryCount} ${collection.entryCount === 1 ? 'card' : 'cards'}`;
                return (
                  <Pressable
                    key={collection.languageCode}
                    accessibilityRole="button"
                    accessibilityLabel={`${collection.languageName}, ${countLabel}`}
                    onPress={() => {
                      setQuery('');
                      setCommittedQuery('');
                      setActiveLanguageCode(collection.languageCode);
                    }}
                    style={[
                      styles.collectionRow,
                      idx > 0 && styles.collectionRowDivider,
                    ]}
                  >
                    <View style={styles.collectionRowLeft}>
                      <LanguageFlag code={collection.languageCode} size="lg" />
                      <View style={styles.collectionRowText}>
                        <Text style={styles.collectionTitle} numberOfLines={1}>
                          {collection.languageName}
                        </Text>
                        <Text style={styles.collectionCount}>{countLabel}</Text>
                      </View>
                    </View>
                    <Feather name="chevron-right" size={18} color={palette.textSubtle} />
                  </Pressable>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.detailHeaderGroup}>
              <View style={styles.heroCard}>
                <View style={styles.detailTitleRow}>
                  <LanguageFlag code={activeCollection?.languageCode || activeLanguageCode} size="lg" />
                  <View style={styles.collectionRowText}>
                    <Text style={styles.detailTitle} numberOfLines={1}>
                      {activeCollection?.languageName}
                    </Text>
                    <Text style={styles.collectionCount}>
                      {`${entries.length} ${entries.length === 1 ? 'card' : 'cards'}`}
                    </Text>
                  </View>
                </View>

                <View style={styles.searchBox}>
                  <Feather name="search" size={16} color={palette.textSubtle} />
                  <TextInput
                    accessibilityLabel={`Search ${activeCollection?.languageName || 'cards'}`}
                    placeholder={`Search ${activeCollection?.languageName || 'cards'}`}
                    placeholderTextColor={palette.textSubtle}
                    value={query}
                    onChangeText={setQuery}
                    returnKeyType="search"
                    style={styles.searchInput}
                  />
                  {!!query && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear search"
                      onPress={() => {
                        setQuery('');
                        setCommittedQuery('');
                      }}
                    >
                      <Feather name="x" size={15} color={palette.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add phrasebook card"
                onPress={() => openComposer(activeLanguageCode)}
                style={styles.fullWidthAddBtn}
              >
                <Feather name="plus" size={18} color="#E4E4E7" />
              </Pressable>

              {!!activeError && (
                <Pressable
                  accessibilityRole="alert"
                  onPress={() => {
                    setError(null);
                    playback.clearErrorNotice();
                  }}
                  style={styles.errorBanner}
                >
                  <Feather name="alert-circle" size={14} color="#FB7185" />
                  <Text style={styles.errorBannerText}>{activeError}</Text>
                </Pressable>
              )}
              {!!notice && (
                <Pressable onPress={() => setNotice(null)} style={styles.noticeBanner}>
                  <Text style={styles.noticeBannerText}>{notice}</Text>
                </Pressable>
              )}
              {maintenancePending && (
                <ActionButton
                  label="Retry storage cleanup"
                  tone="secondary"
                  disabled={mutating}
                  onPress={() => {
                    void retryMaintenance();
                  }}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyDetailCard}>
                <ActivityIndicator size="small" color={palette.emerald} />
              </View>
            ) : (
              <View style={styles.emptyDetailCard}>
                <Text style={styles.emptyCardText}>
                  {committedQuery ? 'No cards match your search.' : 'No cards in this language yet.'}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const phraseText = item.translated_text || item.original_text;
            const phrasePronunciation = formatPronunciation(
              item.translated_text ? item.translated_pronunciation : item.original_pronunciation,
            );
            const meaningText = item.original_text;
            const meaningPronunciation = item.translated_text
              ? formatPronunciation(item.original_pronunciation)
              : '';
            const isActionOpen = openActionEntryId === item.id;
            const isPlayingTarget = playback.isPlaying(item.id, 'translated');
            const isGeneratingTarget = playback.isGenerating(item.id, 'translated');

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${phraseText}, ${meaningText}`}
                onPress={() => {
                  setOpenActionEntryId(null);
                  setViewerFlipped(false);
                  setViewingIndex(index);
                }}
                style={styles.entryCard}
              >
                <View style={styles.entryTopRow}>
                  <View style={styles.entryMainText}>
                    <Text
                      style={[styles.entryPhraseText, messageDirection(item.target_language)]}
                    >
                      {phraseText}
                    </Text>
                    {!!phrasePronunciation && (
                      <Text style={styles.entryPronunciationText}>{phrasePronunciation}</Text>
                    )}
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPlayingTarget ? 'Stop phrase audio' : 'Play phrase audio'
                    }
                    disabled={mutating || isGeneratingTarget}
                    onPress={() => {
                      void playback.play(item.id, 'translated');
                    }}
                    style={[styles.audioIconBtn, isPlayingTarget && styles.audioIconBtnActive]}
                  >
                    {isGeneratingTarget ? (
                      <ActivityIndicator size={13} color={palette.text} />
                    ) : (
                      <Feather
                        name={isPlayingTarget ? 'square' : 'volume-2'}
                        size={14}
                        color={isPlayingTarget ? '#A7F3D0' : '#E4E4E7'}
                      />
                    )}
                  </Pressable>
                </View>

                <View style={styles.entryBottomRow}>
                  <View style={styles.entryMeaningWrap}>
                    <Text
                      style={[styles.entryMeaningText, messageDirection(item.source_language)]}
                    >
                      {meaningText}
                    </Text>
                    {!!meaningPronunciation && (
                      <Text style={styles.entryMeaningPronunciationText}>{meaningPronunciation}</Text>
                    )}
                  </View>

                  <View style={styles.entryActionsGroup}>
                    {isActionOpen && (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Edit card"
                          disabled={mutating}
                          onPress={() => {
                            setOpenActionEntryId(null);
                            setEditingPhrase(item);
                            setEditorVisible(true);
                          }}
                          style={styles.editActionBtn}
                        >
                          <Feather name="edit-2" size={14} color="#E4E4E7" />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Delete card"
                          disabled={mutating}
                          onPress={() => {
                            void removePhrase(item.id);
                          }}
                          style={styles.deleteActionBtn}
                        >
                          <Feather name="trash-2" size={14} color="#FDA4AF" />
                        </Pressable>
                      </>
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Card actions"
                      onPress={() =>
                        setOpenActionEntryId(current => (current === item.id ? null : item.id))
                      }
                      style={[styles.moreActionBtn, isActionOpen && styles.moreActionBtnActive]}
                    >
                      <Feather name="more-vertical" size={16} color={palette.textMuted} />
                    </Pressable>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* CollectionComposer Modal (web-parity single input auto-translating card creator) */}
      <Modal
        visible={composerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          style={[
            styles.modalBackdrop,
            Platform.OS === 'android' && composerKeyboardOffset > 0
              ? { paddingBottom: composerKeyboardOffset }
              : null,
          ]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!composerSaving) setComposerOpen(false);
            }}
          />
          <View style={styles.composerModalCard}>
            <View style={styles.composerHeaderRow}>
              <View style={styles.newCardBadge}>
                <Feather name="plus" size={14} color="#A7F3D0" />
                <Text style={styles.newCardBadgeText}>NEW CARD</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close composer"
                disabled={composerSaving}
                onPress={() => setComposerOpen(false)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={16} color="#D4D4D8" />
              </Pressable>
            </View>

            {!activeLanguageCode && (
              <View style={styles.composerLangSection}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select target language"
                  onPress={() => setComposerLanguagePickerOpen(open => !open)}
                  style={styles.composerLangButton}
                >
                  <View style={styles.composerLangBtnLeft}>
                    <LanguageFlag code={composerLanguageCode} size="md" />
                    <Text style={styles.composerLangBtnText}>
                      {getNativeLanguageName(composerLanguageCode)}
                    </Text>
                  </View>
                  <Feather
                    name={composerLanguagePickerOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={palette.textMuted}
                  />
                </Pressable>

                {composerLanguagePickerOpen && (
                  <View style={styles.composerLangDropdown}>
                    <View style={styles.composerLangSearchRow}>
                      <Feather name="search" size={14} color={palette.textSubtle} />
                      <TextInput
                        accessibilityLabel="Search languages"
                        placeholder="Search languages..."
                        placeholderTextColor={palette.textSubtle}
                        value={composerLanguageSearch}
                        onChangeText={setComposerLanguageSearch}
                        style={styles.composerLangSearchInput}
                      />
                    </View>
                    <ScrollView style={styles.composerLangList} keyboardShouldPersistTaps="handled">
                      {filteredComposerLanguages.map(lang => {
                        const selected = lang.code === composerLanguageCode;
                        return (
                          <Pressable
                            key={lang.code}
                            accessibilityRole="button"
                            onPress={() => {
                              setComposerLanguageCode(lang.code);
                              setComposerLanguagePickerOpen(false);
                              setComposerLanguageSearch('');
                            }}
                            style={[
                              styles.composerLangOption,
                              selected && styles.composerLangOptionSelected,
                            ]}
                          >
                            <LanguageFlag code={lang.code} size="md" />
                            <Text
                              style={[
                                styles.composerLangOptionText,
                                selected && styles.composerLangOptionTextSelected,
                              ]}
                            >
                              {lang.nativeName}
                            </Text>
                            {selected && <Feather name="check" size={14} color="#A7F3D0" />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            <TextInput
              accessibilityLabel="Word or phrase"
              placeholder="Word or phrase"
              placeholderTextColor={palette.textSubtle}
              value={composerSourceText}
              onChangeText={setComposerSourceText}
              editable={!composerSaving}
              returnKeyType="done"
              onSubmitEditing={() => {
                void handleSaveComposer();
              }}
              style={styles.composerInput}
            />

            <View style={styles.composerFooterRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manual offline editor"
                disabled={composerSaving}
                onPress={() => {
                  setComposerOpen(false);
                  setEditingPhrase(null);
                  setEditorVisible(true);
                }}
              >
                <Text style={styles.manualLinkText}>Manual fields</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={composerSaving ? 'Translating' : 'Save'}
                disabled={!composerSourceText.trim() || composerSaving}
                onPress={() => {
                  void handleSaveComposer();
                }}
                style={[
                  styles.composerSaveBtn,
                  (!composerSourceText.trim() || composerSaving) && styles.disabledBtn,
                ]}
              >
                {composerSaving && <ActivityIndicator size={14} color="#09090B" />}
                <Text style={styles.composerSaveBtnText}>
                  {composerSaving ? 'Translating...' : 'Save'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* CollectionEntryViewer Modal (Full-screen flashcard flip viewer) */}
      <Modal
        visible={currentViewedEntry !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          playback.stop();
          setViewingIndex(null);
        }}
      >
        {currentViewedEntry && (
          <View
            style={styles.viewerOverlay}
            onTouchStart={e => {
              swipeStartXRef.current = e.nativeEvent.pageX;
            }}
            onTouchEnd={e => {
              const startX = swipeStartXRef.current;
              swipeStartXRef.current = null;
              if (startX === null) return;
              const deltaX = e.nativeEvent.pageX - startX;
              if (Math.abs(deltaX) < 48 || entries.length <= 1) return;
              stepViewer(deltaX < 0 ? 1 : -1);
            }}
          >
            <SafeAreaView style={styles.viewerSafeArea} edges={['top', 'left', 'right', 'bottom']}>
              <View style={styles.viewerTopBar}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Random card"
                  disabled={entries.length <= 1}
                  onPress={shuffleViewer}
                  style={[styles.viewerTopBtn, entries.length <= 1 && styles.disabledBtn]}
                >
                  <Feather name="shuffle" size={18} color="#E4E4E7" />
                </Pressable>
              </View>

              <View style={styles.viewerCenterRow}>
                {entries.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Previous card"
                    onPress={() => stepViewer(-1)}
                    style={styles.viewerArrowBtn}
                  >
                    <Feather name="chevron-left" size={20} color="#E4E4E7" />
                  </Pressable>
                )}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    viewerFlipped ? 'Show phrase side' : 'Show translation side'
                  }
                  onPress={() => setViewerFlipped(flipped => !flipped)}
                  style={[
                    styles.flashcard,
                    viewerFlipped ? styles.flashcardBack : styles.flashcardFront,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close card viewer"
                    hitSlop={12}
                    onPress={e => {
                      e?.stopPropagation?.();
                      playback.stop();
                      setViewingIndex(null);
                    }}
                    style={styles.flashcardCloseBtn}
                  >
                    <Feather name="x" size={20} color="#E4E4E7" />
                  </Pressable>
                  {!viewerFlipped ? (
                    <View style={styles.flashcardContent}>
                      <View style={styles.flashcardHeadlineRow}>
                        <Text
                          style={[
                            styles.flashcardPrimaryText,
                            messageDirection(currentViewedEntry.target_language),
                          ]}
                        >
                          {currentViewedEntry.translated_text || currentViewedEntry.original_text}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Play phrase audio"
                          onPress={() => {
                            void playback.play(currentViewedEntry.id, 'translated');
                          }}
                          style={styles.flashcardAudioBtn}
                        >
                          {playback.isGenerating(currentViewedEntry.id, 'translated') ? (
                            <ActivityIndicator size={15} color={palette.text} />
                          ) : (
                            <Feather
                              name={
                                playback.isPlaying(currentViewedEntry.id, 'translated')
                                  ? 'square'
                                  : 'volume-2'
                              }
                              size={16}
                              color="#E4E4E7"
                            />
                          )}
                        </Pressable>
                      </View>
                      {!!formatPronunciation(
                        currentViewedEntry.translated_pronunciation ||
                          currentViewedEntry.original_pronunciation,
                      ) && (
                        <Text style={styles.flashcardFrontPronunciation}>
                          {formatPronunciation(
                            currentViewedEntry.translated_pronunciation ||
                              currentViewedEntry.original_pronunciation,
                          )}
                        </Text>
                      )}
                      <Text style={styles.flashcardTapHint}>Tap card to flip</Text>
                    </View>
                  ) : (
                    <View style={styles.flashcardContent}>
                      <View style={styles.flashcardHeadlineRow}>
                        <Text
                          style={[
                            styles.flashcardPrimaryText,
                            messageDirection(currentViewedEntry.source_language),
                          ]}
                        >
                          {currentViewedEntry.original_text}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Play meaning audio"
                          onPress={() => {
                            void playback.play(currentViewedEntry.id, 'source');
                          }}
                          style={styles.flashcardAudioBtn}
                        >
                          {playback.isGenerating(currentViewedEntry.id, 'source') ? (
                            <ActivityIndicator size={15} color={palette.text} />
                          ) : (
                            <Feather
                              name={
                                playback.isPlaying(currentViewedEntry.id, 'source')
                                  ? 'square'
                                  : 'volume-2'
                              }
                              size={16}
                              color="#E4E4E7"
                            />
                          )}
                        </Pressable>
                      </View>
                      {!!formatPronunciation(currentViewedEntry.original_pronunciation) && (
                        <Text style={styles.flashcardBackPronunciation}>
                          {formatPronunciation(currentViewedEntry.original_pronunciation)}
                        </Text>
                      )}
                      <Text style={styles.flashcardTapHint}>Tap card to flip</Text>
                    </View>
                  )}
                </Pressable>

                {entries.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Next card"
                    onPress={() => stepViewer(1)}
                    style={styles.viewerArrowBtn}
                  >
                    <Feather name="chevron-right" size={20} color="#E4E4E7" />
                  </Pressable>
                )}
              </View>
            </SafeAreaView>
          </View>
        )}
      </Modal>

      {editorVisible && (
        <PhraseEditorModal
          visible
          phrase={editingPhrase}
          busy={mutating}
          onClose={() => {
            setEditorVisible(false);
            setEditingPhrase(null);
          }}
          onSubmit={input => {
            void submitEditor(input);
          }}
        />
      )}

      {chat && (
        <HistorySheet
          visible={historyVisible}
          onClose={() => setHistoryVisible(false)}
          state={state}
          chat={chat}
          initialView="phrasebook"
          activePhrasebookLanguageCode={activeLanguageCode}
          onSelectPhrasebookLanguage={code => {
            setQuery('');
            setCommittedQuery('');
            setActiveLanguageCode(code);
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
  topNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 8,
  },
  circleNavBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },
  detailHeaderGroup: {
    gap: 12,
  },
  heroCard: {
    padding: 20,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.72)',
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroBadgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emeraldIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.30)',
    backgroundColor: 'rgba(16,185,129,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeLabel: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  addCircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSubtitle: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 14,
    paddingVertical: 6,
  },
  collectionsCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.72)',
    overflow: 'hidden',
  },
  emptyCardState: {
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDetailCard: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardText: {
    color: palette.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  collectionRowDivider: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  collectionRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  collectionRowText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  collectionTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
  },
  collectionCount: {
    color: palette.textMuted,
    fontSize: 14,
  },
  detailTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '600',
  },
  fullWidthAddBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryCard: {
    padding: 18,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(24,24,27,0.72)',
    gap: 12,
  },
  entryTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  entryMainText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  entryPhraseText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 28,
  },
  entryPronunciationText: {
    color: 'rgba(167,243,208,0.85)',
    fontSize: 14,
  },
  audioIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioIconBtnActive: {
    borderColor: 'rgba(52,211,153,0.40)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  entryBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  entryMeaningWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  entryMeaningText: {
    color: '#D4D4D8',
    fontSize: 15,
    lineHeight: 22,
  },
  entryMeaningPronunciationText: {
    color: 'rgba(186,230,253,0.78)',
    fontSize: 12,
    lineHeight: 18,
  },
  entryActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.30)',
    backgroundColor: 'rgba(244,63,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreActionBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.35)',
    backgroundColor: 'rgba(244,63,94,0.12)',
  },
  errorBannerText: {
    flex: 1,
    color: '#FFE4E6',
    fontSize: 13,
  },
  noticeBanner: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(24,24,27,0.85)',
  },
  noticeBannerText: {
    color: palette.emerald,
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  composerModalCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#18181B',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  composerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  newCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.30)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  newCardBadgeText: {
    color: '#D1FAE5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerLangSection: {
    gap: 8,
  },
  composerLangButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  composerLangBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  composerLangBtnText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '500',
  },
  composerLangDropdown: {
    maxHeight: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#09090B',
    padding: 8,
    gap: 6,
  },
  composerLangSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  composerLangSearchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
  },
  composerLangList: {
    maxHeight: 160,
  },
  composerLangOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
  },
  composerLangOptionSelected: {
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  composerLangOptionText: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 13,
  },
  composerLangOptionTextSelected: {
    color: '#ECFDF5',
    fontWeight: '600',
  },
  composerInput: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    color: palette.text,
    fontSize: 14,
  },
  composerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  manualLinkText: {
    color: palette.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  composerSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#10B981',
  },
  composerSaveBtnText: {
    color: '#09090B',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  viewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.84)',
  },
  viewerSafeArea: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },
  viewerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  viewerTopBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(24,24,27,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerCenterRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  viewerArrowBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(24,24,27,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcard: {
    flex: 1,
    maxWidth: 380,
    minHeight: 300,
    borderRadius: 34,
    borderWidth: 1,
    padding: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  flashcardCloseBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    zIndex: 10,
    padding: 6,
  },
  flashcardFront: {
    backgroundColor: '#052E1B',
    borderColor: 'rgba(52,211,153,0.25)',
  },
  flashcardBack: {
    backgroundColor: '#082F49',
    borderColor: 'rgba(56,189,248,0.25)',
  },
  flashcardContent: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  flashcardHeadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  flashcardPrimaryText: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 36,
    textAlign: 'center',
  },
  flashcardAudioBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashcardFrontPronunciation: {
    color: 'rgba(167,243,208,0.88)',
    fontSize: 16,
    textAlign: 'center',
  },
  flashcardBackPronunciation: {
    color: 'rgba(186,230,253,0.88)',
    fontSize: 16,
    textAlign: 'center',
  },
  flashcardTapHint: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.40)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
});
