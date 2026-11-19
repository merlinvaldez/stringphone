import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, statSync, existsSync, unlinkSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import audioModule from '../mobile/src/storage/audio.ts';
import deletionModule from '../mobile/src/storage/deletion.ts';
import historyModule from '../mobile/src/storage/history.ts';
import migrations from '../mobile/src/storage/migrations.ts';
import phrasebookModule from '../mobile/src/storage/phrasebook.ts';

const { migrateHistoryDatabase } = migrations;
const directory = mkdtempSync(join(tmpdir(), 'stringphone-phrasebook-'));
const databasePath = join(directory, 'history.db');
const db = new DatabaseSync(databasePath);
db.exec('PRAGMA foreign_keys = ON');
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

try {
  await migrateHistoryDatabase(connection);
  let sequence = 0;
  let timestamp = 100;
  const newId = () => `phrase_${++sequence}`;
  const files = {
    async save(name, input) { writeFileSync(join(directory, name), input.bytes); return input.bytes.length; },
    async stat(name) {
      const path = join(directory, name);
      return existsSync(path) ? { uri: path, size: statSync(path).size } : null;
    },
    async remove(name) { if (existsSync(join(directory, name))) unlinkSync(join(directory, name)); },
    async list() { return readdirSync(directory); },
  };
  const audio = audioModule.createAudioStorage(connection, files, newId);
  const history = historyModule.createHistoryRepository(connection, () => ++timestamp);
  const phrasebook = phrasebookModule.createPhrasebookRepository(connection, newId, () => ++timestamp);

  async function addReadyMessage(conversationId, id, source, translated) {
    await history.createConversation({ id: conversationId, title: 'Phrase test', originMode: 'chat', myLanguage: 'en', theirLanguage: 'es' });
    await connection.runAsync(
      `INSERT INTO messages (id,conversation_id,speaker,origin_mode,source_language,target_language,
        original_text,translated_text,original_pronunciation,translated_pronunciation,status,created_at,updated_at)
       VALUES (?,?, 'me','chat','en','es',?,?,?,?,'ready',?,?)`,
      id, conversationId, source, translated, 'good morning', 'bweh-nos dee-as', ++timestamp, timestamp,
    );
  }

  await addReadyMessage('conversation-1', 'message-1', 'Good morning', 'Buenos días');
  await audio.save({ kind: 'message', id: 'message-1', role: 'source' }, { bytes: new Uint8Array([1, 2, 3, 4]) }, { format: 'wav', mimeType: 'audio/wav', durationMs: 400 });
  await audio.save({ kind: 'message', id: 'message-1', role: 'translated' }, { bytes: new Uint8Array([5, 6, 7]) }, { format: 'wav', mimeType: 'audio/wav', durationMs: 300 });

  const savedId = await phrasebook.saveFromMessage('message-1', ['source', 'translated']);
  assert.equal(await phrasebook.saveFromMessage('message-1'), savedId, 'saving the same message is idempotent');
  const saved = await phrasebook.get(savedId);
  assert.equal(saved.source_message_id, 'message-1');
  assert.equal(saved.original_text, 'Good morning');
  assert.equal(saved.translated_text, 'Buenos días');
  assert.equal(saved.original_pronunciation, 'good morning');
  assert.equal(saved.translated_pronunciation, 'bweh-nos dee-as');
  assert.equal((await audio.resolve({ kind: 'phrasebook', id: savedId, role: 'source' })).availability, 'available');
  assert.equal((await audio.resolve({ kind: 'phrasebook', id: savedId, role: 'translated' })).availability, 'available');
  assert.deepEqual([...await phrasebook.savedSourceMessageIds(['message-1', 'missing'])], ['message-1']);

  const manualId = await phrasebook.create({
    source_language: 'fr', target_language: 'en', original_text: 'Bonjour', translated_text: '',
    original_pronunciation: 'bohn-zhoor', translated_pronunciation: null,
  });
  const manual = await phrasebook.get(manualId);
  const edited = await phrasebook.update(manualId, manual.updated_at, {
    source_language: 'fr', target_language: 'en', original_text: 'Bonjour tout le monde', translated_text: 'Hello everyone',
    original_pronunciation: 'bohn-zhoor too luh mond', translated_pronunciation: null,
  });
  assert.equal(edited, 'updated');
  assert.equal((await phrasebook.update(manualId, manual.updated_at, {
    source_language: 'fr', target_language: 'en', original_text: 'stale edit', translated_text: '',
    original_pronunciation: null, translated_pronunciation: null,
  })), 'changed', 'stale editor revisions are rejected');
  assert.equal((await phrasebook.listPage('everyone')).items[0].id, manualId, 'edited text is indexed for offline search');
  assert.equal((await phrasebook.listPage('Buenos días')).items[0].id, savedId, 'translation is searchable');
  assert.deepEqual(await phrasebook.listPage('" OR 1=1 --'), { items: [], cursor: null }, 'search syntax remains literal');

  const firstPage = await phrasebook.listPage('', null, 1);
  const secondPage = await phrasebook.listPage('', firstPage.cursor, 1);
  assert.equal(firstPage.items.length, 1);
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);

  const deletion = deletionModule.createDeletionService(connection, audio, async () => true);
  const conversationDeletion = await deletion.delete({ kind: 'conversation', id: 'conversation-1' });
  assert.equal(conversationDeletion.status, 'deleted');
  assert.equal((await phrasebook.get(savedId)).source_message_id, null, 'conversation removal clears the source link');
  assert.equal((await phrasebook.get(savedId)).original_text, 'Good morning', 'conversation removal preserves phrase text');
  assert.equal((await audio.resolve({ kind: 'phrasebook', id: savedId, role: 'source' })).availability, 'available', 'phrase-linked audio survives conversation removal');
  assert.equal(await history.getMessage('message-1'), null);

  await addReadyMessage('conversation-2', 'message-2', 'See you soon', 'Hasta pronto');
  const secondSavedId = await phrasebook.saveFromMessage('message-2');
  assert.equal((await deletion.delete({ kind: 'phrase', id: secondSavedId })).status, 'deleted');
  assert.ok(await history.getMessage('message-2'), 'phrase removal leaves its source message intact');
  assert.equal(await phrasebook.get(secondSavedId), null);

  assert.equal((await deletion.delete({ kind: 'phrase', id: savedId })).status, 'deleted');
  assert.equal(await phrasebook.get(savedId), null);
  assert.equal(db.prepare('SELECT count(*) AS count FROM audio_assets').get().count, 0, 'orphaned audio is cleaned after phrase deletion');
  console.log('Mobile Phrasebook storage, search, editing, deletion and audio retention checks passed.');
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
