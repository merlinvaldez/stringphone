import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActionButton } from '../components/ActionButton';
import { LanguageFlag, getNativeLanguageName } from '../components/LanguageFlag';
import type { ChatState, createTextChatController } from './controller';
import {
  listNativePhrasebookCollections,
  type PhrasebookCollectionSummary,
} from '../phrasebook/native';
import { palette } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  state: ChatState;
  chat: ReturnType<typeof createTextChatController>;
  onNewChat?: () => void;
  newLabel?: string;
  initialView?: 'chat' | 'phrasebook';
  activePhrasebookLanguageCode?: string | null;
  onSelectPhrasebookLanguage?: (languageCode: string | null) => void;
};

function getDisplayTitle(title: string | null | undefined, myLanguage: string, theirLanguage: string) {
  const trimmed = typeof title === 'string' ? title.trim() : '';
  if (!trimmed) {
    return `${getNativeLanguageName(myLanguage)} → ${getNativeLanguageName(theirLanguage)}`;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1 && colonIdx < trimmed.length - 1 && trimmed.slice(0, colonIdx).includes('→')) {
    return trimmed.slice(colonIdx + 1).trim();
  }
  return trimmed;
}

export function HistorySheet({
  visible,
  onClose,
  state,
  chat,
  onNewChat,
  newLabel = 'New Conversation',
  initialView = 'chat',
  activePhrasebookLanguageCode = null,
  onSelectPhrasebookLanguage,
}: Props) {
  const router = useRouter();
  const [historyView, setHistoryView] = useState<'chat' | 'phrasebook'>(initialView);
  const [query, setQuery] = useState('');
  const [openActionConversationId, setOpenActionConversationId] = useState<string | null>(null);
  const [collections, setCollections] = useState<PhrasebookCollectionSummary[] | null>(null);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setOpenActionConversationId(null);
    } else {
      setHistoryView(initialView);
    }
  }

  const disabled = state.busy || state.historyBusy;
  const isPhrasebookView = historyView === 'phrasebook';
  const collectionsLoading = visible && isPhrasebookView && collections === null;

  useEffect(() => {
    if (!visible || !isPhrasebookView) return;
    let active = true;
    listNativePhrasebookCollections(query)
      .then(items => {
        if (active) setCollections(items);
      })
      .catch(() => {
        if (active) setCollections([]);
      });
    return () => {
      active = false;
    };
  }, [visible, isPhrasebookView, query]);

  function handleSearchChange(text: string) {
    setQuery(text);
    if (!isPhrasebookView) {
      void chat.searchHistory(text);
    }
  }

  function handleOpenPhrasebookRoot() {
    if (onSelectPhrasebookLanguage) {
      onSelectPhrasebookLanguage(null);
      onClose();
      return;
    }
    onClose();
    router.navigate('/phrasebook');
  }

  function handleSelectPhrasebookCollection(languageCode: string) {
    if (onSelectPhrasebookLanguage) {
      onSelectPhrasebookLanguage(languageCode);
      onClose();
      return;
    }
    onClose();
    router.navigate({ pathname: '/phrasebook', params: { lang: languageCode } });
  }

  function handleOpenConversation(conversationId: string, originMode: string) {
    void chat.openConversation(conversationId).then(opened => {
      if (!opened) return;
      onClose();
      if (originMode === 'single') {
        router.navigate('/single');
      } else if (originMode === 'conversation') {
        router.navigate('/conversation');
      } else {
        router.navigate('/');
      }
    });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      <View style={styles.overlayRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close history backdrop"
          style={styles.backdrop}
          onPress={onClose}
        />
        <SafeAreaView style={styles.drawer} edges={['top', 'left', 'bottom']}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text accessibilityRole="header" style={styles.title}>
                History
              </Text>
              <View style={styles.tabGroup}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Chat history"
                  onPress={() => setHistoryView('chat')}
                  style={[styles.tabIconBtn, !isPhrasebookView && styles.tabIconBtnActive]}
                >
                  <Feather
                    name="message-square"
                    size={16}
                    color={!isPhrasebookView ? '#A7F3D0' : palette.textMuted}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Phrasebook history"
                  onPress={() => setHistoryView('phrasebook')}
                  style={[styles.tabIconBtn, isPhrasebookView && styles.tabIconBtnActive]}
                >
                  <Feather
                    name="bookmark"
                    size={16}
                    color={isPhrasebookView ? '#A7F3D0' : palette.textMuted}
                  />
                </Pressable>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close history"
              onPress={onClose}
              style={styles.closeBtn}
            >
              <Feather name="x" size={18} color={palette.textMuted} />
            </Pressable>
          </View>

          <View style={styles.primaryActionSection}>
            {isPhrasebookView ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open phrasebook"
                onPress={handleOpenPhrasebookRoot}
                style={styles.emeraldActionBtn}
              >
                <Feather name="bookmark" size={16} color="#09090B" />
                <Text style={styles.emeraldActionBtnText}>Open phrasebook</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={newLabel}
                disabled={disabled}
                onPress={() => {
                  if (onNewChat) {
                    onNewChat();
                  } else {
                    void chat.newConversation().then(() => onClose());
                  }
                }}
                style={[styles.emeraldActionBtn, disabled && styles.disabledBtn]}
              >
                <Feather name="plus" size={16} color="#09090B" />
                <Text style={styles.emeraldActionBtnText}>{newLabel}</Text>
              </Pressable>
            )}

            <View style={styles.searchWrap}>
              <Feather name="search" size={14} color={palette.textSubtle} />
              <TextInput
                accessibilityLabel="Search history"
                placeholder={isPhrasebookView ? 'Search phrasebook' : 'Search titles or messages'}
                placeholderTextColor={palette.textSubtle}
                value={query}
                onChangeText={handleSearchChange}
                returnKeyType="search"
                style={styles.searchInput}
                maxLength={500}
              />
              {!!query && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  onPress={() => handleSearchChange('')}
                >
                  <Feather name="x" size={14} color={palette.textMuted} />
                </Pressable>
              )}
            </View>
          </View>

          {state.error && (
            <Text accessibilityRole="alert" style={styles.errorText}>
              {state.error}
            </Text>
          )}
          {state.maintenancePending && (
            <View style={styles.maintenanceWrap}>
              <ActionButton
                label="Retry storage cleanup"
                disabled={disabled}
                onPress={() => {
                  void chat.retryStorageCleanup();
                }}
              />
            </View>
          )}

          {isPhrasebookView ? (
            collectionsLoading ? (
              <View style={styles.emptyWrap}>
                <ActivityIndicator size="small" color={palette.emerald} />
              </View>
            ) : (
              <FlatList
                data={collections ?? []}
                keyExtractor={item => item.languageCode}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>No phrasebook cards yet</Text>
                  </View>
                }
                renderItem={({ item }) => {
                  const isActive = item.languageCode === activePhrasebookLanguageCode;
                  const countLabel = `${item.entryCount} ${item.entryCount === 1 ? 'card' : 'cards'}`;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.languageName}, ${countLabel}`}
                      onPress={() => handleSelectPhrasebookCollection(item.languageCode)}
                      style={[styles.collectionRow, isActive && styles.rowActive]}
                    >
                      <LanguageFlag code={item.languageCode} size="md" />
                      <View style={styles.collectionTextWrap}>
                        <Text
                          style={[styles.rowTitle, isActive && styles.rowTitleActive]}
                          numberOfLines={1}
                        >
                          {item.languageName}
                        </Text>
                        <Text style={styles.rowMeta}>{countLabel}</Text>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )
          ) : (
            <FlatList
              data={state.conversations}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                !state.historyBusy ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>
                      {state.historyQuery.trim() ? 'No conversations match your search' : 'No history yet'}
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                state.historyCursor ? (
                  <ActionButton
                    label="Load more conversations"
                    disabled={disabled}
                    onPress={() => {
                      void chat.loadMoreHistory();
                    }}
                  />
                ) : null
              }
              renderItem={({ item }) => {
                const isActive = item.id === state.conversation?.id;
                const isActionOpen = openActionConversationId === item.id;
                const displayTitle = getDisplayTitle(item.title, item.my_language, item.their_language);
                return (
                  <View style={[styles.convRow, isActive && styles.rowActive]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${displayTitle}`}
                      accessibilityState={{ disabled, selected: isActive }}
                      disabled={disabled}
                      onPress={() => {
                        setOpenActionConversationId(null);
                        handleOpenConversation(item.id, item.origin_mode);
                      }}
                      style={styles.convMainBtn}
                    >
                      <View style={styles.convTopLine}>
                        <View style={styles.flagPairPill}>
                          <LanguageFlag code={item.my_language} size="sm" />
                          <Text style={styles.flagArrow}>→</Text>
                          <LanguageFlag code={item.their_language} size="sm" />
                        </View>
                        <Text
                          style={[styles.rowTitle, isActive && styles.rowTitleActive]}
                          numberOfLines={1}
                        >
                          {displayTitle}
                        </Text>
                      </View>
                      <Text style={styles.rowMeta}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </Pressable>

                    <View style={styles.convActions}>
                      {isActionOpen && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${displayTitle}`}
                          disabled={disabled}
                          onPress={() => {
                            setOpenActionConversationId(null);
                            void chat.deleteConversation(item.id);
                          }}
                          style={styles.deleteBtn}
                        >
                          <Feather name="trash-2" size={15} color="#FDA4AF" />
                        </Pressable>
                      )}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Conversation actions"
                        disabled={disabled}
                        onPress={() =>
                          setOpenActionConversationId(current => (current === item.id ? null : item.id))
                        }
                        style={[styles.moreBtn, isActionOpen && styles.moreBtnActive]}
                      >
                        <Feather name="more-vertical" size={16} color={palette.textMuted} />
                      </Pressable>
                    </View>
                  </View>
                );
              }}
            />
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  drawer: {
    width: 320,
    maxWidth: '86%',
    height: '100%',
    backgroundColor: '#18181B',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 24,
    shadowOffset: { width: 8, height: 0 },
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '600',
  },
  tabGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconBtnActive: {
    borderColor: 'rgba(52,211,153,0.40)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionSection: {
    padding: 16,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  emeraldActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: '#10B981',
  },
  emeraldActionBtnText: {
    color: '#09090B',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.45,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontSize: 13,
    paddingVertical: 4,
  },
  errorText: {
    paddingHorizontal: 16,
    paddingTop: 8,
    color: palette.danger,
    fontSize: 12,
  },
  maintenanceWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listContent: {
    padding: 8,
    gap: 4,
  },
  emptyWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: palette.textSubtle,
    fontSize: 14,
  },
  collectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  collectionTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowActive: {
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  convMainBtn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  convTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flagPairPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  flagArrow: {
    color: palette.textSubtle,
    fontSize: 10,
  },
  rowTitle: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 14,
    fontWeight: '500',
  },
  rowTitleActive: {
    color: palette.text,
  },
  rowMeta: {
    color: palette.textSubtle,
    fontSize: 12,
  },
  convActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.30)',
    backgroundColor: 'rgba(244,63,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
});
