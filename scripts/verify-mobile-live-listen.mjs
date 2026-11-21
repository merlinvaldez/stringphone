import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import transportModule from '../mobile/src/adapters/processingTransport.ts';
import playbackCoordinatorModule from '../mobile/src/adapters/playbackCoordinator.ts';
import historyModule from '../mobile/src/storage/history.ts';
import migrations from '../mobile/src/storage/migrations.ts';
import livePlaybackQueueModule from '../mobile/src/live/livePlaybackQueue.ts';
import liveListenHelpersModule from '../mobile/src/live/liveListenHelpers.ts';

const { createProcessingTransport } = transportModule;
const { AudioPlaybackCoordinator } = playbackCoordinatorModule;
const { createHistoryRepository } = historyModule;
const { historyMigrations, migrateHistoryDatabase, HISTORY_SCHEMA_VERSION } = migrations;
const { createNativeLivePlaybackQueue } = livePlaybackQueueModule;
const { selectNativeSegmentAudioForPersistence } = liveListenHelpersModule;
const ROOT_DIR = resolve(import.meta.dirname, '..');

// 1. SQLite HISTORY_SCHEMA_VERSION stays 4 and same-language ready live messages store NULL translated_text
{
  assert.equal(HISTORY_SCHEMA_VERSION, 4);
  assert.equal(historyMigrations.length, 4);

  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const connection = {
    async execAsync(sql) { db.exec(sql); },
    async getFirstAsync(sql, ...args) { return db.prepare(sql).get(...args) ?? null; },
    async getAllAsync(sql, ...args) { return db.prepare(sql).all(...args); },
    async runAsync(sql, ...args) { return db.prepare(sql).run(...args); },
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN IMMEDIATE');
      try { await task(connection); db.exec('COMMIT'); }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    },
  };

  try {
    await migrateHistoryDatabase(connection);
    const history = createHistoryRepository(connection, () => 1_700_000_000_000);
    await history.startChatConversation('conv-live', 'en', 'es');

    // Same-language listener utterance with empty translatedText succeeds (stored as NULL)
    const created = await history.saveReadyLiveMessage({
      id: 'msg-self-en',
      requestId: 'req-self-en',
      conversationId: 'conv-live',
      speaker: 'me',
      originMode: 'chat',
      sourceLanguage: 'en',
      targetLanguage: 'en',
      originalText: 'I am listening.',
      translatedText: '',
    });
    assert.equal(created, true);
    const savedSelf = await history.getMessage('msg-self-en');
    assert.equal(savedSelf?.status, 'ready');
    assert.equal(savedSelf?.translated_text, null);

    // Same-language draft finalization succeeds with empty translatedText
    await history.saveDraft({
      id: 'draft-en',
      requestId: 'req-draft-en',
      conversationId: 'conv-live',
      speaker: 'me',
      originMode: 'chat',
      sourceLanguage: 'en',
      targetLanguage: 'en',
      originalText: '',
      inputKind: 'voice',
    });
    const finalized = await history.finishLiveDraft({
      id: 'draft-en',
      requestId: 'req-draft-en',
      conversationId: 'conv-live',
      speaker: 'me',
      originMode: 'chat',
      sourceLanguage: 'en',
      targetLanguage: 'en',
      originalText: 'Still listening.',
      translatedText: '',
    });
    assert.equal(finalized, true);
    assert.equal((await history.getMessage('draft-en'))?.translated_text, null);

    // Cross-language ready message with empty translatedText still throws
    await assert.rejects(
      history.saveReadyLiveMessage({
        id: 'msg-bad-cross',
        requestId: 'req-bad-cross',
        conversationId: 'conv-live',
        speaker: 'them',
        originMode: 'chat',
        sourceLanguage: 'es',
        targetLanguage: 'en',
        originalText: 'Hola',
        translatedText: '',
      }),
      /Required history value is empty/,
    );
  } finally {
    db.close();
  }
}

// 2. Mobile transport privacy, 3 MB limit, file:// check & zero conversationId/userId leakage
{
  const uploads = [];
  const transport = createProcessingTransport(
    path => `https://api.stringphone.ai${path}`,
    async () => new Response('{}'),
    async uri => {
      if (uri.includes('oversized')) {
        return {
          exists: true,
          size: 3_000_001,
          upload: async () => ({ body: '{}', status: 200, headers: {} }),
        };
      }
      return {
        exists: true,
        size: 12_345,
        upload: async (url, options) => {
          uploads.push({ url, options });
          return {
            body: JSON.stringify({
              ok: true,
              chunkId: 'chunk-1',
              isPreview: false,
              listenerLanguage: { code: 'en', label: 'English' },
              segments: [],
            }),
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          };
        },
      };
    },
  );

  await assert.rejects(
    transport.postLiveListenChunk({
      uri: 'https://remote.example/audio.m4a',
      mimeType: 'audio/mp4',
      filename: 'chunk.m4a',
      listenerLanguage: 'en',
    }),
    /Invalid native live-listen recording metadata/,
  );

  await assert.rejects(
    transport.postLiveListenChunk({
      uri: 'file:///tmp/oversized.m4a',
      mimeType: 'audio/mp4',
      filename: 'oversized.m4a',
      listenerLanguage: 'en',
    }),
    /3 MB/,
  );

  const payloadWithExtras = {
    uri: 'file:///tmp/chunk_1.m4a',
    mimeType: 'audio/mp4',
    filename: 'chunk_1.m4a',
    listenerLanguage: 'en',
    theirLanguage: 'es',
    chunkId: 'chunk-1',
    isPreview: false,
    contextBias: ['StringPhone'],
    conversationId: 'secret-conv-id',
    userId: 'secret-user-id',
  };
  await transport.postLiveListenChunk(payloadWithExtras);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].url, 'https://api.stringphone.ai/chat/messages/live-listen');
  assert.equal(uploads[0].options.fieldName, 'sourceAudio');
  assert.equal('conversationId' in uploads[0].options.parameters, false);
  assert.equal('userId' in uploads[0].options.parameters, false);
}

