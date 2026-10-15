import { useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LANGUAGE_OPTIONS } from '../shared';
import { ActionButton } from './ActionButton';
import { languageName } from '../chat/presentation';

type Props = { label: string; value: string; disabled: boolean; onSelect: (code: string) => void };
export function LanguagePicker({ label, value, disabled, onSelect }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const close = () => setVisible(false);
  return <View style={styles.field}>
    <ActionButton label={`${label}: ${languageName(value)}`} disabled={disabled} tone="secondary"
      hint="Opens a searchable language list" onPress={() => { setQuery(''); setVisible(true); }} />
    <Modal visible={visible} animationType="slide" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <SafeAreaView style={styles.modal}>
        <Text accessibilityRole="header" style={styles.title}>{label}</Text>
        <TextInput autoFocus accessibilityLabel={`Search ${label.toLowerCase()}`} placeholder="Search languages"
          value={query} onChangeText={setQuery} autoCorrect={false} style={styles.search} />
        <FlatList data={LANGUAGE_OPTIONS.filter(option => option.englishName.toLowerCase().includes(query.trim().toLowerCase()))}
          keyboardShouldPersistTaps="handled" keyExtractor={option => option.code}
          ListEmptyComponent={<Text>No languages match your search.</Text>}
          renderItem={({ item }) => <View style={styles.option}>
            <ActionButton label={item.englishName} disabled={disabled} selected={item.code === value} tone={item.code === value ? 'primary' : 'secondary'} onPress={() => { close(); onSelect(item.code); }} />
          </View>} />
        <ActionButton label="Close language list" onPress={close} />
      </SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 140 }, modal: { flex: 1, backgroundColor: '#F8F7F2', padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '700', color: '#182A23' },
  search: { minHeight: 48, fontSize: 18, padding: 12, borderWidth: 1, borderRadius: 10, borderColor: '#66736C', backgroundColor: '#FFF', color: '#182A23' },
  option: { paddingVertical: 6 },
});
