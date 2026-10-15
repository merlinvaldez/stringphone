// Real SQLite/controller/deletion integration; providers and audio files are fixtures.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import historyModule from '../mobile/src/storage/history.ts';
import processingModule from '../mobile/src/storage/processing.ts';
import controllerModule from '../mobile/src/chat/controller.ts';
import deletionModule from '../mobile/src/storage/deletion.ts';
import audioModule from '../mobile/src/storage/audio.ts';
import presentation from '../mobile/src/chat/presentation.ts';
import migrations from '../mobile/src/storage/migrations.ts';

const directory = mkdtempSync(join(tmpdir(), 'stringphone-chat-history-'));
let db = new DatabaseSync(join(directory, 'history.db'));
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
let id = 0;
let approval = false;
let removalFails = false;
let releaseTranslation;
let failTranslation = false;
const calls = [];
const prompts = [];
const files = new Map();
const audio = audioModule.createAudioStorage(connection, {
  async save(name, input) { files.set(name, input.bytes); return input.bytes.length; },
  async stat(name) { return files.has(name) ? { uri: `file://${name}`, size: files.get(name).length } : null; },
  async list() { return [...files.keys()]; },
  async remove(name) { if (removalFails) throw Error('disk busy'); files.delete(name); },
}, () => `audio_${++id}`);
const history = historyModule.createHistoryRepository(connection);
const deletion = deletionModule.createDeletionService(connection, audio, async prompt => { prompts.push(prompt); return approval; });
const translate = async input => {
  calls.push(input);
  if (failTranslation) throw new TypeError('offline');
  if (releaseTranslation === null) await new Promise(resolve => { releaseTranslation = resolve; });
  return { originalText: input.text, translatedText: 'translated', originalPronunciation: '', translatedPronunciation: '',
    sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage };
};
const controller = (repo = history) => controllerModule.createTextChatController(repo,
  processingModule.createSavedMessageFlow(repo, audio), translate, () => `chat_${++id}`, undefined, deletion);
