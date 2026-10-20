import { StyleSheet, Text, View } from 'react-native';
import type { MessageRow } from '../storage/history';
import { ActionButton } from '../components/ActionButton';
import { languageName, messageDirection } from './presentation';

export type MessageCardProps = {
  message: MessageRow;
  disabled: boolean;
  onRetry: (id: string) => void;
  onPlaySource?: (id: string) => void;
  onPlayTranslated?: (id: string) => void;
  onSaveToPhrasebook?: (id: string) => void;
  isSavedInPhrasebook?: boolean;
  isSavingPhrase?: boolean;
  isPlayingSource?: boolean;
  isPlayingTranslated?: boolean;
  isGeneratingSpeech?: boolean;
  onStopPlayback?: () => void;
};

export function MessageCard({
  message,
  disabled,
  onRetry,
  onPlaySource,
  onPlayTranslated,
  onSaveToPhrasebook,
  isSavedInPhrasebook = false,
  isSavingPhrase = false,
  isPlayingSource = false,
  isPlayingTranslated = false,
  isGeneratingSpeech = false,
  onStopPlayback,
}: MessageCardProps) {
  const retryable = ['draft', 'failed', 'interrupted'].includes(message.status);
  const canPlaySource = message.input_kind === 'voice' && message.status !== 'pending';
  const canPlayTranslated = Boolean(message.translated_text?.trim()) && message.status === 'ready';
  const canSaveToPhrasebook = canPlayTranslated && Boolean(message.original_text.trim());

  return <View style={[styles.message, message.speaker === 'them' && styles.partner]}>
    <Text style={styles.note}>{message.speaker === 'me' ? 'You' : 'Partner'} · {message.origin_mode} · {new Date(message.created_at).toLocaleString()}</Text>
    <Text style={styles.note}>{languageName(message.source_language)} → {languageName(message.target_language)}</Text>
    {message.input_kind === 'voice' && !message.original_text && <Text style={styles.note}>Voice recording</Text>}
    <Text selectable accessibilityLabel={`Original, ${languageName(message.source_language)}: ${message.original_text}`}
      style={[styles.text, messageDirection(message.source_language)]}>{message.original_text}</Text>
    {!!message.original_pronunciation && <Text style={[styles.note, messageDirection(message.target_language)]}>{message.original_pronunciation}</Text>}
    {message.translated_text !== null && <Text selectable
      accessibilityLabel={`Translation, ${languageName(message.target_language)}: ${message.translated_text}`}
      style={[styles.text, messageDirection(message.target_language)]}>{message.translated_text}</Text>}
    {!!message.translated_pronunciation && <Text style={[styles.note, messageDirection(message.source_language)]}>{message.translated_pronunciation}</Text>}
    <Text accessibilityLiveRegion="polite" style={styles.note}>{message.input_kind === 'voice' && message.status === 'draft' ? 'Saved recording. Tap Retry to translate.' : message.status === 'pending' ? 'Translating...' : message.status === 'ready' ? 'Saved' : message.status === 'draft' ? 'Saved draft — tap Retry to translate' : message.error_message || 'Translation interrupted. Tap Retry.'}</Text>
    {retryable && <ActionButton label="Retry saved message" disabled={disabled} onPress={() => onRetry(message.id)} />}
    <View style={styles.audioActions}>
      {canPlaySource && onPlaySource && (
        <ActionButton
          label={isPlayingSource ? 'Stop original recording' : 'Play original recording'}
          disabled={disabled}
          tone="secondary"
          onPress={() => (isPlayingSource ? onStopPlayback?.() : onPlaySource(message.id))}
        />
      )}
      {canPlayTranslated && onPlayTranslated && (
        <ActionButton
          label={isPlayingTranslated ? 'Stop translated speech' : isGeneratingSpeech ? 'Generating speech...' : 'Play translated speech'}
          disabled={disabled || isGeneratingSpeech}
          tone="secondary"
          onPress={() => (isPlayingTranslated ? onStopPlayback?.() : onPlayTranslated(message.id))}
        />
      )}
      {canSaveToPhrasebook && onSaveToPhrasebook && (
        <ActionButton
          label={isSavedInPhrasebook ? 'Saved to Phrasebook' : isSavingPhrase ? 'Saving phrase...' : 'Save to Phrasebook'}
          disabled={disabled || isSavedInPhrasebook || isSavingPhrase}
          tone="secondary"
          onPress={() => onSaveToPhrasebook(message.id)}
        />
      )}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  message: { padding: 16, gap: 8, borderRadius: 12, backgroundColor: '#FFFFFF', borderStartWidth: 3, borderStartColor: '#285B48' },
  partner: { borderStartColor: '#856342' }, text: { color: '#182A23', fontSize: 18 }, note: { color: '#48574F', fontSize: 15 },
  audioActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
