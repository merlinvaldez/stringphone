import { getSupportedTtsLanguage } from '../../shared/languages.ts';

const RTL_WRITING_SYSTEMS = new Set(['arabic', 'hebrew']);
const RTL_LANGUAGE_CODES = new Set(['ar', 'he', 'fa', 'ur', 'yi']);

/**
 * Checks whether a language code uses a right-to-left writing system.
 * @param {string} [languageCode]
 * @returns {boolean}
 */
export function isRtlLanguage(languageCode) {
  if (!languageCode || typeof languageCode !== 'string') {
    return false;
  }
  const cleanCode = languageCode.trim().toLowerCase();
  const baseCode = cleanCode.split('-')[0];
  if (RTL_LANGUAGE_CODES.has(cleanCode) || RTL_LANGUAGE_CODES.has(baseCode)) {
    return true;
  }
  const entry = getSupportedTtsLanguage(cleanCode);
  return entry ? RTL_WRITING_SYSTEMS.has(entry.writingSystem) : false;
}

/**
 * Returns HTML direction attributes (dir and Tailwind text alignment className) for a language code.
 * @param {string} [languageCode]
 * @returns {{ dir: 'rtl' | 'ltr', className: 'text-right' | 'text-left' }}
 */
export function getTextDirectionAttrs(languageCode) {
  const rtl = isRtlLanguage(languageCode);
  return {
    dir: rtl ? 'rtl' : 'ltr',
    className: rtl ? 'text-right' : 'text-left',
  };
}

/**
 * Computes control flags for TranscriptCard playback and phrasebook saving.
 * Omits source-voice playback for typed text messages, keeps translated TTS enabled for ready turns,
 * and enables phrasebook save when status is ready and both texts are non-empty.
 *
 * @param {object} message
 * @param {'both' | 'original' | 'translated' | ((msg: object) => 'both' | 'original' | 'translated')} [playbackMode='both']
 * @param {boolean} [hasSaveHandler=false]
 * @returns {{ showSourcePlayer: boolean, showTranslationPlayer: boolean, canSaveToPhrasebook: boolean }}
 */
export function getTranscriptCardControlFlags(message, playbackMode = 'both', hasSaveHandler = false) {
  if (!message) {
    return {
      showSourcePlayer: false,
      showTranslationPlayer: false,
      canSaveToPhrasebook: false,
    };
  }

  const resolvedMode = typeof playbackMode === 'function' ? playbackMode(message) : playbackMode;
  const kind =
    message.kind ??
    message.input_kind ??
    (message.audioUrl || message.sourceAudioId ? 'voice' : 'text');
  const isVoice = kind === 'voice';
  const status = message.status ?? 'ready';
  const isReady = status === 'ready';
  const isPending = status === 'pending';

  const originalText = (
    message.originalText ??
    message.original_text ??
    message.transcript ??
    ''
  ).trim();
  const translatedText = (
    message.translatedText ??
    message.translated_text ??
    ''
  ).trim();

  const shouldPlayOriginal = resolvedMode === 'original' || resolvedMode === 'both';
  const shouldPlayTranslated = resolvedMode === 'translated' || resolvedMode === 'both';

  const hasAudioSource = Boolean(
    message.audioUrl || message.sourceAudioId || message.hasAudio,
  );
  const showSourcePlayer = shouldPlayOriginal && isVoice && !isPending && hasAudioSource;
  const showTranslationPlayer = shouldPlayTranslated && Boolean(translatedText) && isReady;
  const canSaveToPhrasebook =
    Boolean(hasSaveHandler) && isReady && Boolean(originalText) && Boolean(translatedText);

  return {
    showSourcePlayer,
    showTranslationPlayer,
    canSaveToPhrasebook,
  };
}

/**
 * Formats conversation history row metadata with mode tags (' · Single', ' · Conversation').
 *
 * @param {object} conversation
 * @param {string} [baseText] Optional pre-formatted date/time text.
 * @returns {string}
 */
export function formatHistoryRowMeta(conversation, baseText) {
  if (!conversation) {
    return baseText || '';
  }

  const mode = conversation.originMode ?? conversation.origin_mode ?? 'chat';
  const suffix =
    mode === 'single'
      ? ' · Single'
      : mode === 'conversation'
        ? ' · Conversation'
        : '';

  const rawDate =
    baseText !== undefined
      ? baseText
      : conversation.createdAt ??
        conversation.created_at ??
        conversation.updatedAt ??
        conversation.updated_at;

  if (baseText !== undefined) {
    return `${baseText}${suffix}`;
  }

  if (!rawDate) {
    return suffix;
  }

  const dateStr =
    typeof rawDate === 'string' && isNaN(Date.parse(rawDate))
      ? rawDate
      : new Date(rawDate).toLocaleDateString();

  return `${dateStr}${suffix}`;
}

