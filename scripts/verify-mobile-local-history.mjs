import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import historyModule from '../mobile/src/storage/history.ts';
import processingModule from '../mobile/src/storage/processing.ts';
import controllerModule from '../mobile/src/chat/controller.ts';
import transportModule from '../mobile/src/adapters/processingTransport.ts';
import textModule from '../mobile/src/adapters/textChat.ts';
import migrations from '../mobile/src/storage/migrations.ts';

const directory = mkdtempSync(join(tmpdir(), 'stringphone-local-history-'));
const databasePath = join(directory, 'history.db');
let db = new DatabaseSync(databasePath);
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
const calls = [];
let rejectProcessing = false;
let id = 0;
const transport = transportModule.createProcessingTransport(path => `https://processing.invalid/api${path}`, async (url, options) => {
  calls.push({ url, options });
  assert.equal(url, 'https://processing.invalid/api/chat/messages/text');
  assert.equal(options.method, 'POST');
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
  assert.equal(options.credentials, undefined);
  const body = JSON.parse(options.body);
  assert.deepEqual(Object.keys(body).sort(), ['sourceLanguage', 'targetLanguage', 'text']);
  assert.equal(body.sourceLanguage, 'en');
  assert.equal(body.targetLanguage, 'es');
  const pending = db.prepare("SELECT * FROM messages WHERE status='pending'").get();
  assert.ok(pending, 'Local pending row must exist before HTTP dispatch');
  assert.equal(pending.original_text, body.text);
  if (rejectProcessing) return Response.json({ error: 'Processing unavailable' }, { status: 401 });
  return Response.json({
    originalText: body.text, translatedText: 'Hola', originalPronunciation: '', translatedPronunciation: 'oh-la',
    sourceLanguage: { code: 'en', label: 'English' }, targetLanguage: { code: 'es', label: 'Spanish' },
    // An unexpected server ownership field must never replace local identity.
    conversationId: 'server-owned-conversation', id: 'server-owned-message',
  });
});
const api = textModule.createTextChatApi(transport);
function controller() {
  const history = historyModule.createHistoryRepository(connection);
  return controllerModule.createTextChatController(history, processingModule.createSavedMessageFlow(history, {}), api.translateTextMessage, () => `local_${++id}`);
}
try {
  db.exec('PRAGMA foreign_keys=ON');
  await migrations.migrateHistoryDatabase(connection);
  const chat = controller();
  await chat.initialize();
  assert.equal(calls.length, 0, 'Opening history must be offline');
  assert.equal(await chat.send('Hello'), true);
  const ready = chat.getState().messages[0];
  assert.equal(ready.status, 'ready');
  assert.equal(ready.translated_text, 'Hola');
  assert.equal(ready.translated_pronunciation, 'oh-la');
  assert.equal(ready.conversation_id, 'mobile-text-chat');
  assert.match(ready.id, /^local_/);
  assert.equal(calls.length, 1, 'Success must not call a separate cloud save');
  rejectProcessing = true;
  await chat.send('Failed turn');
  const failed = chat.getState().messages.find(message => message.status === 'failed');
  assert.ok(failed);
  db.close();
  db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON');
  await migrations.migrateHistoryDatabase(connection);
  const reopened = controller();
  await reopened.initialize();
  assert.equal(calls.length, 2, 'Restart/history reads must not contact cloud history');
  assert.equal(reopened.getState().messages.length, 2);
  assert.equal(reopened.getState().messages.find(message => message.id === ready.id).translated_text, 'Hola');
  rejectProcessing = false;
  await reopened.retry(failed.id);
  const retried = reopened.getState().messages.find(message => message.id === failed.id);
  assert.equal(retried.status, 'ready');
  assert.equal(retried.request_id, failed.request_id);
  assert.equal(reopened.getState().messages.length, 2);
  assert.equal(calls.length, 3);
  for (const endpoint of ['/chat/conversations', '/chat/conversations/web-id/messages', '/collections', '/collections/entries']) {
    await assert.rejects(transport.post(endpoint, {}), /Unsupported mobile processing endpoint/);
  }
  assert.equal(calls.length, 3, 'Web history endpoints must be rejected before fetch');
  assert.equal(db.prepare('SELECT count(*) AS n FROM conversations').get().n, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM phrasebook_entries').get().n, 0);
  console.log('Local history integration passed: controller → processing transport → SQLite, guest payloads, same-row retry, disk reopen without cloud calls, rejected web history/collection endpoints.');
} finally {
  db.close();
  rmSync(directory, { recursive: true, force: true });
}
