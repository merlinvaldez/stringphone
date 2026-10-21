import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LANGUAGE_OPTIONS } from '../shared';
import { ActionButton } from './ActionButton';
import { languageName } from '../chat/presentation';
import { palette } from '../theme';

type Props = { label: string; value: string; disabled: boolean; compact?: boolean; onSelect: (code: string) => void };
export function LanguagePicker({ label, value, disabled, compact = false, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => setVisible(false);
  const currentLanguage = languageName(value);
  const flag = LANGUAGE_OPTIONS.find(option => option.code === value)?.flag ?? '🌐';
  return <View style={[styles.field, compact && styles.compactField]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${currentLanguage}`} accessibilityHint="Opens a searchable language list"
      accessibilityState={{ disabled }} disabled={disabled} onPress={() => { setQuery(''); setVisible(true); }}
      style={({ pressed }) => [styles.selector, compact && styles.compactSelector, disabled && styles.disabled, pressed && styles.pressed]}>
      <Text style={styles.flag}>{flag}</Text>
      <Text numberOfLines={1} style={styles.selectorText}>{compact ? currentLanguage : `${label}: ${currentLanguage}`}</Text>
    </Pressable>
    <Modal visible={visible} animationType="slide" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={styles.modal}>
        <Text accessibilityRole="header" style={styles.title}>{label}</Text>
        <TextInput autoFocus accessibilityLabel={`Search ${label.toLowerCase()}`} placeholder="Search languages"
          value={query} onChangeText={setQuery} autoCorrect={false} style={styles.search} />
        <FlatList data={LANGUAGE_OPTIONS.filter(option => option.englishName.toLowerCase().includes(query.trim().toLowerCase()))}
          keyboardShouldPersistTaps="handled" keyExtractor={option => option.code}
          ListEmptyComponent={<Text>No languages match your search.</Text>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityState={{ selected: item.code === value }}
            style={[styles.option, item.code === value && styles.selectedOption]} onPress={() => { close(); onSelect(item.code); }}>
            <Text style={styles.optionFlag}>{item.flag}</Text><Text style={styles.optionText}>{item.englishName}</Text>
          </Pressable>} />
        <ActionButton label="Close language list" tone="secondary" onPress={close} />
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 0 }, compactField: { flex: 1, minWidth: 0 },
  selector: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 11,
    borderWidth: 1, borderRadius: 22, borderColor: palette.border, backgroundColor: palette.surfaceSoft },
  compactSelector: { minHeight: 40, paddingHorizontal: 8 },
  selectorText: { flexShrink: 1, color: palette.text, fontSize: 13, fontWeight: '600' },
  flag: { fontSize: 15 },
  disabled: { opacity: 0.45 }, pressed: { backgroundColor: palette.surfacePressed },
  modal: { flex: 1, backgroundColor: palette.background, padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: palette.text },
  search: { minHeight: 48, fontSize: 16, padding: 12, borderWidth: 1, borderRadius: 16, borderColor: palette.border, backgroundColor: 'rgba(255,255,255,0.04)', color: palette.text },
  option: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12 },
  selectedOption: { backgroundColor: 'rgba(255,255,255,0.10)' }, optionFlag: { fontSize: 17 }, optionText: { color: palette.textMuted, fontSize: 15 },
});