// 3. AudioPlaybackCoordinator live-listen coordination & existing mutual exclusion
{
  AudioPlaybackCoordinator.setLiveListenActive(false);
  AudioPlaybackCoordinator.setRecording(true);
  assert.equal(AudioPlaybackCoordinator.startPlayback('chat-1', () => {}), false);
  AudioPlaybackCoordinator.setRecording(false);
  assert.equal(AudioPlaybackCoordinator.startPlayback('chat-1', () => {}), true);
  AudioPlaybackCoordinator.stopPlayback();

  let priorStopped = false;
  AudioPlaybackCoordinator.setLiveListenActive(true);
  assert.equal(
    AudioPlaybackCoordinator.startLivePlayback('live-1', () => { priorStopped = true; }),
    true,
  );
  assert.equal(AudioPlaybackCoordinator.startLivePlayback('live-2', () => {}), true);
  assert.equal(priorStopped, true);
  AudioPlaybackCoordinator.setLiveListenActive(false);
  assert.equal(AudioPlaybackCoordinator.getActivePlaybackId(), null);
}

// 4. Native FIFO playback queue & multi-speaker voice-clone exclusion
{
  const prefetched = [];
  const played = [];
  const resolvers = new Map();
  const queue = createNativeLivePlaybackQueue({
    initialAutoPlay: true,
    prefetchAudio: item => {
      prefetched.push(item.messageId);
      return new Promise(resolveFn => resolvers.set(item.messageId, resolveFn));
    },
    playItem: async item => {
      played.push(item.messageId);
    },
  });

  assert.deepEqual(
    queue.enqueue({ messageId: 'self', text: '', languageCode: 'en', needsPlayback: false }),
    { queued: false, prefetched: false },
  );
  queue.enqueue({ messageId: 'm1', text: 'Uno', languageCode: 'en', needsPlayback: true });
  queue.enqueue({ messageId: 'm2', text: 'Dos', languageCode: 'en', needsPlayback: true });
  assert.deepEqual(prefetched, ['m1', 'm2']);

  resolvers.get('m2')('file:///m2.wav');
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(played, []);
  resolvers.get('m1')('file:///m1.wav');
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(played, ['m1', 'm2']);

  const dummyRec = { uri: 'file:///chunk.m4a', durationMs: 3200 };
  assert.equal(
    selectNativeSegmentAudioForPersistence({ singleSpeakerAudioEligible: false }, 0, dummyRec),
    undefined,
  );
  assert.deepEqual(
    selectNativeSegmentAudioForPersistence({ singleSpeakerAudioEligible: true }, 0, dummyRec),
    dummyRec,
  );
}

// 5. Source contracts on AppShell.tsx, MessageCard.tsx & LiveListenView.tsx
{
  const appShellSrc = readFileSync(resolve(ROOT_DIR, 'mobile/src/components/AppShell.tsx'), 'utf8');
  const messageCardSrc = readFileSync(resolve(ROOT_DIR, 'mobile/src/chat/MessageCard.tsx'), 'utf8');
  const liveViewSrc = readFileSync(resolve(ROOT_DIR, 'mobile/src/live/LiveListenView.tsx'), 'utf8');

  assert.match(appShellSrc, /route:\s*'\/live'[\s\S]*labelKey:\s*'modeLive'[\s\S]*icon:\s*'ear-outline'/);
  assert.match(messageCardSrc, /isSameLanguageReady/);
  assert.match(liveViewSrc, /useUiStrings/);
  assert.doesNotMatch(liveViewSrc, /\bTextInput\b/, 'LiveListenView must omit text input');
  assert.doesNotMatch(liveViewSrc, /\bAudioWave\b/, 'LiveListenView must omit waveform animation');
  assert.doesNotMatch(liveViewSrc, /invertLanguages/, 'LiveListenView must omit language switch button');
  assert.doesNotMatch(liveViewSrc, /strings\.theirLanguage/, 'LiveListenView must omit lang 2 picker');
  assert.match(liveViewSrc, /label=\{strings\.myLanguage\}/);
  assert.match(liveViewSrc, /name="headphones"/);
  assert.doesNotMatch(liveViewSrc, /volume-2|volume-x/, 'LiveListenView must omit speaker toggle next to Listen');
}

console.log(
  'PASS Mobile Live Listen: SQLite v4 same-language null support, multipart privacy, AudioPlaybackCoordinator live mode, FIFO queue, and /live route',
);