/**
 * Returns all non-draft messages (including typed Chat text messages and voice/live turns)
 * plus liveDrafts filtered by originMode, sorted chronologically.
 *
 * @param {object[]} [messages=[]]
 * @param {object[]} [liveDrafts=[]]
 * @param {'single' | 'conversation' | string} [originMode]
 * @returns {object[]}
 */
export function getCarouselMessages(messages = [], liveDrafts = [], originMode = '') {
  const safeLiveDrafts = Array.isArray(liveDrafts) ? liveDrafts : [];
  const safeMessages = Array.isArray(messages) ? messages : [];

  const filteredDrafts = originMode
    ? safeLiveDrafts.filter(
        (draft) => (draft.originMode ?? draft.origin_mode) === originMode,
      )
    : safeLiveDrafts;

  const draftIdentifiers = new Set();
  for (const draft of safeLiveDrafts) {
    if (draft.id) draftIdentifiers.add(draft.id);
    if (draft.utteranceId) draftIdentifiers.add(draft.utteranceId);
    if (draft.messageId) draftIdentifiers.add(draft.messageId);
  }

  const nonDraftMessages = safeMessages.filter((msg) => {
    if (!msg) return false;
    if (msg.isDraft) return false;
    if (msg.id && draftIdentifiers.has(msg.id)) return false;
    return true;
  });

  const combined = [...nonDraftMessages, ...filteredDrafts];

  function getMessageTimestamp(item) {
    const time =
      item.createdAt ??
      item.created_at ??
      item.timestamp ??
      item.updatedAt ??
      item.updated_at ??
      0;
    if (typeof time === 'number') {
      return time;
    }
    const parsed = new Date(time).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return combined.sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));
}

/**
 * Creates a tracker for browser blob URLs that guarantees atomic URL creation,
 * revocation, and cache eviction so dead or revoked blob URLs are never returned.
 *
 * @param {object} [options={}]
 * @param {(blob: Blob) => string} [options.createObjectURL]
 * @param {(url: string) => void} [options.revokeObjectURL]
 * @returns {{
 *   getOrCreate: (key: string, blob: Blob | null) => string,
 *   revokeByKey: (key: string) => void,
 *   revokeByUrl: (url: string) => void,
 *   revokeAll: () => void,
 *   has: (key: string) => boolean,
 *   size: () => number
 * }}
 */
export function createBlobUrlTracker(options = {}) {
  const urlMap = new Map();
  const keyByUrl = new Map();

  const doCreate =
    options.createObjectURL ??
    (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? (b) => URL.createObjectURL(b)
      : () => `blob:mock_${Math.random()}`);

  const doRevoke =
    options.revokeObjectURL ??
    (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function'
      ? (u) => URL.revokeObjectURL(u)
      : () => {});

  return {
    getOrCreate(key, blob) {
      if (!key && !blob) return '';
      const lookupKey = key || (blob ? `blob_${Math.random()}` : '');
      if (urlMap.has(lookupKey)) {
        return urlMap.get(lookupKey);
      }
      if (blob) {
        const url = doCreate(blob);
        urlMap.set(lookupKey, url);
        keyByUrl.set(url, lookupKey);
        return url;
      }
      return '';
    },
    revokeByKey(key) {
      if (!key || !urlMap.has(key)) return;
      const url = urlMap.get(key);
      urlMap.delete(key);
      if (url) {
        keyByUrl.delete(url);
        try {
          doRevoke(url);
        } catch {
          // ignore
        }
      }
    },
    revokeByUrl(url) {
      if (!url) return;
      const key = keyByUrl.get(url);
      if (key) {
        urlMap.delete(key);
        keyByUrl.delete(url);
      }
      try {
        doRevoke(url);
      } catch {
        // ignore
      }
    },
    revokeAll() {
      for (const url of urlMap.values()) {
        try {
          doRevoke(url);
        } catch {
          // ignore
        }
      }
      urlMap.clear();
      keyByUrl.clear();
    },
    has(key) {
      return urlMap.has(key);
    },
    size() {
      return urlMap.size;
    },
  };
}
