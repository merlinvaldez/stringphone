/**
 * @fileoverview Browser-local storage module providing zero-login APK parity for guest users.
 * Supports IndexedDB ('stringphone-local-v1') with an in-memory driver fallback for Node tests,
 * and localStorage with an in-memory fallback for preferences.
 */

import { getSupportedTtsLanguage } from '../../shared/languages.ts';

/** Default IndexedDB database name. */
export const LOCAL_DB_NAME = 'stringphone-local-v1';

/** Default IndexedDB schema version. */
export const LOCAL_DB_VERSION = 1;

/** Storage keys for preferences. */
export const PREF_KEYS = Object.freeze({
  ACTIVE_CONVERSATION: 'stringphone-local-active-conversation-v1',
  CHAT_LANGUAGES: 'stringphone-chat-languages-v1',
  TTS_VOICE: 'stringphone-tts-voice-v1',
});

/** Default preference values. */
export const PREF_DEFAULTS = Object.freeze({
  ACTIVE_CONVERSATION_ID: null,
  MY_LANGUAGE_CODE: 'en',
  THEIR_LANGUAGE_CODE: 'es',
  TTS_VOICE: 'marin',
});

/** Conversation titles eligible for auto-titling on first completed turn. */
const AUTO_TITLE_CANDIDATES = new Set([
  'New chat',
  'Single session',
  'Two-way conversation',
  'Text chat',
]);

let idSequence = 0;

/**
 * Generates a collision-resistant unique ID.
 * @returns {string}
 */
