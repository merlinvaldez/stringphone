import { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getNativeLanguageName } from '../components/LanguageFlag';
import type { MessageRow } from '../storage/history';
import { messageDirection } from './presentation';
import { palette } from '../theme';

export type PlaybackMode = 'original' | 'translated' | 'both';

export type TranscriptCardProps = {
  message: MessageRow;
  isActive?: boolean;
  playbackMode?: PlaybackMode | ((msg: MessageRow) => PlaybackMode);
  viewerLanguageCode?: string;
  disabled?: boolean;
  onPlaySource?: (id: string, generateIfMissing?: boolean) => void;
  onPlayTranslated?: (id: string) => void;
  onStopPlayback?: () => void;
  onSaveToPhrasebook?: (id: string) => void;
  isSavedInPhrasebook?: boolean;
  isSavingPhrase?: boolean;
  isPlayingSource?: boolean;
  isPlayingTranslated?: boolean;
  isGeneratingSourceSpeech?: boolean;
  isGeneratingSpeech?: boolean;
  compact?: boolean;
};

function formatPronunciationGuide(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) return '';
  if (normalized.startsWith('(') && normalized.endsWith(')')) return normalized;
  return `(${normalized})`;
}

export function TranscriptCard({
  message,
  isActive = true,
  playbackMode = 'both',
  viewerLanguageCode,
  disabled = false,
  onPlaySource,
  onPlayTranslated,
  onStopPlayback,
  onSaveToPhrasebook,
  isSavedInPhrasebook = false,
  isSavingPhrase = false,
  isPlayingSource = false,
  isPlayingTranslated = false,
  isGeneratingSourceSpeech = false,
  isGeneratingSpeech = false,
  compact = false,
}: TranscriptCardProps) {
  const resolvedMode = typeof playbackMode === 'function' ? playbackMode(message) : playbackMode;
  const showSourcePlayer =
    (resolvedMode === 'original' || resolvedMode === 'both') &&
    message.input_kind === 'voice' &&
    message.status !== 'pending' &&
    Boolean(onPlaySource);
  const showTranslationPlayer =
    (resolvedMode === 'translated' || resolvedMode === 'both') &&
    Boolean(message.translated_text?.trim()) &&
    message.status === 'ready' &&
    Boolean(onPlayTranslated);
  const canSaveToPhrasebook =
    Boolean(message.translated_text?.trim()) &&
    Boolean(message.original_text.trim()) &&
    message.status === 'ready' &&
    Boolean(onSaveToPhrasebook);

  const sourceLanguageLabel = getNativeLanguageName(message.source_language);
  const targetLanguageLabel = getNativeLanguageName(message.target_language);

  const sourceLine = {
    label: sourceLanguageLabel,
    languageCode: message.source_language,
    text: message.original_text,
    pronunciation: formatPronunciationGuide(message.original_pronunciation),
  };
  const translatedLine = {
    label: targetLanguageLabel,
    languageCode: message.target_language,
    text: message.translated_text || (message.status === 'pending' ? 'Translating...' : ''),
    pronunciation: formatPronunciationGuide(message.translated_pronunciation),
  };

  const [primaryLine, secondaryLine] = viewerLanguageCode
    ? message.source_language === viewerLanguageCode
      ? [sourceLine, translatedLine]
      : [translatedLine, sourceLine]
    : [translatedLine, sourceLine];

  return (
    <View style={[styles.cardWrap, !isActive && styles.cardInactive]}>
      <View style={styles.headerRow}>
        <Feather
          name="phone"
          size={11}
          color={isActive ? '#34D399' : '#FBBF24'}
        />
        <Text style={styles.headerLabel}>{primaryLine.label}</Text>
      </View>

      {!!primaryLine.text && (
        <Text
          selectable
          style={[
            styles.primaryText,
            compact && styles.primaryTextCompact,
            messageDirection(primaryLine.languageCode),
          ]}
        >
          {`"${primaryLine.text}"`}
        </Text>
      )}
      {!!primaryLine.pronunciation && (
        <Text selectable style={styles.primaryPronunciationText}>
          {primaryLine.pronunciation}
        </Text>
      )}

      {!!secondaryLine.text && (
        <Text
          selectable
          style={[
            styles.secondaryText,
            compact && styles.secondaryTextCompact,
            messageDirection(secondaryLine.languageCode),
          ]}
        >
          {`"${secondaryLine.text}"`}
        </Text>
      )}
      {!!secondaryLine.pronunciation && (
        <Text selectable style={styles.secondaryPronunciationText}>
          {secondaryLine.pronunciation}
        </Text>
      )}

      {(showSourcePlayer || showTranslationPlayer || canSaveToPhrasebook) && (
        <View style={styles.controlsRow}>
          {showSourcePlayer && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isPlayingSource
                  ? `Stop ${sourceLanguageLabel} voice recording`
                  : `Play ${sourceLanguageLabel} voice recording`
              }
              disabled={disabled || isGeneratingSourceSpeech}
              onPress={() => {
                if (isPlayingSource) {
                  onStopPlayback?.();
                } else {
                  onPlaySource?.(message.id, false);
                }
              }}
              style={[styles.audioBtn, isPlayingSource && styles.audioBtnActive]}
            >
              {isGeneratingSourceSpeech ? (
                <ActivityIndicator size={13} color="#E4E4E7" />
              ) : (
                <Feather
                  name={isPlayingSource ? 'square' : 'play'}
                  size={14}
                  color={isPlayingSource ? '#A7F3D0' : '#E4E4E7'}
                />
              )}
            </Pressable>
          )}

          {showTranslationPlayer && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isPlayingTranslated
                  ? `Stop ${targetLanguageLabel} translation`
                  : `Play ${targetLanguageLabel} translation`
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

          {canSaveToPhrasebook && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isSavedInPhrasebook ? 'Saved to Phrasebook' : 'Save to Phrasebook'
              }
              disabled={disabled || isSavedInPhrasebook || isSavingPhrase}
              onPress={() => onSaveToPhrasebook?.(message.id)}
              style={[styles.audioBtn, isSavedInPhrasebook && styles.audioBtnActive]}
            >
              {isSavingPhrase ? (
                <ActivityIndicator size={12} color="#A7F3D0" />
              ) : (
                <Feather
                  name={isSavedInPhrasebook ? 'check' : 'bookmark'}
                  size={13}
                  color={isSavedInPhrasebook ? '#A7F3D0' : palette.textMuted}
                />
              )}
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

export function TranscriptCarousel({
  history,
  playbackMode = 'both',
  viewerLanguageCode,
  disabled = false,
  onPlaySource,
  onPlayTranslated,
  onStopPlayback,
  onSaveToPhrasebook,
  isSavedInPhrasebook,
  isSavingPhrase,
  activeAudio,
  generatingId,
  generatingSourceId,
  compact = false,
}: {
  history: MessageRow[];
  playbackMode?: PlaybackMode | ((msg: MessageRow) => PlaybackMode);
  viewerLanguageCode?: string;
  disabled?: boolean;
  onPlaySource?: (id: string, generateIfMissing?: boolean) => void;
  onPlayTranslated?: (id: string) => void;
  onStopPlayback?: () => void;
  onSaveToPhrasebook?: (id: string) => void;
  isSavedInPhrasebook?: (id: string) => boolean;
  isSavingPhrase?: (id: string) => boolean;
  activeAudio?: { messageId: string; role: 'source' | 'translated' } | null;
  generatingId?: string | null;
  generatingSourceId?: string | null;
  compact?: boolean;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const latestItem = history[history.length - 1];

  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [history.length, latestItem?.id, latestItem?.original_text, latestItem?.translated_text]);

  if (!history || history.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.carouselScroll}
      contentContainerStyle={[
        styles.carouselContent,
        compact && styles.carouselContentCompact,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {history.map((msg, index) => {
        const isLatest = index === history.length - 1;
        return (
          <TranscriptCard
            key={msg.id}
            message={msg}
            isActive={isLatest}
            playbackMode={playbackMode}
            viewerLanguageCode={viewerLanguageCode}
            disabled={disabled}
            onPlaySource={onPlaySource}
            onPlayTranslated={onPlayTranslated}
            onStopPlayback={onStopPlayback}
            onSaveToPhrasebook={onSaveToPhrasebook}
            isSavedInPhrasebook={isSavedInPhrasebook?.(msg.id)}
            isSavingPhrase={isSavingPhrase?.(msg.id)}
            isPlayingSource={activeAudio?.messageId === msg.id && activeAudio.role === 'source'}
            isPlayingTranslated={
              activeAudio?.messageId === msg.id && activeAudio.role === 'translated'
            }
            isGeneratingSourceSpeech={generatingSourceId === msg.id}
            isGeneratingSpeech={generatingId === msg.id}
            compact={compact}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  carouselScroll: {
    width: '100%',
    maxWidth: 460,
    flex: 1,
  },
  carouselContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 20,
  },
  carouselContentCompact: {
    paddingVertical: 8,
    gap: 12,
  },
  cardWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  cardInactive: {
    opacity: 0.48,
    transform: [{ scale: 0.96 }],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  headerLabel: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  primaryText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '500',
    lineHeight: 28,
    textAlign: 'center',
  },
  primaryTextCompact: {
    fontSize: 17,
    lineHeight: 23,
  },
  secondaryText: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 2,
  },
  secondaryTextCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  primaryPronunciationText: {
    color: 'rgba(167,243,208,0.85)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  secondaryPronunciationText: {
    color: palette.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  audioBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
});

