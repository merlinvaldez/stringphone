import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import historyModule from '../mobile/src/storage/history.ts';
import audioModule from '../mobile/src/storage/audio.ts';
import migrations from '../mobile/src/storage/migrations.ts';

const directory = mkdtempSync(join(tmpdir(), 'stringphone-source-audio-'));
const db = new DatabaseSync(join(directory, 'history.db'));
const connection = {
  async execAsync(sql) { db.exec(sql); },
  async getFirstAsync(sql, ...args) { return db.prepare(sql).get(...args) ?? null; },
  async getAllAsync(sql, ...args) { return db.prepare(sql).all(...args); },
  async runAsync(sql, ...args) { return db.prepare(sql).run(...args); },
  async withExclusiveTransactionAsync(task) {
    db.exec('BEGIN IMMEDIATE');
    try { await task(connection); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  },
};

let audioId = 0;
const storedFiles = new Map();
const audio = audioModule.createAudioStorage(connection, {
  async save(name, input) {
    const bytes = input.bytes ?? new Uint8Array([1, 2, 3]);
    storedFiles.set(name, bytes);
    return bytes.length;
  },
  async stat(name) {
    return storedFiles.has(name) ? { uri: `file://${name}`, size: storedFiles.get(name).length } : null;
  },
  async list() { return [...storedFiles.keys()]; },
  async remove(name) { storedFiles.delete(name); },
}, () => `audio_${++audioId}`);

const history = historyModule.createHistoryRepository(connection);

try {
  db.exec('PRAGMA foreign_keys=ON');
  await migrations.migrateHistoryDatabase(connection);

  const conversationId = 'conv_test_1';
  await connection.runAsync(
    "INSERT INTO conversations (id, title, origin_mode, my_language, their_language, created_at, updated_at) VALUES (?, 'Test', 'conversation', 'fa', 'en', ?, ?)",
    conversationId, Date.now(), Date.now()
  );

  // 1. Create a live message (input_kind = 'voice') WITHOUT audio recording
  const liveMessageId = 'live_msg_1';
  await history.saveReadyLiveMessage({
    id: liveMessageId,
    requestId: 'live_req_1',
    conversationId,
    speaker: 'them',
    originMode: 'conversation',
    sourceLanguage: 'fa',
    targetLanguage: 'en',
    originalText: 'سلام علیکم چطوری؟',
    translatedText: 'Hello, how are you?',
    originalPronunciation: 'salaam',
    translatedPronunciation: 'hello',
  });

  // Verify message was saved as 'voice'
  const savedMsg = await history.getMessage(liveMessageId);
  assert.equal(savedMsg.input_kind, 'voice');
  assert.equal(savedMsg.status, 'ready');

  // Verify audio is initially missing
  const initialResolved = await audio.resolve({ kind: 'message', id: liveMessageId, role: 'source' });
  assert.equal(initialResolved, null);

  // 2. Simulate speech generator fallback
  let ttsRequested = false;
  async function mockRequestOutputSpeech(opts) {
    ttsRequested = true;
    assert.equal(opts.text, 'سلام علیکم چطوری؟');
    assert.equal(opts.language, 'fa');
    return {
      bytes: new Uint8Array([10, 20, 30, 40]),
      format: 'wav',
      mimeType: 'audio/wav',
      durationMs: 1200,
    };
  }

  async function ensureSourceSpeech(messageId) {
    const existing = await audio.resolve({ kind: 'message', id: messageId, role: 'source' });
    if (existing && existing.availability === 'available' && existing.uri) {
      return existing;
    }
    const message = await history.getMessage(messageId);
    if (!message) throw new Error('Message not found.');
    const text = message.original_text;
    if (!text || !text.trim()) throw new Error('No original text available for speech generation.');
    const speech = await mockRequestOutputSpeech({
      text,
      language: message.source_language,
    });
    await audio.save(
      { kind: 'message', id: messageId, role: 'source' },
      { bytes: speech.bytes },
      { format: speech.format, mimeType: speech.mimeType, durationMs: speech.durationMs },
      true,
    );
    return audio.resolve({ kind: 'message', id: messageId, role: 'source' });
  }

  const generated = await ensureSourceSpeech(liveMessageId);
  assert.ok(ttsRequested);
  assert.equal(generated.availability, 'available');
  assert.ok(generated.uri);

  // Subsequent resolve should return cached asset without re-requesting TTS
  ttsRequested = false;
  const cached = await ensureSourceSpeech(liveMessageId);
  assert.equal(ttsRequested, false);
  assert.equal(cached.availability, 'available');
  assert.equal(cached.id, generated.id);

  console.log('Mobile source audio fallback verification passed.');
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
