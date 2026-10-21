import { StyleSheet, Text, View } from 'react-native';
import type { MessageRow } from '../storage/history';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { languageName, messageDirection } from './presentation';
import { palette } from '../theme';

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

  return <View style={[styles.messageRow, message.speaker === 'me' && styles.selfRow]}>
    <View style={[styles.message, message.speaker === 'me' ? styles.self : styles.partner]}>
      <View style={styles.topline}>
        <Text style={styles.timestamp}>{new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
        <View style={styles.topActions}>
          {message.status !== 'ready' && <Text accessibilityLiveRegion="polite" accessibilityLabel={message.status === 'pending' ? 'Translating' : message.error_message || 'Translation needs attention'}
            style={[styles.status, message.status === 'failed' || message.status === 'interrupted' ? styles.failed : undefined]}>
            {message.status === 'pending' ? 'Translating' : message.status === 'failed' || message.status === 'interrupted' ? 'Retry needed' : 'Saved draft'}
          </Text>}
          {canSaveToPhrasebook && onSaveToPhrasebook && <IconButton name={isSavedInPhrasebook ? 'check' : 'bookmark'}
            accessibilityLabel={isSavedInPhrasebook ? 'Saved to Phrasebook' : isSavingPhrase ? 'Saving phrase' : 'Save to Phrasebook'}
            disabled={disabled || isSavedInPhrasebook || isSavingPhrase} active={isSavedInPhrasebook} onPress={() => onSaveToPhrasebook(message.id)} size={15} />}
        </View>
      </View>
      <Text style={styles.languagePair}>{languageName(message.source_language)} → {languageName(message.target_language)}</Text>
      {message.input_kind === 'voice' && !message.original_text && <Text style={styles.note}>Voice recording</Text>}
      <Text selectable accessibilityLabel={`Original, ${languageName(message.source_language)}: ${message.original_text}`}
        style={[styles.text, messageDirection(message.source_language)]}>{message.original_text}</Text>
      {!!message.original_pronunciation && <Text style={[styles.pronunciation, messageDirection(message.target_language)]}>{message.original_pronunciation}</Text>}
      {message.translated_text !== null && <View style={styles.translationBlock}>
        <Text selectable accessibilityLabel={`Translation, ${languageName(message.target_language)}: ${message.translated_text}`}
          style={[styles.translatedText, messageDirection(message.target_language)]}>{message.translated_text}</Text>
        {!!message.translated_pronunciation && <Text style={[styles.translationPronunciation, messageDirection(message.source_language)]}>{message.translated_pronunciation}</Text>}
      </View>}
      {message.status === 'failed' || message.status === 'interrupted' || retryable && message.status === 'draft'
        ? <ActionButton label="Retry saved message" disabled={disabled} onPress={() => onRetry(message.id)} /> : null}
      <View style={styles.audioActions}>
      {canPlaySource && onPlaySource && (
        <IconButton name={isPlayingSource ? 'square' : 'play'} accessibilityLabel={isPlayingSource ? 'Stop original recording' : 'Play original recording'}
          disabled={disabled} active={isPlayingSource} onPress={() => (isPlayingSource ? onStopPlayback?.() : onPlaySource(message.id))} size={15} />
      )}
      {canPlayTranslated && onPlayTranslated && (
        <IconButton name={isPlayingTranslated ? 'square' : isGeneratingSpeech ? 'loader' : 'volume-2'}
          accessibilityLabel={isPlayingTranslated ? 'Stop translated speech' : isGeneratingSpeech ? 'Generating translated speech' : 'Play translated speech'}
          disabled={disabled || isGeneratingSpeech} active={isPlayingTranslated} onPress={() => (isPlayingTranslated ? onStopPlayback?.() : onPlayTranslated(message.id))} size={15} />
      )}
      </View>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  messageRow: { width: '100%', flexDirection: 'row', justifyContent: 'flex-start' },
  selfRow: { justifyContent: 'flex-end' },
  message: { width: '88%', maxWidth: 440, padding: 14, gap: 8, borderRadius: 28, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.26, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  self: { backgroundColor: palette.emeraldTint, borderColor: 'rgba(16,185,129,0.25)' },
  partner: { backgroundColor: palette.skyTint, borderColor: 'rgba(14,165,233,0.25)' },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  timestamp: { color: palette.textSubtle, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  status: { color: palette.amber, fontSize: 10, fontWeight: '600' },
  failed: { color: palette.danger },
  languagePair: { color: palette.textSubtle, fontSize: 11, fontWeight: '600' },
  text: { color: palette.text, fontSize: 15, lineHeight: 22 },
  translatedText: { color: '#E4E4E7', fontSize: 15, lineHeight: 22 },
  pronunciation: { color: '#D4D4D8', fontSize: 13, lineHeight: 19 },
  translationPronunciation: { color: palette.textSubtle, fontSize: 12, lineHeight: 18 },
  translationBlock: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)', paddingTop: 10, gap: 5 },
  note: { color: palette.textMuted, fontSize: 13 },
  audioActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 2 },
});