try {
  db.exec('PRAGMA foreign_keys=ON');
  await migrations.migrateHistoryDatabase(connection);
  let chat = controller();
  await chat.initialize();
  const first = chat.getState().conversation.id;
  await chat.setLanguages('en', 'fa');
  await chat.send('First Persian translation');
  const original = chat.getState().messages[0];
  assert.equal(original.target_language, 'fa');
  await chat.swapLanguages();
  assert.equal(chat.getState().myLanguage, 'fa');
  assert.equal((await history.getMessage(original.id)).target_language, 'fa', 'Selectors must not rewrite message snapshots');
  await chat.send('سلام');
  assert.equal(calls.at(-1).sourceLanguage.code, 'fa');
  failTranslation = true;
  await chat.send('Retry in the original direction');
  const failed = chat.getState().messages.at(-1);
  failTranslation = false;
  await chat.setLanguages('en', 'es');
  await chat.retry(failed.id);
  assert.equal(calls.at(-1).sourceLanguage.code, 'fa');
  assert.equal(calls.at(-1).targetLanguage.code, 'en');
  await chat.setLanguages('he', 'he');
  const beforeSwap = chat.getState();
  await chat.swapLanguages();
  assert.equal(chat.getState(), beforeSwap, 'Equal-language swap is a no-op');
  assert.deepEqual(presentation.messageDirection('fa'), { textAlign: 'right', writingDirection: 'rtl' });
  assert.equal(presentation.isRtlLanguage('he'), true);
  assert.equal(presentation.isRtlLanguage('en'), false);
  await chat.newConversation();
  const second = chat.getState().conversation.id;
  assert.notEqual(first, second);
  assert.equal(chat.getState().messages.length, 0);
  await chat.setLanguages('en', 'ar');
  releaseTranslation = null;
  const pending = chat.send('Busy guards');
  assert.equal(await chat.setLanguages('es', 'en'), false);
  assert.equal(await chat.openConversation(first), false);
  assert.equal(await chat.newConversation(), false);
  assert.equal(await chat.deleteConversation(first), false);
  while (!releaseTranslation) await new Promise(resolve => setImmediate(resolve));
  releaseTranslation();
  await pending;
  releaseTranslation = undefined;
  assert.equal(chat.getState().theirLanguage, 'ar');
  const callsBeforeReopen = calls.length;
  db.close();
  db = new DatabaseSync(join(directory, 'history.db'));
  db.exec('PRAGMA foreign_keys=ON');
  chat = controller();
  await chat.initialize();
  assert.equal(chat.getState().conversation.id, second);
  assert.equal(chat.getState().theirLanguage, 'ar');
  await chat.openConversation(first);
  assert.equal(chat.getState().myLanguage, 'he');
  assert.equal(chat.getState().messages.length, 3);
  assert.equal(calls.length, callsBeforeReopen, 'History and preferences reopen offline');
  await chat.searchHistory('Persian');
  assert.deepEqual(chat.getState().conversations.map(row => row.id), [first]);
  await chat.searchHistory('سلام');
  assert.deepEqual(chat.getState().conversations.map(row => row.id), [first]);
  await chat.searchHistory('" OR *');
  assert.equal(chat.getState().conversations.length, 0, 'FTS syntax is literal user text');
  await chat.searchHistory('');
  // Tie-safe pagination beyond both former list caps.
  for (let i = 0; i < 225; i++) {
    db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?)').run(`paged-${String(i).padStart(3, '0')}`, `History ${i}`, 'chat', 'en', 'es', 1, 1);
    db.prepare("INSERT INTO messages(id,conversation_id,speaker,origin_mode,source_language,target_language,original_text,status,created_at,updated_at) VALUES (?,?,?,'chat','en','es',?,'ready',1,1)").run(`msg-${String(i).padStart(3, '0')}`, first, i % 2 ? 'me' : 'them', `Older ${i}`);
  }
  // An older pagination request cannot overwrite a newer history search.
  let finishOldPage;
  const delayedRepo = { ...history, async listConversationPage(query, cursor, limit) {
    const result = await history.listConversationPage(query, cursor, limit);
    if (cursor) await new Promise(resolve => { finishOldPage = resolve; });
    return result;
  } };
  const searching = controller(delayedRepo);
  await searching.initialize();
  const olderPage = searching.loadMoreHistory();
  while (!finishOldPage) await new Promise(resolve => setImmediate(resolve));
  await searching.searchHistory('Persian');
  finishOldPage(); await olderPage;
  assert.equal(searching.getState().historyQuery, 'Persian');
  assert.deepEqual(searching.getState().conversations.map(row => row.id), [first]);
  await chat.searchHistory('');
  while (chat.getState().historyCursor) await chat.loadMoreHistory();
  assert.equal(new Set(chat.getState().conversations.map(row => row.id)).size, 227);
  await chat.openConversation(first);
  while (chat.getState().messageCursor) await chat.loadOlderMessages();
  assert.equal(new Set(chat.getState().messages.map(row => row.id)).size, 228);
  assert.deepEqual(chat.getState().messages.slice(0, 225).map(row => row.id), Array.from({ length: 225 }, (_, i) => `msg-${String(i).padStart(3, '0')}`));
  await chat.send('Keep loaded older messages');
  assert.equal(chat.getState().messages.length, 229);
  // Failed preference writes must not change the current UI pair.
  // Initialize first, then inject failure for a mutation.
  let breakWrites = false;
  const brokenRepo = { ...history, async selectChatConversation(...args) { if (breakWrites) throw Error('disk full'); return history.selectChatConversation(...args); } };
  const checked = controller(brokenRepo);
  await checked.initialize();
  breakWrites = true;
  const oldPair = checked.getState().theirLanguage;
  assert.equal(await checked.setLanguages('es', 'fr'), false);
  assert.equal(checked.getState().theirLanguage, oldPair);
  assert.match(checked.getState().error, /disk full/);
  // Cancel, then confirm deletion; independently retained Phrasebook audio survives.
  const sourceMessage = (await history.listMessages(first))[0];
  db.prepare("INSERT INTO phrasebook_entries(id,source_message_id,source_language,target_language,original_text,created_at,updated_at) VALUES ('saved-phrase',?,'en','es','Keep this phrase',1,1)").run(sourceMessage.id);
  await audio.save({ kind: 'message', id: sourceMessage.id, role: 'source' }, { bytes: new Uint8Array([1,2]) }, { format: 'wav', mimeType: 'audio/wav' });
  const asset = db.prepare('SELECT * FROM audio_assets').get();
  db.prepare("INSERT INTO phrasebook_audio VALUES ('saved-phrase','source',?)").run(asset.id);
  await audio.save({ kind: 'message', id: original.id, role: 'source' }, { bytes: new Uint8Array([3]) }, { format: 'wav', mimeType: 'audio/wav' });
  await chat.deleteConversation(first);
  assert.ok(await history.getConversation(first));
  assert.equal(prompts.length, 1);
  approval = true;
  removalFails = true;
  await chat.deleteConversation(first);
  assert.equal(await history.getConversation(first), null);
  assert.match(chat.getState().notice, /cleanup is still pending/);
  assert.equal(db.prepare("SELECT source_message_id FROM phrasebook_entries WHERE id='saved-phrase'").get().source_message_id, null);
  assert.ok(files.has(asset.file_name));
  removalFails = false;
  await chat.retryStorageCleanup();
  assert.equal(chat.getState().maintenancePending, false);
  assert.equal(files.size, 1, 'Only independently retained audio remains');
  assert.equal(chat.getState().conversation.id, second);
  // Last deletion must not recreate a conversation on restart.
  db.prepare("DELETE FROM conversations WHERE id LIKE 'paged-%'").run();
  await chat.deleteConversation(second);
  assert.equal(chat.getState().conversation, null);
  const restarted = controller();
  await restarted.initialize();
  assert.equal(restarted.getState().conversation, null);
  assert.equal(await restarted.send('No active conversation'), false);
  await restarted.newConversation();
  assert.equal(restarted.getState().myLanguage, 'en');
  assert.equal(restarted.getState().theirLanguage, 'ar');
  await history.createConversation({ id: 'saved-single', title: 'Saved voice mode', originMode: 'single', myLanguage: 'en', theirLanguage: 'fa' });
  await restarted.openConversation('saved-single');
  assert.equal(await restarted.send('Read only'), false);
  assert.equal(await restarted.setLanguages('fr', 'es'), false);
  assert.match(restarted.getState().error, /read-only/);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  console.log('PASS native chat history: language snapshots/retry, restart/offline preferences, search, 200+ pagination, action guards, deletion confirmation, retained Phrasebook/audio and cleanup retry');
} finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
