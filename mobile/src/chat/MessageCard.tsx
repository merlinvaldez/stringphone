import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MessageRow } from '../storage/history';
import { languageName, messageDirection } from './presentation';
import { palette } from '../theme';

export type MessageCardProps = {
  message: MessageRow;
  baseLanguageCode?: string;
  disabled: boolean;
  onRetry: (id: string) => void;
  onPlaySource?: (id: string, generateIfMissing?: boolean) => void;
  onPlayTranslated?: (id: string) => void;
  onSaveToPhrasebook?: (id: string) => void;
  isSavedInPhrasebook?: boolean;
  isSavingPhrase?: boolean;
  isPlayingSource?: boolean;
  isPlayingTranslated?: boolean;
  isGeneratingSourceSpeech?: boolean;
  isGeneratingSpeech?: boolean;
  onStopPlayback?: () => void;
};

function formatPronunciationGuide(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (normalized.startsWith('(') && normalized.endsWith(')')) return normalized;
  return `(${normalized})`;
}

export function MessageCard({
  message,
  baseLanguageCode,
  disabled,
  onRetry,
  onPlaySource,
  onPlayTranslated,
  onSaveToPhrasebook,
  isSavedInPhrasebook = false,
  isSavingPhrase = false,
  isPlayingSource = false,
  isPlayingTranslated = false,
  isGeneratingSourceSpeech = false,
  isGeneratingSpeech = false,
  onStopPlayback,
}: MessageCardProps) {
  const isSelf = message.speaker === 'me';
  const isLanguageOne = baseLanguageCode
    ? message.source_language === baseLanguageCode
    : isSelf;
  const retryable = ['draft', 'failed', 'interrupted'].includes(message.status);
  const originalText = message.original_text || (message.input_kind === 'voice' ? 'Voice recording' : '');
  const canPlaySourceVoice = message.input_kind === 'voice' && message.status !== 'pending';
  const canPlaySourceTts = message.input_kind === 'text' && Boolean(message.original_text.trim());
  const canPlaySource = (canPlaySourceVoice || canPlaySourceTts) && Boolean(onPlaySource);
  const canPlayTranslated = Boolean(message.translated_text?.trim()) && message.status === 'ready' && Boolean(onPlayTranslated);
  const canSaveToPhrasebook = Boolean(message.translated_text?.trim()) && Boolean(message.original_text.trim()) && message.status === 'ready' && Boolean(onSaveToPhrasebook);
  const originalPronunciation = formatPronunciationGuide(message.original_pronunciation);
  const translatedPronunciation = formatPronunciationGuide(message.translated_pronunciation);
  const showOriginalPronunciation =
    Boolean(originalPronunciation) && (!isSelf || message.source_language === 'zh');
  const showTranslatedPronunciation =
    Boolean(translatedPronunciation) && (isSelf || message.target_language === 'zh');

  const statusText = message.status === 'pending'
    ? 'Translating'
    : retryable
      ? 'Needs retry'
      : '';

  return (
    <View style={[styles.messageRow, isSelf && styles.selfRow]}>
      <View style={[styles.message, isLanguageOne ? styles.emeraldBubble : styles.skyBubble]}>
        <View style={styles.topline}>
          <Text style={styles.timestamp}>
            {new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          <View style={styles.topActions}>
            {canSaveToPhrasebook && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={isSavedInPhrasebook ? 'Saved to Phrasebook' : isSavingPhrase ? 'Saving phrase' : 'Save to Phrasebook'}
                disabled={disabled || isSavedInPhrasebook || isSavingPhrase}
                onPress={() => onSaveToPhrasebook?.(message.id)}
                style={[styles.bookmarkBtn, isSavedInPhrasebook && styles.bookmarkBtnSaved]}
              >
                {isSavingPhrase ? (
                  <ActivityIndicator size={11} color="#A7F3D0" />
                ) : (
                  <Feather
                    name={isSavedInPhrasebook ? 'check' : 'bookmark'}
                    size={13}
                    color={isSavedInPhrasebook ? '#A7F3D0' : palette.textMuted}
                  />
                )}
              </Pressable>
            )}
            {!!statusText && (
              <View style={[styles.statusBadge, retryable ? styles.statusFailed : styles.statusPending]}>
                <Text
                  accessibilityLiveRegion="polite"
                  accessibilityLabel={message.status === 'pending' ? 'Translating' : message.error_message || 'Translation needs attention'}
                  style={[styles.statusText, retryable ? styles.statusTextFailed : styles.statusTextPending]}
                >
                  {statusText}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionTextWrap}>
              <Text
                selectable
                accessibilityLabel={`Original, ${languageName(message.source_language)}: ${originalText}`}
                style={[styles.originalText, messageDirection(message.source_language)]}
              >
                {originalText}
              </Text>
              {showOriginalPronunciation && (
                <Text style={[styles.pronunciationText, messageDirection(message.target_language)]}>
                  {originalPronunciation}
                </Text>
              )}
            </View>
            {canPlaySource && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isPlayingSource
                    ? 'Stop original audio'
                    : canPlaySourceVoice
                      ? 'Play original recording'
                      : 'Play original text speech'
                }
                disabled={disabled || isGeneratingSourceSpeech}
                onPress={() => {
                  if (isPlayingSource) {
                    onStopPlayback?.();
                  } else {
                    onPlaySource?.(message.id, canPlaySourceTts);
                  }
                }}
                style={[styles.audioBtn, isPlayingSource && styles.audioBtnActive]}
              >
                {isGeneratingSourceSpeech ? (
                  <ActivityIndicator size={13} color={palette.text} />
                ) : (
                  <Feather
                    name={isPlayingSource ? 'square' : canPlaySourceVoice ? 'play' : 'volume-2'}
                    size={14}
                    color={isPlayingSource ? '#A7F3D0' : '#E4E4E7'}
                  />
                )}
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.translationBlock}>
          <View style={styles.sectionRow}>
            <View style={styles.sectionTextWrap}>
              <Text
                selectable
                accessibilityLabel={`Translation, ${languageName(message.target_language)}: ${message.translated_text || (message.status === 'pending' ? 'Translating...' : 'Translation failed.')}`}
                style={[styles.translatedText, messageDirection(message.target_language)]}
              >
                {message.translated_text || (message.status === 'pending' ? 'Translating...' : 'Translation failed.')}
              </Text>
              {showTranslatedPronunciation && (
                <Text style={[styles.pronunciationText, messageDirection(message.source_language)]}>
                  {translatedPronunciation}
                </Text>
              )}
            </View>
            {canPlayTranslated && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isPlayingTranslated
                    ? 'Stop translated speech'
                    : isGeneratingSpeech
                      ? 'Generating translated speech'
                      : 'Play translated speech'
                }
                disabled={disabled || isGeneratingSpeech}
                onPress={() => {
                  if (isPlayingTranslated) {
                    onStopPlayback?.();
                  } else {
                    onPlayTranslated?.(message.id);
                  }
                }}
                style={[styles.audioBtn, isPlayingTranslated && styles.audioBtnActive]}
              >
                {isGeneratingSpeech ? (
                  <ActivityIndicator size={13} color={palette.text} />
                ) : (
                  <Feather
                    name={isPlayingTranslated ? 'square' : 'volume-2'}
                    size={14}
                    color={isPlayingTranslated ? '#A7F3D0' : '#E4E4E7'}
                  />
                )}
              </Pressable>
            )}
          </View>
        </View>

        {retryable && (
          <View style={styles.errorBar}>
            <View style={styles.errorLabelRow}>
              <Feather name="alert-circle" size={13} color="#FDA4AF" />
              <Text style={styles.errorText} numberOfLines={2}>
                {message.error_message || 'Translation failed.'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry saved message"
              disabled={disabled}
              onPress={() => onRetry(message.id)}
              style={styles.retryPill}
            >
              <Feather name="refresh-cw" size={11} color="#FFE4E6" />
              <Text style={styles.retryPillText}>RETRY</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  selfRow: {
    justifyContent: 'flex-end',
  },
  message: {
    width: '86%',
    maxWidth: 440,
    padding: 16,
    borderRadius: 28,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  emeraldBubble: {
    backgroundColor: 'rgba(16,185,129,0.10)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
  skyBubble: {
    backgroundColor: 'rgba(14,165,233,0.10)',
    borderColor: 'rgba(14,165,233,0.25)',
  },
  topline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timestamp: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bookmarkBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkBtnSaved: {
    borderColor: 'rgba(52,211,153,0.30)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPending: {
    backgroundColor: 'rgba(245,158,11,0.20)',
  },
  statusFailed: {
    backgroundColor: 'rgba(244,63,94,0.20)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextPending: {
    color: '#FDE68A',
  },
  statusTextFailed: {
    color: '#FECDD3',
  },
  sectionBlock: {
    marginTop: 12,
  },
  translationBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  originalText: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
  },
  translatedText: {
    color: '#F4F4F5',
    fontSize: 15,
    lineHeight: 22,
  },
  pronunciationText: {
    marginTop: 4,
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 18,
  },
  audioBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioBtnActive: {
    borderColor: 'rgba(52,211,153,0.40)',
    backgroundColor: 'rgba(16,185,129,0.20)',
  },
  errorBar: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.20)',
    backgroundColor: 'rgba(244,63,94,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  errorLabelRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    flex: 1,
    color: '#FECDD3',
    fontSize: 12,
  },
  retryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.30)',
    backgroundColor: 'rgba(244,63,94,0.20)',
  },
  retryPillText: {
    color: '#FFE4E6',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
