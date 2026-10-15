import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import historyModule from '../mobile/src/storage/history.ts';
import processingModule from '../mobile/src/storage/processing.ts';
import controllerModule from '../mobile/src/chat/controller.ts';
import migrations from '../mobile/src/storage/migrations.ts';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
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
  await migrations.migrateHistoryDatabase(connection);
  let id = 0;
  let release;
  let remoteError;
  let calls = 0;
  let inputs = [];
  const history = historyModule.createHistoryRepository(connection);
  const flow = processingModule.createSavedMessageFlow(history, {});
  const translate = async input => {
    calls++; inputs.push(input);
    assert.equal(db.prepare("SELECT count(*) AS n FROM messages WHERE status='pending'").get().n, 1);
    if (remoteError) throw remoteError;
    await new Promise(resolve => { release = resolve; });
    return { originalText: input.text, translatedText: 'Hola', originalPronunciation: '', translatedPronunciation: 'oh-la',
      sourceLanguage: { code: 'en', label: 'English' }, targetLanguage: { code: 'es', label: 'Spanish' } };
  };
  const controller = controllerModule.createTextChatController(history, flow, translate, () => `id_${++id}`);
  await controller.initialize();
  const changes = [];
  controller.subscribe(state => changes.push(state));
  const sending = controller.send('Hello');
  assert.equal(controller.getState().busy, true);
  assert.equal(await controller.send('Duplicate'), false);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().messages[0].status, 'pending');
  release();
  assert.equal(await sending, true);
  assert.equal(controller.getState().messages[0].translated_pronunciation, 'oh-la');
  assert.equal(controller.getState().busy, false);
  remoteError = new TypeError('Network request failed');
  await controller.send('Offline');
  const failed = controller.getState().messages.find(row => row.status === 'failed');
  assert.ok(failed);
  assert.match(controller.getState().error, /Check your connection/);
  assert.equal(calls, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
  remoteError = null; release = null;
  const retry = controller.retry(failed.id);
  await controller.retry(failed.id);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  release(); await retry;
  const recovered = await history.getMessage(failed.id);
  assert.equal(recovered.status, 'ready');
  assert.equal(recovered.request_id, failed.request_id);
  assert.equal(recovered.processing_attempt, 2);
  assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
  assert.deepEqual(Object.keys(inputs[0]).sort(), ['signal', 'sourceLanguage', 'targetLanguage', 'text']);
  await controller.retry(recovered.id);
  assert.equal(calls, 3);
  await flow.saveTextDraft({ id: 'interrupted', requestId: 'stable', conversationId: 'mobile-text-chat', speaker: 'me', originMode: 'chat', sourceLanguage: 'en', targetLanguage: 'es', originalText: 'Interrupted' });
  await history.beginAttempt('interrupted');
  const restarted = controllerModule.createTextChatController(history, processingModule.createSavedMessageFlow(history, {}), translate, () => `id_${++id}`);
  await restarted.initialize();
  assert.equal((await history.getMessage('interrupted')).status, 'interrupted');
  assert.equal(calls, 3, 'Startup must not redispatch');
  const brokenHistory = { ...history, async saveDraft() { throw new Error('SQLITE_FULL'); } };
  const broken = controllerModule.createTextChatController(brokenHistory, processingModule.createSavedMessageFlow(brokenHistory, {}), translate, () => `id_${++id}`);
  await broken.initialize();
  assert.equal(await broken.send('Keep this draft'), false);
  assert.match(broken.getState().error, /not confirmed saved locally/);
  assert.equal(calls, 3);
  assert.ok(changes.some(state => state.busy && state.messages.some(row => row.status === 'pending')));
  console.log('Mobile chat controller passed: SQLite-before-dispatch, pending state, repeat send/retry locks, same-row retry, restart recovery, storage failure and identity boundary.');
} finally { db.close(); }