export function generateLocalId() {
  const time = Date.now().toString(36);
  const seq = (++idSequence).toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${time}_${seq}_${rand}`;
}

/**
 * Creates an in-memory preferences storage adapter satisfying Storage interface (getItem, setItem, removeItem).
 * @returns {Storage}
 */
export function createMemoryPrefsStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
}

/**
 * Deep clones serializable items (records and primitives) while preserving Blobs.
 * @template T
 * @param {T} item
 * @returns {T}
 */
function cloneValue(item) {
  if (item === null || typeof item !== 'object') {
    return item;
  }
  if (typeof Blob !== 'undefined' && item instanceof Blob) {
    return item;
  }
  if (Array.isArray(item)) {
    return /** @type {T} */ (item.map(cloneValue));
  }
  const copy = {};
  for (const [k, v] of Object.entries(item)) {
    copy[k] = cloneValue(v);
  }
  return /** @type {T} */ (copy);
}

/**
 * Key path resolution for stores.
 * @param {string} storeName
 * @returns {string}
 */
function getKeyPathForStore(storeName) {
  return storeName === 'ttsCache' ? 'cacheKey' : 'id';
}

/**
 * Creates an in-memory storage driver implementing async primitives for Node unit tests.
 * Stores: conversations, messages, phrasebook, audioAssets, ttsCache.
 * @returns {object} Driver interface
 */
export function createMemoryStorageDriver() {
  const stores = {
    conversations: new Map(),
    messages: new Map(),
    phrasebook: new Map(),
    audioAssets: new Map(),
    ttsCache: new Map(),
  };

  /**
   * @param {string} storeName
   * @returns {Map<string, any>}
   */
  function getMap(storeName) {
    const map = stores[storeName];
    if (!map) {
      throw new Error(`Unknown local store: "${storeName}"`);
    }
    return map;
  }

  return {
    async get(storeName, key) {
      const map = getMap(storeName);
      const val = map.get(key);
      return val !== undefined ? cloneValue(val) : null;
    },

    async getAll(storeName) {
      const map = getMap(storeName);
      return Array.from(map.values()).map(cloneValue);
    },

    async getByIndex(storeName, indexName, value) {
      const map = getMap(storeName);
      const results = [];
      for (const item of map.values()) {
        if (item[indexName] === value) {
          results.push(cloneValue(item));
        }
      }
      return results;
    },

    async put(storeName, record) {
      const map = getMap(storeName);
      const keyField = getKeyPathForStore(storeName);
      const key = record[keyField];
      if (key === undefined || key === null) {
        throw new Error(`Record missing primary key "${keyField}" for store "${storeName}"`);
      }
      map.set(key, cloneValue(record));
    },

    async delete(storeName, key) {
      const map = getMap(storeName);
      map.delete(key);
    },

    async clear(storeName) {
      const map = getMap(storeName);
      map.clear();
    },
  };
}

/**
 * Creates an IndexedDB storage driver wrapping browser window.indexedDB.
 * @param {string} [dbName=LOCAL_DB_NAME]
 * @returns {object} Driver interface
 */
export function createIndexedDbDriver(dbName = LOCAL_DB_NAME) {
  let dbPromise = null;

  /**
   * Lazily opens the IndexedDB database.
   * @returns {Promise<IDBDatabase>}
   */
  function openDb() {
    if (dbPromise) {
      return dbPromise;
    }

    const factory = typeof indexedDB !== 'undefined'
      ? indexedDB
      : typeof window !== 'undefined'
        ? window.indexedDB
        : null;

    if (!factory) {
      throw new Error('IndexedDB is not available in the current environment.');
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = factory.open(dbName, LOCAL_DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = /** @type {IDBOpenDBRequest} */ (event.target).result;

        if (!db.objectStoreNames.contains('conversations')) {
          db.createObjectStore('conversations', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId', { unique: false });
          msgStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('phrasebook')) {
          const pbStore = db.createObjectStore('phrasebook', { keyPath: 'id' });
          pbStore.createIndex('targetLanguageCode', 'targetLanguageCode', { unique: false });
          pbStore.createIndex('sourceMessageId', 'sourceMessageId', { unique: false });
          pbStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('audioAssets')) {
          db.createObjectStore('audioAssets', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('ttsCache')) {
          db.createObjectStore('ttsCache', { keyPath: 'cacheKey' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return dbPromise;
  }

  return {
    async get(storeName, key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => reject(req.error);
      });
    },

    async getAll(storeName) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async getByIndex(storeName, indexName, value) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const index = store.index(indexName);
        const req = index.getAll(value);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    },

    async put(storeName, record) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },

    async delete(storeName, key) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },

    async clear(storeName) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    },
  };
}

/**
 * Scans messages and phrasebook entries to safely delete unreferenced audio assets.
 * @param {object} driver
 * @param {(string | null | undefined)[]} candidateAudioIds
 * @returns {Promise<number>} Count of deleted orphaned assets
 */
export async function cleanupUnreferencedAudio(driver, candidateAudioIds) {
  const ids = Array.from(new Set(candidateAudioIds.filter(Boolean)));
  if (ids.length === 0) {
    return 0;
  }

  const [messages, phrasebookEntries] = await Promise.all([
    driver.getAll('messages'),
    driver.getAll('phrasebook'),
  ]);

  const activeRefs = new Set();
  for (const msg of messages) {
    if (msg.sourceAudioId) activeRefs.add(msg.sourceAudioId);
    if (msg.translatedAudioId) activeRefs.add(msg.translatedAudioId);
  }
  for (const entry of phrasebookEntries) {
    if (entry.sourceAudioId) activeRefs.add(entry.sourceAudioId);
    if (entry.meaningAudioId) activeRefs.add(entry.meaningAudioId);
  }

  let deletedCount = 0;
  for (const id of ids) {
    if (!activeRefs.has(id)) {
      await driver.delete('audioAssets', id);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Normalizes an English language display name from language code.
 * @param {string} code
 * @returns {string}
 */
function resolveLanguageName(code) {
  return getSupportedTtsLanguage(code)?.name ?? (code ? String(code).toUpperCase() : '');
}

/**
 * Validates phrasebook entry fields.
 * @param {{ phraseText?: string, meaningText?: string, targetLanguageCode?: string }} input
 * @param {boolean} allowOptionalMeaning
 */
function validatePhrasebookInput(input, allowOptionalMeaning) {
  const phrase = input.phraseText?.trim() ?? '';
  if (!phrase) {
    throw new Error('Phrase text is required.');
  }
  if (phrase.length > 500) {
    throw new Error('Phrase text is too long (max 500 characters).');
  }

  if (!allowOptionalMeaning) {
    const meaning = input.meaningText?.trim() ?? '';
    if (!meaning) {
      throw new Error('Meaning is required.');
    }
  }

  if (input.targetLanguageCode !== undefined) {
    const targetCode = input.targetLanguageCode?.trim();
    if (!targetCode) {
      throw new Error('Target language code is required.');
    }
  }
}

/**
 * Creates the local store instance coordinating IndexedDB and preferences storage.
 * @param {object} [options={}]
 * @param {object} [options.driver]
 * @param {Storage} [options.prefsStorage]
 * @param {() => string} [options.newId]
 * @param {() => number} [options.now]
 */
export function createLocalStore(options = {}) {
  const hasBrowserStorage = typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
  const driver = options.driver ?? (hasBrowserStorage ? createIndexedDbDriver() : createMemoryStorageDriver());
  const prefsStorage = options.prefsStorage ?? (typeof window !== 'undefined' && window.localStorage ? window.localStorage : createMemoryPrefsStorage());
  const newId = options.newId ?? generateLocalId;
  const now = options.now ?? Date.now;

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------

  /**
   * Returns current preferences synchronously from prefsStorage.
   * Also satisfies await getPreferences().
   * @returns {{ activeConversationId: string | null, myLanguageCode: string, theirLanguageCode: string, ttsVoice: 'marin' | 'onyx' }}
   */
  function getPreferences() {
    let activeConversationId = null;
    try {
      activeConversationId = prefsStorage.getItem(PREF_KEYS.ACTIVE_CONVERSATION) || null;
    } catch {
      activeConversationId = null;
    }

    let myLanguageCode = PREF_DEFAULTS.MY_LANGUAGE_CODE;
    let theirLanguageCode = PREF_DEFAULTS.THEIR_LANGUAGE_CODE;
    try {
      const rawPair = prefsStorage.getItem(PREF_KEYS.CHAT_LANGUAGES);
      if (rawPair) {
        const parsed = JSON.parse(rawPair);
        if (typeof parsed?.myLanguageCode === 'string' && parsed.myLanguageCode) {
          myLanguageCode = parsed.myLanguageCode;
        }
        if (typeof parsed?.theirLanguageCode === 'string' && parsed.theirLanguageCode) {
          theirLanguageCode = parsed.theirLanguageCode;
        }
      }
    } catch {
      // Fallback to defaults
    }

    let ttsVoice = PREF_DEFAULTS.TTS_VOICE;
    try {
      const rawVoice = prefsStorage.getItem(PREF_KEYS.TTS_VOICE);
      ttsVoice = rawVoice === 'onyx' ? 'onyx' : 'marin';
    } catch {
      ttsVoice = 'marin';
    }

    return {
      activeConversationId,
      myLanguageCode,
      theirLanguageCode,
      ttsVoice,
    };
  }

  /**
   * Updates language pair preference.
   * @param {string} myCode
   * @param {string} theirCode
   * @returns {Promise<{ myLanguageCode: string, theirLanguageCode: string }>}
   */
  async function setLanguagePair(myCode, theirCode) {
    const pair = {
      myLanguageCode: myCode,
      theirLanguageCode: theirCode,
    };
    prefsStorage.setItem(PREF_KEYS.CHAT_LANGUAGES, JSON.stringify(pair));
    return pair;
  }

  /**
   * Updates AI TTS voice preference ('marin' | 'onyx').
   * @param {'marin' | 'onyx'} voice
   * @returns {Promise<'marin' | 'onyx'>}
   */
  async function setTtsVoice(voice) {
    const normalized = voice === 'onyx' ? 'onyx' : 'marin';
    prefsStorage.setItem(PREF_KEYS.TTS_VOICE, normalized);
    return normalized;
  }

  /**
   * Sets or clears active conversation ID in preferences.
   * @param {string | null} id
   * @returns {Promise<void>}
   */
  async function setActiveConversationId(id) {
    if (id) {
      prefsStorage.setItem(PREF_KEYS.ACTIVE_CONVERSATION, id);
    } else {
      prefsStorage.removeItem(PREF_KEYS.ACTIVE_CONVERSATION);
    }
  }

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  /**
   * Lists conversations sorted by updatedAt DESC, matching optional query against title and message text.
   * @param {string} [query='']
   * @returns {Promise<object[]>}
   */
  async function listConversations(query = '') {
    const [allConvs, allMessages] = await Promise.all([
      driver.getAll('conversations'),
      driver.getAll('messages'),
    ]);

    const q = (query || '').trim().toLowerCase();
    let results = allConvs;

    if (q) {
      // Index message text by conversationId
      const convsWithMatchingMessages = new Set();
      for (const msg of allMessages) {
        if (!msg.conversationId) continue;
        const orig = (msg.originalText || '').toLowerCase();
        const trans = (msg.translatedText || '').toLowerCase();
        const transc = (msg.transcript || '').toLowerCase();
        if (orig.includes(q) || trans.includes(q) || transc.includes(q)) {
          convsWithMatchingMessages.add(msg.conversationId);
        }
      }

      results = allConvs.filter((conv) => {
        const titleMatch = (conv.title || '').toLowerCase().includes(q);
        return titleMatch || convsWithMatchingMessages.has(conv.id);
      });
    }

    return results.sort((a, b) => {
      const diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  /**
   * Fetches conversation by ID.
   * @param {string} id
   * @returns {Promise<object | null>}
   */
  async function getConversation(id) {
    if (!id) return null;
    return driver.get('conversations', id);
  }

  /**
   * Creates a new conversation.
   * @param {object} [input={}]
   * @param {string} [input.title]
   * @param {'chat' | 'single' | 'conversation'} [input.originMode='chat']
   * @param {string} [input.myLanguageCode]
   * @param {string} [input.theirLanguageCode]
   * @returns {Promise<object>}
   */
  async function createConversation(input = {}) {
    const prefs = getPreferences();
    const originMode = input.originMode || 'chat';
    const defaultTitles = {
      chat: 'New chat',
      single: 'Single session',
      conversation: 'Two-way conversation',
    };
    const title = input.title?.trim() || defaultTitles[originMode] || 'New chat';
    const id = newId();
    const timestamp = now();

    const conversation = {
      id,
      title,
      originMode,
      myLanguageCode: input.myLanguageCode || prefs.myLanguageCode || 'en',
      theirLanguageCode: input.theirLanguageCode || prefs.theirLanguageCode || 'es',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await driver.put('conversations', conversation);
    return conversation;
  }

  /**
   * Updates conversation language pair.
   * @param {string} id
   * @param {string} myLanguageCode
   * @param {string} theirLanguageCode
   * @returns {Promise<object | null>}
   */
  async function updateConversationLanguages(id, myLanguageCode, theirLanguageCode) {
    const existing = await driver.get('conversations', id);
    if (!existing) return null;

    const timestamp = Math.max(now(), (existing.updatedAt || 0) + 1);
    const updated = {
      ...existing,
      myLanguageCode,
      theirLanguageCode,
      updatedAt: timestamp,
    };

    await driver.put('conversations', updated);
    return updated;
  }

  /**
   * Deletes a conversation, removing its messages, cleaning up unreferenced audio, and preserving phrasebook cards.
   * @param {string} id
   * @returns {Promise<{ deleted: boolean, orphanedAudioCount: number }>}
   */
  async function deleteConversation(id) {
    const existing = await driver.get('conversations', id);
    if (!existing) {
      return { deleted: false, orphanedAudioCount: 0 };
    }

    const allMessages = await driver.getAll('messages');
    const convMessages = allMessages.filter((m) => m.conversationId === id);

    const candidateAudioIds = [];
    for (const msg of convMessages) {
      if (msg.sourceAudioId) candidateAudioIds.push(msg.sourceAudioId);
      if (msg.translatedAudioId) candidateAudioIds.push(msg.translatedAudioId);
    }

    await driver.delete('conversations', id);
    for (const msg of convMessages) {
      await driver.delete('messages', msg.id);
    }

    // Clean up message TTS cache keys
    const allTts = await driver.getAll('ttsCache');
    const msgIdSet = new Set(convMessages.map((m) => m.id));
    for (const tts of allTts) {
      const parts = tts.cacheKey?.split(':');
      if (parts && parts[0] === 'message' && msgIdSet.has(parts[1])) {
        await driver.delete('ttsCache', tts.cacheKey);
      }
    }

    // Reset activeConversationId if it pointed to this conversation
    const prefs = getPreferences();
    if (prefs.activeConversationId === id) {
      await setActiveConversationId(null);
    }

    const orphanedAudioCount = await cleanupUnreferencedAudio(driver, candidateAudioIds);
    return { deleted: true, orphanedAudioCount };
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /**
   * Lists messages for a conversation sorted chronologically.
   * @param {string} conversationId
   * @returns {Promise<object[]>}
   */
  async function listMessages(conversationId) {
    const all = await driver.getAll('messages');
    return all
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => {
        const diff = (a.createdAt || 0) - (b.createdAt || 0);
        if (diff !== 0) return diff;
        return (a.id || '').localeCompare(b.id || '');
      });
  }

  /**
   * Saves or updates a message by ID, touching conversation timestamp and auto-titling on first completed turn.
   * @param {object} messageRecord
   * @returns {Promise<object>}
   */
  async function saveMessage(messageRecord) {
    const id = messageRecord.id || newId();
    const existing = await driver.get('messages', id);
    const timestamp = now();
    const createdAt = existing ? existing.createdAt : (messageRecord.createdAt || timestamp);
    const updatedAt = timestamp;

    const message = {
      ...existing,
      ...messageRecord,
      id,
      conversationId: messageRecord.conversationId,
      speaker: messageRecord.speaker || existing?.speaker || 'self',
      originMode: messageRecord.originMode || existing?.originMode || 'chat',
      kind: messageRecord.kind || existing?.kind || 'text',
      status: messageRecord.status || existing?.status || 'ready',
      originalText: messageRecord.originalText !== undefined ? messageRecord.originalText : (existing?.originalText || ''),
      translatedText: messageRecord.translatedText !== undefined ? messageRecord.translatedText : (existing?.translatedText || ''),
      originalPronunciation: messageRecord.originalPronunciation !== undefined ? messageRecord.originalPronunciation : (existing?.originalPronunciation || null),
      translatedPronunciation: messageRecord.translatedPronunciation !== undefined ? messageRecord.translatedPronunciation : (existing?.translatedPronunciation || null),
      transcript: messageRecord.transcript !== undefined ? messageRecord.transcript : (existing?.transcript || null),
      sourceLanguageCode: messageRecord.sourceLanguageCode || existing?.sourceLanguageCode || '',
      targetLanguageCode: messageRecord.targetLanguageCode || existing?.targetLanguageCode || '',
      sourceAudioId: messageRecord.sourceAudioId !== undefined ? messageRecord.sourceAudioId : (existing?.sourceAudioId || null),
      translatedAudioId: messageRecord.translatedAudioId !== undefined ? messageRecord.translatedAudioId : (existing?.translatedAudioId || null),
      errorMessage: messageRecord.errorMessage !== undefined ? messageRecord.errorMessage : (existing?.errorMessage || null),
      createdAt,
      updatedAt,
    };

    await driver.put('messages', message);

    // Touch conversation and check auto-titling
    if (message.conversationId) {
      const conv = await driver.get('conversations', message.conversationId);
      if (conv) {
        let updatedConv = {
          ...conv,
          updatedAt: Math.max(conv.updatedAt || 0, updatedAt),
        };

        if (message.status === 'ready' && AUTO_TITLE_CANDIDATES.has(conv.title)) {
          const candidateText = (message.transcript || message.originalText || '').trim();
          if (candidateText) {
            updatedConv.title = candidateText.slice(0, 80).trim();
          }
        }

        await driver.put('conversations', updatedConv);
      }
    }

    return message;
  }

  // ---------------------------------------------------------------------------
  // Audio Assets & TTS Cache
  // ---------------------------------------------------------------------------

  /**
   * Saves binary audio blob into audioAssets store.
   * @param {Blob} blob
   * @param {string} [id]
   * @returns {Promise<string>}
   */
  async function saveAudioAsset(blob, id) {
    const assetId = id || newId();
    const mimeType = blob?.type || 'audio/webm';
    const asset = {
      id: assetId,
      blob,
      mimeType,
      createdAt: now(),
    };
    await driver.put('audioAssets', asset);
    return assetId;
  }

  /**
   * Retrieves an audio asset by ID.
   * @param {string} id
   * @returns {Promise<{ id: string, blob: Blob, mimeType: string, createdAt: number } | null>}
   */
  async function getAudioAsset(id) {
    if (!id) return null;
    return driver.get('audioAssets', id);
  }

  /**
   * Retrieves cached TTS audio blob by cacheKey.
   * Format: `${ownerKind}:${ownerId}:${role}:${voice}`
   * @param {string} cacheKey
   * @returns {Promise<Blob | null>}
   */
  async function getCachedTtsAudio(cacheKey) {
    if (!cacheKey) return null;
    const record = await driver.get('ttsCache', cacheKey);
    return record?.blob ?? null;
  }

  /**
   * Stores generated TTS audio blob by cacheKey.
   * @param {string} cacheKey
   * @param {Blob} blob
   * @returns {Promise<void>}
   */
  async function putCachedTtsAudio(cacheKey, blob) {
    if (!cacheKey || !blob) return;
    await driver.put('ttsCache', {
      cacheKey,
      blob,
      updatedAt: now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Phrasebook
  // ---------------------------------------------------------------------------

  /**
   * Returns a Set of sourceMessageIds currently present in Phrasebook.
   * @returns {Promise<Set<string>>}
   */
  async function listSavedSourceMessageIds() {
    const entries = await driver.getAll('phrasebook');
    const ids = new Set();
    for (const entry of entries) {
      if (entry.sourceMessageId) {
        ids.add(entry.sourceMessageId);
      }
    }
    return ids;
  }

  /**
   * Lists collections grouped by targetLanguageCode, sorted alphabetically by English name.
   * @param {string} [query='']
   * @returns {Promise<object[]>}
   */
  async function listPhrasebookCollections(query = '') {
    const entries = await driver.getAll('phrasebook');
    const q = (query || '').trim().toLowerCase();

    // Group entries by targetLanguageCode
    const groups = new Map();
    for (const entry of entries) {
      const code = entry.targetLanguageCode?.toLowerCase() || 'unknown';
      if (!groups.has(code)) {
        groups.set(code, []);
      }
      groups.get(code).push(entry);
    }

    const collections = [];
    for (const [code, items] of groups.entries()) {
      const languageName = resolveLanguageName(code);

      let matchingItems = items;
      if (q) {
        matchingItems = items.filter((item) => {
          return (
            (item.phraseText || '').toLowerCase().includes(q) ||
            (item.meaningText || '').toLowerCase().includes(q) ||
            (item.phrasePronunciation || '').toLowerCase().includes(q) ||
            (item.meaningPronunciation || '').toLowerCase().includes(q) ||
            (item.noteText || '').toLowerCase().includes(q) ||
            languageName.toLowerCase().includes(q)
          );
        });
        if (matchingItems.length === 0) {
          continue;
        }
      }

      const maxUpdatedAt = items.reduce((max, cur) => Math.max(max, cur.updatedAt || 0), 0);

      collections.push({
        languageCode: code,
        languageName,
        count: matchingItems.length,
        totalCount: items.length,
        updatedAt: maxUpdatedAt,
      });
    }

    return collections.sort((a, b) => a.languageName.localeCompare(b.languageName));
  }

  /**
   * Gets details and cards for a specific language collection.
   * @param {string} languageCode
   * @param {string} [query='']
   * @returns {Promise<object | null>}
   */
  async function getPhrasebookCollection(languageCode, query = '') {
    const code = (languageCode || '').trim().toLowerCase();
    if (!code) return null;

    const allEntries = await driver.getAll('phrasebook');
    const inCollection = allEntries.filter((e) => (e.targetLanguageCode || '').toLowerCase() === code);

    if (inCollection.length === 0) {
      return null;
    }

    const languageName = resolveLanguageName(code);
    const q = (query || '').trim().toLowerCase();

    let filtered = inCollection;
    if (q) {
      filtered = inCollection.filter((item) => {
        return (
          (item.phraseText || '').toLowerCase().includes(q) ||
          (item.meaningText || '').toLowerCase().includes(q) ||
          (item.phrasePronunciation || '').toLowerCase().includes(q) ||
          (item.meaningPronunciation || '').toLowerCase().includes(q) ||
          (item.noteText || '').toLowerCase().includes(q) ||
          languageName.toLowerCase().includes(q)
        );
      });
    }

    filtered.sort((a, b) => {
      const diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      const cDiff = (b.createdAt || 0) - (a.createdAt || 0);
      if (cDiff !== 0) return cDiff;
      return (b.id || '').localeCompare(a.id || '');
    });

    return {
      languageCode: code,
      languageName,
      totalCount: inCollection.length,
      count: filtered.length,
      entries: filtered,
    };
  }

  /**
   * Saves a message turn to Phrasebook with deduplication.
   * Sets front-first: phraseText is in targetLanguageCode (learning language).
   * @param {object} messagePayload
   * @returns {Promise<{ created: boolean, collection: object, entry: object }>}
   */
  async function savePhrasebookFromMessage(messagePayload) {
    const sourceMessageId = messagePayload.sourceMessageId || messagePayload.id || null;

    // Map fields (front-first: learning language is phraseText)
    let phraseText = '';
    let phrasePronunciation = null;
    let meaningText = '';
    let meaningPronunciation = null;
    let targetLanguageCode = (messagePayload.targetLanguageCode || 'es').toLowerCase();
    let sourceLanguageCode = (messagePayload.sourceLanguageCode || 'en').toLowerCase();

    if (messagePayload.phraseText !== undefined) {
      phraseText = messagePayload.phraseText;
      phrasePronunciation = messagePayload.phrasePronunciation ?? messagePayload.translatedPronunciation ?? null;
      meaningText = messagePayload.meaningText ?? messagePayload.originalText ?? '';
      meaningPronunciation = messagePayload.meaningPronunciation ?? messagePayload.originalPronunciation ?? null;
    } else if (messagePayload.translatedText !== undefined) {
      phraseText = messagePayload.translatedText;
      phrasePronunciation = messagePayload.translatedPronunciation ?? null;
      meaningText = messagePayload.originalText ?? '';
      meaningPronunciation = messagePayload.originalPronunciation ?? null;
    } else {
      phraseText = messagePayload.originalText ?? '';
      meaningText = '';
    }

    validatePhrasebookInput({ phraseText, targetLanguageCode }, true);

    const allEntries = await driver.getAll('phrasebook');
    let existing = null;

    if (sourceMessageId) {
      existing = allEntries.find((e) => e.sourceMessageId === sourceMessageId);
    }
    if (!existing) {
      const normPhrase = phraseText.trim().toLowerCase();
      const normMeaning = meaningText.trim().toLowerCase();
      existing = allEntries.find((e) => {
        return (
          (e.targetLanguageCode || '').toLowerCase() === targetLanguageCode &&
          (e.phraseText || '').trim().toLowerCase() === normPhrase &&
          (e.meaningText || '').trim().toLowerCase() === normMeaning
        );
      });
    }

    if (existing) {
      const collection = await getPhrasebookCollection(existing.targetLanguageCode);
      return { created: false, collection, entry: existing };
    }

    const id = newId();
    const timestamp = now();
    const entry = {
      id,
      sourceMessageId,
      sourceLanguageCode,
      targetLanguageCode,
      phraseText: phraseText.trim(),
      phrasePronunciation: phrasePronunciation || null,
      meaningText: meaningText.trim(),
      meaningPronunciation: meaningPronunciation || null,
      noteText: messagePayload.noteText?.trim() || '',
      sourceMessageKind: messagePayload.kind || messagePayload.sourceMessageKind || 'text',
      sourceMessageSender: messagePayload.speaker || messagePayload.sourceMessageSender || 'self',
      sourceAudioId: messagePayload.sourceAudioId || null,
      meaningAudioId: messagePayload.meaningAudioId || messagePayload.translatedAudioId || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await driver.put('phrasebook', entry);
    const collection = await getPhrasebookCollection(targetLanguageCode);
    return { created: true, collection, entry };
  }

  /**
   * Creates a manual phrasebook entry.
   * @param {object} input
   * @param {string} input.targetLanguageCode
   * @param {string} [input.sourceLanguageCode]
   * @param {string} input.phraseText
   * @param {string} [input.phrasePronunciation]
   * @param {string} [input.meaningText]
   * @param {string} [input.meaningPronunciation]
   * @param {string} [input.noteText]
   * @param {string} [input.sourceAudioId]
   * @param {string} [input.meaningAudioId]
   * @param {object} [options={}]
   * @param {boolean} [options.allowOptionalMeaning=true]
   * @returns {Promise<{ created: true, collection: object, entry: object }>}
   */
  async function createPhrasebookEntry(input, options = {}) {
    const allowOptionalMeaning = options.allowOptionalMeaning ?? true;
    validatePhrasebookInput(input, allowOptionalMeaning);

    const targetCode = input.targetLanguageCode.trim().toLowerCase();
    const sourceCode = (input.sourceLanguageCode?.trim() || 'en').toLowerCase();
    const id = newId();
    const timestamp = now();

    const entry = {
      id,
      sourceMessageId: null,
      sourceLanguageCode: sourceCode,
      targetLanguageCode: targetCode,
      phraseText: input.phraseText.trim(),
      phrasePronunciation: input.phrasePronunciation?.trim() || null,
      meaningText: (input.meaningText || '').trim(),
      meaningPronunciation: input.meaningPronunciation?.trim() || null,
      noteText: input.noteText?.trim() || '',
      sourceMessageKind: 'text',
      sourceMessageSender: 'self',
      sourceAudioId: input.sourceAudioId || null,
      meaningAudioId: input.meaningAudioId || null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await driver.put('phrasebook', entry);
    const collection = await getPhrasebookCollection(targetCode);
    return { created: true, collection, entry };
  }

  /**
   * Updates an existing phrasebook entry, supporting collection re-homing when targetLanguageCode changes.
   * @param {string} id
   * @param {object} input
   * @param {object} [options={}]
   * @param {boolean} [options.allowOptionalMeaning=true]
   * @returns {Promise<{ collection: object, entry: object }>}
   */
  async function updatePhrasebookEntry(id, input, options = {}) {
    const existing = await driver.get('phrasebook', id);
    if (!existing) {
      throw new Error(`Phrasebook entry "${id}" not found.`);
    }

    const allowOptionalMeaning = options.allowOptionalMeaning ?? true;
    if (input.phraseText !== undefined || input.meaningText !== undefined) {
      validatePhrasebookInput(
        {
          phraseText: input.phraseText !== undefined ? input.phraseText : existing.phraseText,
          meaningText: input.meaningText !== undefined ? input.meaningText : existing.meaningText,
          targetLanguageCode: input.targetLanguageCode || existing.targetLanguageCode,
        },
        allowOptionalMeaning,
      );
    }

    const targetCode = (input.targetLanguageCode ? input.targetLanguageCode.trim() : existing.targetLanguageCode).toLowerCase();
    const sourceCode = (input.sourceLanguageCode ? input.sourceLanguageCode.trim() : existing.sourceLanguageCode).toLowerCase();

    const updated = {
      ...existing,
      targetLanguageCode: targetCode,
      sourceLanguageCode: sourceCode,
      phraseText: input.phraseText !== undefined ? input.phraseText.trim() : existing.phraseText,
      phrasePronunciation: input.phrasePronunciation !== undefined ? (input.phrasePronunciation?.trim() || null) : existing.phrasePronunciation,
      meaningText: input.meaningText !== undefined ? (input.meaningText?.trim() || '') : existing.meaningText,
      meaningPronunciation: input.meaningPronunciation !== undefined ? (input.meaningPronunciation?.trim() || null) : existing.meaningPronunciation,
      noteText: input.noteText !== undefined ? (input.noteText?.trim() || '') : existing.noteText,
      sourceAudioId: input.sourceAudioId !== undefined ? input.sourceAudioId : existing.sourceAudioId,
      meaningAudioId: input.meaningAudioId !== undefined ? input.meaningAudioId : existing.meaningAudioId,
      updatedAt: Math.max(now(), (existing.updatedAt || 0) + 1),
    };

    await driver.put('phrasebook', updated);
    const collection = await getPhrasebookCollection(targetCode);
    return { collection, entry: updated };
  }

  /**
   * Deletes a phrasebook entry and cleans up unreferenced audio assets.
   * @param {string} id
   * @returns {Promise<{ deleted: boolean }>}
   */
  async function deletePhrasebookEntry(id) {
    const existing = await driver.get('phrasebook', id);
    if (!existing) {
      return { deleted: false };
    }

    const candidateAudioIds = [existing.sourceAudioId, existing.meaningAudioId].filter(Boolean);
    await driver.delete('phrasebook', id);

    // Clean up phrasebook TTS cache entries
    const allTts = await driver.getAll('ttsCache');
    for (const tts of allTts) {
      const parts = tts.cacheKey?.split(':');
      if (parts && parts[0] === 'phrasebook' && parts[1] === id) {
        await driver.delete('ttsCache', tts.cacheKey);
      }
    }

    await cleanupUnreferencedAudio(driver, candidateAudioIds);
    return { deleted: true };
  }

  return {
    getPreferences,
    setLanguagePair,
    setTtsVoice,
    setActiveConversationId,
    listConversations,
    getConversation,
    createConversation,
    updateConversationLanguages,
    deleteConversation,
    listMessages,
    saveMessage,
    saveAudioAsset,
    getAudioAsset,
    getCachedTtsAudio,
    putCachedTtsAudio,
    listSavedSourceMessageIds,
    listPhrasebookCollections,
    getPhrasebookCollection,
    savePhrasebookFromMessage,
    createPhrasebookEntry,
    updatePhrasebookEntry,
    deletePhrasebookEntry,
  };
}
