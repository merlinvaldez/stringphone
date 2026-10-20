import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/ActionButton';
import { LanguagePicker } from '../components/LanguagePicker';
import { messageDirection } from '../chat/presentation';
import type { PhrasebookInput, PhrasebookRow } from '../storage/phrasebook';

type Props = {
  visible: boolean;
  phrase: PhrasebookRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: PhrasebookInput) => void;
};

export function PhraseEditorModal({ visible, phrase, busy, onClose, onSubmit }: Props) {
  const [sourceLanguage, setSourceLanguage] = useState(() => phrase?.source_language ?? 'en');
  const [targetLanguage, setTargetLanguage] = useState(() => phrase?.target_language ?? 'es');
  const [originalText, setOriginalText] = useState(() => phrase?.original_text ?? '');
  const [translatedText, setTranslatedText] = useState(() => phrase?.translated_text ?? '');
  const [originalPronunciation, setOriginalPronunciation] = useState(() => phrase?.original_pronunciation ?? '');
  const [translatedPronunciation, setTranslatedPronunciation] = useState(() => phrase?.translated_pronunciation ?? '');

  function submit() {
    onSubmit({
      source_language: sourceLanguage,
      target_language: targetLanguage,
      original_text: originalText,
      translated_text: translatedText,
      original_pronunciation: originalPronunciation,
      translated_pronunciation: translatedPronunciation,
    });
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text accessibilityRole="header" style={styles.title}>{phrase ? 'Edit phrase' : 'Add a phrase'}</Text>
          <Text style={styles.note}>Phrase text is stored on this phone. Speech can be generated when you are online.</Text>
          <View style={styles.languages}>
            <LanguagePicker label="Phrase language" value={sourceLanguage} disabled={busy} onSelect={setSourceLanguage} />
            <LanguagePicker label="Translation language" value={targetLanguage} disabled={busy} onSelect={setTargetLanguage} />
          </View>
          <TextInput accessibilityLabel="Phrase text" placeholder="Phrase" value={originalText} onChangeText={setOriginalText}
            multiline textAlignVertical="top" maxLength={5000} style={[styles.input, messageDirection(sourceLanguage)]} />
          <TextInput accessibilityLabel="Phrase pronunciation" placeholder="Pronunciation (optional)" value={originalPronunciation}
            onChangeText={setOriginalPronunciation} multiline textAlignVertical="top" maxLength={5000} style={[styles.input, messageDirection(sourceLanguage)]} />
          <TextInput accessibilityLabel="Phrase translation" placeholder="Translation (optional)" value={translatedText} onChangeText={setTranslatedText}
            multiline textAlignVertical="top" maxLength={5000} style={[styles.input, messageDirection(targetLanguage)]} />
          <TextInput accessibilityLabel="Translation pronunciation" placeholder="Translation pronunciation (optional)" value={translatedPronunciation}
            onChangeText={setTranslatedPronunciation} multiline textAlignVertical="top" maxLength={5000} style={[styles.input, messageDirection(targetLanguage)]} />
        </ScrollView>
        <View style={styles.actions}>
          <ActionButton label="Cancel" tone="secondary" disabled={busy} onPress={onClose} />
          <ActionButton label={busy ? 'Saving...' : 'Save phrase'} disabled={busy || !originalText.trim()} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2' },
  content: { padding: 20, gap: 14 },
  title: { color: '#182A23', fontSize: 28, fontWeight: '700' },
  note: { color: '#48574F', fontSize: 15 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 },
  input: { minHeight: 50, maxHeight: 130, borderWidth: 1, borderColor: '#66736C', borderRadius: 10, padding: 12, fontSize: 17, color: '#182A23', backgroundColor: '#FFF' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#DEE5DF' },
});
