import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LanguageFlag, MOBILE_LANGUAGE_CATALOG, getNativeLanguageName } from './LanguageFlag';
import { languageName } from '../chat/presentation';
import { palette } from '../theme';

type Props = {
  label: string;
  value: string;
  disabled: boolean;
  compact?: boolean;
  onSelect: (code: string) => void;
};

export function LanguagePicker({ label, value, disabled, compact = false, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => setVisible(false);

  const selectedOption = useMemo(
    () =>
      MOBILE_LANGUAGE_CATALOG.find(option => option.code === value) ?? {
        code: value,
        englishName: languageName(value),
        name: getNativeLanguageName(value),
        flag: value.slice(0, 2).toUpperCase(),
      },
    [value],
  );

  const filteredLanguages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return MOBILE_LANGUAGE_CATALOG;
    return MOBILE_LANGUAGE_CATALOG.filter(option =>
      [option.code, option.name, option.englishName].some(item => item.toLowerCase().includes(normalized)),
    );
  }, [query]);

  return (
    <View style={[styles.field, compact && styles.compactField]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedOption.englishName}`}
        accessibilityHint="Opens a searchable language list"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => {
          setQuery('');
          setVisible(true);
        }}
        style={({ pressed }) => [
          styles.selector,
          compact && styles.compactSelector,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <LanguageFlag countryCode={selectedOption.flag} size="md" />
        <Text numberOfLines={1} style={styles.selectorText}>
          {selectedOption.name}
        </Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
        supportedOrientations={['portrait', 'landscape']}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <Pressable style={styles.dropdown} onPress={event => event.stopPropagation()}>
            <View style={styles.searchWrap}>
              <View style={styles.searchBar}>
                <Feather name="search" size={14} color={palette.textSubtle} />
                <TextInput
                  autoFocus
                  accessibilityLabel={`Search ${label.toLowerCase()}`}
                  placeholder="Search languages"
                  placeholderTextColor={palette.textSubtle}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  style={styles.searchInput}
                />
                {!!query && (
                  <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')}>
                    <Feather name="x" size={14} color={palette.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>

            <FlatList
              data={filteredLanguages}
              keyboardShouldPersistTaps="handled"
              keyExtractor={option => option.code}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<Text style={styles.empty}>No languages match your search.</Text>}
              renderItem={({ item }) => {
                const isSelected = item.code === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${item.englishName} (${item.name})`}
                    accessibilityState={{ selected: isSelected }}
                    style={({ pressed }) => [
                      styles.option,
                      isSelected && styles.selectedOption,
                      pressed && !isSelected && styles.pressedOption,
                    ]}
                    onPress={() => {
                      close();
                      onSelect(item.code);
                    }}
                  >
                    <LanguageFlag countryCode={item.flag} size="md" />
                    <Text numberOfLines={1} style={[styles.optionText, isSelected && styles.selectedOptionText]}>
                      {item.name}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0 },
  compactField: { flex: 1, minWidth: 108 },
  selector: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 999,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  compactSelector: {
    minHeight: 38,
    paddingHorizontal: 12,
  },
  selectorText: {
    flexShrink: 1,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  disabled: { opacity: 0.4 },
  pressed: { backgroundColor: palette.surfacePressed },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dropdown: {
    width: '100%',
    maxWidth: 280,
    maxHeight: '64%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(24,24,27,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
    overflow: 'hidden',
  },
  searchWrap: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    padding: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    paddingHorizontal: 12,
    height: 38,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: 6,
    gap: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedOption: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  pressedOption: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  optionText: {
    flex: 1,
    color: palette.textMuted,
    fontSize: 14,
  },
  selectedOptionText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  empty: {
    color: palette.textSubtle,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 18,
  },
});
