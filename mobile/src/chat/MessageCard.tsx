import { StyleSheet, Text, View } from 'react-native';
import type { MessageRow } from '../storage/history';
import { ActionButton } from '../components/ActionButton';
import { languageName, messageDirection } from './presentation';

export function MessageCard({ message, disabled, onRetry }: { message: MessageRow; disabled: boolean; onRetry: (id: string) => void }) {
  const retryable = message.input_kind === 'text' && ['draft', 'failed', 'interrupted'].includes(message.status);
  return <View style={[styles.message, message.speaker === 'them' && styles.partner]}>
    <Text style={styles.note}>{message.speaker === 'me' ? 'You' : 'Partner'} · {message.origin_mode} · {new Date(message.created_at).toLocaleString()}</Text>
    <Text style={styles.note}>{languageName(message.source_language)} → {languageName(message.target_language)}</Text>
    <Text selectable accessibilityLabel={`Original, ${languageName(message.source_language)}: ${message.original_text}`}
      style={[styles.text, messageDirection(message.source_language)]}>{message.original_text}</Text>
    {!!message.original_pronunciation && <Text style={[styles.note, messageDirection(message.target_language)]}>{message.original_pronunciation}</Text>}
    {message.translated_text !== null && <Text selectable
      accessibilityLabel={`Translation, ${languageName(message.target_language)}: ${message.translated_text}`}
      style={[styles.text, messageDirection(message.target_language)]}>{message.translated_text}</Text>}
    {!!message.translated_pronunciation && <Text style={[styles.note, messageDirection(message.source_language)]}>{message.translated_pronunciation}</Text>}
    <Text accessibilityLiveRegion="polite" style={styles.note}>{message.status === 'pending' ? 'Translating...' : message.status === 'ready' ? 'Saved' : message.status === 'draft' ? 'Saved draft — tap Retry to translate' : message.error_message || 'Translation interrupted. Tap Retry.'}</Text>
    {retryable && <ActionButton label="Retry saved message" disabled={disabled} onPress={() => onRetry(message.id)} />}
  </View>;
}
const styles = StyleSheet.create({
  message: { padding: 16, gap: 8, borderRadius: 12, backgroundColor: '#FFFFFF', borderStartWidth: 3, borderStartColor: '#285B48' },
  partner: { borderStartColor: '#856342' }, text: { color: '#182A23', fontSize: 18 }, note: { color: '#48574F', fontSize: 15 },
});
