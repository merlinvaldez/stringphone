import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconButton } from '../components/IconButton';
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
  const [isFlipped, setIsFlipped] = useState(false);
  const role: PhraseAudioRole = isFlipped ? 'translated' : 'source';
  const language = isFlipped ? phrase.target_language : phrase.source_language;
  const text = isFlipped ? phrase.translated_text : phrase.original_text;
  const pronunciation = (isFlipped ? phrase.translated_pronunciation : phrase.original_pronunciation) ?? '';
  const hasText = Boolean(text.trim());
  const playing = isPlaying(phrase.id, role);
  const generating = isGenerating(phrase.id, role);

  return <View style={styles.card}>
    <View style={styles.cardTopline}>
      <Text style={styles.pair}>{languageName(phrase.source_language)} → {languageName(phrase.target_language)}</Text>
      <IconButton name="edit-2" accessibilityLabel="Edit phrase" disabled={disabled} onPress={() => onEdit(phrase)} size={15} />
      <IconButton name="trash-2" accessibilityLabel="Delete phrase" disabled={disabled} onPress={() => onDelete(phrase.id)} tone="danger" size={15} />
    </View>
    <View style={[styles.face, isFlipped ? styles.back : styles.front]}>
      <Text style={[styles.sideLabel, isFlipped ? styles.backLabel : undefined]}>{isFlipped ? languageName(phrase.target_language) : languageName(phrase.source_language)}</Text>
      <Text selectable accessibilityRole="header" accessibilityLabel={`${isFlipped ? 'Translation' : 'Phrase'}, ${languageName(language)}: ${text}`}
        style={[styles.text, messageDirection(language), !hasText && styles.missing]}>
        {hasText ? text : 'Add a translation when you edit this phrase.'}
      </Text>
      {!!pronunciation.trim() && <Text selectable style={[styles.pronunciation, isFlipped ? styles.backPronunciation : undefined, messageDirection(language)]}>{pronunciation}</Text>}
      <Text style={[styles.flipHint, isFlipped ? styles.backLabel : undefined]}>Tap to flip</Text>
    </View>
    <View style={styles.actions}>
      <IconButton name={playing ? 'square' : generating ? 'loader' : 'volume-2'}
        accessibilityLabel={playing ? `Stop ${isFlipped ? 'translation' : 'phrase'} audio` : generating ? 'Generating speech' : `Play ${isFlipped ? 'translation' : 'phrase'}`}
        disabled={disabled || generating || !hasText} active={playing} onPress={() => onPlay(phrase.id, role)} size={16} />
      <Text style={styles.tapLabel}>{isFlipped ? 'Play translation' : 'Play phrase'}</Text>
      <View style={styles.actionSpacer} />
      <IconButton name="repeat" accessibilityLabel={isFlipped ? 'Show phrase' : 'Show translation'} disabled={disabled}
        active={isFlipped} onPress={() => setIsFlipped(current => !current)} size={15} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 12, borderRadius: 30, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(24,24,27,0.72)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  cardTopline: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  pair: { flex: 1, color: '#A1A1AA', fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  face: { minHeight: 190, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 20, borderRadius: 26, borderWidth: 1, overflow: 'hidden' },
  front: { backgroundColor: '#052E1B', borderColor: 'rgba(52,211,153,0.22)' },
  back: { backgroundColor: '#082F49', borderColor: 'rgba(56,189,248,0.24)' },
  sideLabel: { color: 'rgba(167,243,208,0.82)', fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  backLabel: { color: 'rgba(186,230,253,0.85)' },
  text: { maxWidth: '100%', color: '#FFFFFF', fontSize: 26, fontWeight: '600', lineHeight: 34, textAlign: 'center' },
  missing: { color: '#D4D4D8', fontSize: 15, fontWeight: '400', lineHeight: 23 },
  pronunciation: { color: 'rgba(167,243,208,0.82)', fontSize: 14, textAlign: 'center' },
  backPronunciation: { color: 'rgba(186,230,253,0.85)' },
  flipHint: { color: 'rgba(167,243,208,0.56)', fontSize: 11, letterSpacing: 0.6, marginTop: 8 },
  actions: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2 },
  tapLabel: { color: '#A1A1AA', fontSize: 12, fontWeight: '600' },
  actionSpacer: { flex: 1 },
});
