import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import type { PhrasebookRow } from '../storage/phrasebook';
import { languageName, messageDirection } from '../chat/presentation';
import type { PhraseAudioRole } from './usePhrasebookAudioPlayback';

type Props = {
  phrase: PhrasebookRow;
  disabled: boolean;
  onPlay: (id: string, role: PhraseAudioRole) => void;
  isPlaying: (id: string, role: PhraseAudioRole) => boolean;
  isGenerating: (id: string, role: PhraseAudioRole) => boolean;
  onEdit: (phrase: PhrasebookRow) => void;
  onDelete: (id: string) => void;
};

export function PhraseCard({ phrase, disabled, onPlay, isPlaying, isGenerating, onEdit, onDelete }: Props) {
  return <View style={styles.card}>
    <Text style={styles.language}>{languageName(phrase.source_language)} phrase</Text>
    <Text selectable accessibilityLabel={`Phrase, ${languageName(phrase.source_language)}: ${phrase.original_text}`}
      style={[styles.text, messageDirection(phrase.source_language)]}>{phrase.original_text}</Text>
    {!!phrase.original_pronunciation && <Text selectable style={[styles.pronunciation, messageDirection(phrase.source_language)]}>{phrase.original_pronunciation}</Text>}
    {phrase.translated_text.trim() ? <>
      <Text style={styles.language}>{languageName(phrase.target_language)}</Text>
      <Text selectable accessibilityLabel={`Translation, ${languageName(phrase.target_language)}: ${phrase.translated_text}`}
        style={[styles.text, messageDirection(phrase.target_language)]}>{phrase.translated_text}</Text>
      {!!phrase.translated_pronunciation && <Text selectable style={[styles.pronunciation, messageDirection(phrase.target_language)]}>{phrase.translated_pronunciation}</Text>}
    </> : <Text style={styles.missing}>Add a translation when you edit this phrase.</Text>}
    <View style={styles.actions}>
      <ActionButton
        label={isPlaying(phrase.id, 'source') ? 'Stop phrase audio' : isGenerating(phrase.id, 'source') ? 'Generating speech...' : 'Play phrase'}
        tone="secondary" disabled={disabled || isGenerating(phrase.id, 'source')}
        onPress={() => onPlay(phrase.id, 'source')}
      />
      {!!phrase.translated_text.trim() && <ActionButton
        label={isPlaying(phrase.id, 'translated') ? 'Stop translation audio' : isGenerating(phrase.id, 'translated') ? 'Generating speech...' : 'Play translation'}
        tone="secondary" disabled={disabled || isGenerating(phrase.id, 'translated')}
        onPress={() => onPlay(phrase.id, 'translated')}
      />}
      <ActionButton label="Edit phrase" tone="secondary" disabled={disabled} onPress={() => onEdit(phrase)} />
      <ActionButton label="Delete phrase" tone="danger" disabled={disabled} onPress={() => onDelete(phrase.id)} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8, borderRadius: 12, backgroundColor: '#FFFFFF', borderStartWidth: 3, borderStartColor: '#285B48' },
  language: { color: '#48574F', fontSize: 14, fontWeight: '600' },
  text: { color: '#182A23', fontSize: 19 },
  pronunciation: { color: '#48574F', fontSize: 16 },
  missing: { color: '#7A5030', fontSize: 15 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
