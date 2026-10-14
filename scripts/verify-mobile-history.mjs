import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, writeFileSync, statSync, existsSync, unlinkSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import audioModule from '../mobile/src/storage/audio.ts';
import historyModule from '../mobile/src/storage/history.ts';
import processingModule from '../mobile/src/storage/processing.ts';
import deletionModule from '../mobile/src/storage/deletion.ts';
import migrations from '../mobile/src/storage/migrations.ts';
const { historyMigrations, migrateHistoryDatabase } = migrations;

const directory = mkdtempSync(join(tmpdir(), 'stringphone-audio-'));
const databasePath = join(directory, 'history.db');
let db = new DatabaseSync(databasePath);
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
  // Seed the previous schema to exercise a genuine upgrade without losing history.
  db.exec(historyMigrations[0].sql);
  db.exec('PRAGMA user_version = 1');
  db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?)').run('c', 'Hola', 'chat', 'en', 'es', 1, 1);
  db.prepare(`INSERT INTO messages (id,conversation_id,speaker,origin_mode,source_language,target_language,original_text,request_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run('m','c','me','chat','en','es','Hello','r',1,1);
  db.prepare(`INSERT INTO phrasebook_entries (id,source_message_id,source_language,target_language,original_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run('p','m','en','es','Hello',1,1);
  db.prepare('INSERT INTO preferences VALUES (?,?,?)').run('voice','"marin"',1);
  await migrateHistoryDatabase(connection);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 1);
  let sequence = 0;
  const files = {
    async list() { return readdirSync(directory); },
    async save(name, input) { writeFileSync(join(directory,name), input.bytes); return input.bytes.length; },
    async stat(name) { const path = join(directory,name); return existsSync(path) ? { uri: path, size: statSync(path).size } : null; },
    async remove(name) { if (existsSync(join(directory,name))) unlinkSync(join(directory,name)); },
  };
  const audio = audioModule.createAudioStorage(connection, files, () => `audio_${++sequence}`);
  const owner = { kind: 'message', id: 'm', role: 'source' };
  await audio.save(owner, { bytes: new Uint8Array([1,2,3]) }, { format: 'wav', mimeType: 'audio/wav', durationMs: 100 });
  await assert.rejects(audio.save(owner, { bytes: new Uint8Array([4]) }, { format: 'wav', mimeType: 'audio/wav' }));
  assert.equal(existsSync(join(directory,'audio_2.wav')), false);
  const failedAudio = audioModule.createAudioStorage(connection, { ...files, async save() { throw new Error('disk full'); } }, () => 'failed');
  await assert.rejects(failedAudio.save({ ...owner, role: 'translated' }, { bytes: new Uint8Array([1]) }, { format: 'wav', mimeType: 'audio/wav' }), /disk full/);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audio_assets').get().n, 1);
  db.close();
  db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON');
  await migrateHistoryDatabase(connection);
  assert.equal((await audio.resolve(owner)).availability, 'available');
  unlinkSync(join(directory,'audio_1.wav'));
  assert.equal((await audio.resolve(owner)).uri, null);
  assert.equal(db.prepare('SELECT availability FROM audio_assets').get().availability, 'missing');
  let time = 100;
  const history = historyModule.createHistoryRepository(connection, () => time++);
  await history.createConversation({ id: 'repository',title: "Traveler's notes",originMode: 'chat',myLanguage: 'en',theirLanguage: 'es' });
  const pending = { id: 'queued',requestId: 'request-stable',conversationId: 'repository',speaker: 'me',originMode: 'chat',sourceLanguage: 'en',targetLanguage: 'es',originalText: "It's 100% safe; DROP TABLE messages;" };
  assert.equal(await history.queueMessage(pending), 'created');
  assert.equal(await history.queueMessage(pending), 'existing');
  await assert.rejects(history.queueMessage({ ...pending, id: 'duplicate' }), /different input/);
  await assert.rejects(history.queueMessage({ ...pending, originalText: 'changed' }), /different input/);
  assert.equal((await history.listPending()).filter(row => row.id === 'queued').length, 1);
  assert.equal((await history.search('DROP TABLE')).some(row => row.record_id === 'queued'), true);
  assert.deepEqual(await history.search('" OR 1=1 --'), []);
  const parentBefore = db.prepare("SELECT updated_at FROM conversations WHERE id='repository'").get().updated_at;
  // Force the second write to fail and verify the related conversation update rolls back.
  db.exec("CREATE TRIGGER fail_message_insert BEFORE INSERT ON messages WHEN new.id='reject' BEGIN SELECT RAISE(ABORT,'injected write failure'); END;");
  await assert.rejects(history.queueMessage({ ...pending,id:'reject',requestId:'reject-request' }), /injected write failure/);
  assert.equal(db.prepare("SELECT updated_at FROM conversations WHERE id='repository'").get().updated_at,parentBefore);
  assert.equal(await history.getMessage('reject'),null);
  db.exec('DROP TRIGGER fail_message_insert');
  db.close(); db = new DatabaseSync(databasePath); db.exec('PRAGMA foreign_keys=ON');
  assert.equal(await history.queueMessage(pending),'existing');
  assert.equal(await history.finishRequest('queued','wrong-request',{ status:'failed',errorCode:'network',errorMessage:'Offline' }),false);
  assert.equal(await history.finishRequest('queued','request-stable',{ status:'failed',errorCode:'network',errorMessage:'Offline' }),true);
  assert.equal(await history.retryMessage('queued','request-stable'),true);
  assert.equal(await history.retryMessage('queued','request-stable'),false);
  assert.equal(await history.finishRequest('queued','request-stable',{ status:'ready',originalText:pending.originalText,translatedText:'Viaje seguro' }),true);
  assert.equal(await history.finishRequest('queued','request-stable',{ status:'failed',errorCode:'late',errorMessage:'Old failure' }),false);
  assert.equal((await history.search('Viaje seguro'))[0].record_id,'queued');
  assert.equal((await history.listMessages('repository')).length,1);
  assert.equal((await history.listConversations())[0].id,'repository');
  assert.equal((await history.getMessage('queued')).request_id,'request-stable');
  assert.throws(() => history.listMessages('repository',1000),/Limit/);
  db.prepare('DELETE FROM conversations WHERE id=?').run('repository');
  assert.deepEqual(await history.search('Viaje seguro'),[]);
  await history.createConversation({ id:'drafts',title:'Saved drafts',originMode:'chat',myLanguage:'en',theirLanguage:'es' });
  const flow = processingModule.createSavedMessageFlow(history,audio);
  const draft = { ...pending,id:'draft-text',requestId:'draft-request',conversationId:'drafts',originalText:'First draft' };
  await flow.saveTextDraft(draft);
  await flow.saveTextDraft({ ...draft,originalText:'Edited draft' });
  assert.equal((await history.getMessage(draft.id)).status,'draft');
  db.close(); db = new DatabaseSync(databasePath); db.exec('PRAGMA foreign_keys=ON');
  assert.equal((await history.getMessage(draft.id)).original_text,'Edited draft');
  const abandoned = await history.beginAttempt(draft.id);
  assert.equal(abandoned.status,'pending');
  db.close(); db = new DatabaseSync(databasePath); db.exec('PRAGMA foreign_keys=ON');
  assert.equal(await flow.recoverOnStartup(),1);
  assert.equal(await flow.recoverOnStartup(),0);
  assert.equal((await history.getMessage(draft.id)).status,'interrupted');
  let processorCalls = 0;
  assert.equal(await flow.processSaved(draft.id,async ({ message }) => {
    processorCalls++;
    assert.equal(message.original_text,'Edited draft');
    assert.equal(await history.finishRequest(draft.id,draft.requestId,{ status:'ready',originalText:'stale',translatedText:'stale' },abandoned.processing_attempt),false);
    assert.equal(await flow.processSaved(draft.id,async () => { throw new Error('Must not run'); }),'busy');
    return { originalText:message.original_text,translatedText:'Borrador editado' };
  }),'ready');
  assert.equal(processorCalls,1);
  assert.equal(await flow.processSaved(draft.id,async () => { throw new Error('Must not resend'); }),'not-claimed');
  await assert.rejects(flow.saveTextDraft(draft),/Only a draft/);
  const voiceDraft = { ...draft,id:'draft-voice',requestId:'voice-request',originalText:'' };
  await flow.saveVoiceDraft(voiceDraft,{ bytes:new Uint8Array([10,11]) },{ format:'wav',mimeType:'audio/wav',durationMs:200 });
  db.close(); db = new DatabaseSync(databasePath); db.exec('PRAGMA foreign_keys=ON');
  await assert.rejects(flow.processSaved(voiceDraft.id,async ({ sourceAudio }) => {
    assert.ok(sourceAudio.uri);
    throw new Error('offline');
  }),/offline/);
  assert.equal((await history.getMessage(voiceDraft.id)).status,'failed');
  assert.equal((await audio.resolve({ kind:'message',id:voiceDraft.id,role:'source' })).availability,'available');
  assert.equal(await flow.processSaved(voiceDraft.id,async () => ({ originalText:'Hello',translatedText:'Hola' })),'ready');
  const unsaved = { ...draft,id:'unsaved-voice',requestId:'unsaved-request',originalText:'' };
  const failingFlow = processingModule.createSavedMessageFlow(history,failedAudio);
  await assert.rejects(failingFlow.saveVoiceDraft(unsaved,{ bytes:new Uint8Array([1]) },{ format:'wav',mimeType:'audio/wav' }),/disk full/);
  await assert.rejects(failingFlow.processSaved(unsaved.id,async () => { processorCalls++; throw new Error('Must not dispatch'); }),/unavailable/);
  assert.equal(processorCalls,1);
  assert.equal((await history.getMessage(unsaved.id)).status,'draft');
  const voiceOwner = { kind:'message',id:voiceDraft.id,role:'source' };
  const retainedVoice = await audio.resolve(voiceOwner);
  const beforeAssets = db.prepare('SELECT count(*) AS n FROM audio_assets').get().n;
  // Duplicate generated IDs must never remove an existing playable file.
  const collision = audioModule.createAudioStorage(connection,files,() => retainedVoice.id);
  await assert.rejects(collision.save({ ...voiceOwner,role:'translated' },{ bytes:new Uint8Array([4]) },{ format:'wav',mimeType:'audio/wav' }),/already exists/);
  assert.ok(existsSync(retainedVoice.uri));
  assert.equal(db.prepare('SELECT count(*) AS n FROM audio_assets').get().n,beforeAssets);
  writeFileSync(join(directory,'crash_orphan.wav'),new Uint8Array([9]));
  writeFileSync(join(directory,'keep-me.txt'),'unmanaged');
  const cleanup = await audio.reconcile();
  assert.equal(cleanup.failures.length,0);
  assert.ok(cleanup.removedFiles >= 1);
  assert.equal(existsSync(join(directory,'crash_orphan.wav')),false);
  assert.equal(existsSync(join(directory,'keep-me.txt')),true);
  assert.ok(existsSync(retainedVoice.uri));
  // Missing/mismatched retained files stay linked and leave text untouched.
  writeFileSync(retainedVoice.uri,new Uint8Array([1]));
  assert.equal((await audio.reconcile()).missingAssets,2);
  assert.equal((await audio.resolve(voiceOwner)).uri,null);
  assert.equal((await history.getMessage(voiceDraft.id)).translated_text,'Hola');
  writeFileSync(retainedVoice.uri,new Uint8Array([10,11]));
  assert.equal((await audio.resolve(voiceOwner)).availability,'available');
  // A phrasebook link alone retains audio after its message/conversation is deleted.
  db.prepare('INSERT INTO phrasebook_audio VALUES (?,?,?)').run('p','source',retainedVoice.id);
  db.prepare('DELETE FROM conversations WHERE id=?').run('drafts');
  await audio.reconcile();
  // Interrupted partial writes may leave untracked files, but never playable rows.
  const partial = audioModule.createAudioStorage(connection,{ ...files,async save(name) { writeFileSync(join(directory,name),new Uint8Array([1])); throw new Error('ENOSPC'); } },() => 'partial_write');
  await assert.rejects(partial.save({ kind:'message',id:'m',role:'translated' },{ bytes:new Uint8Array([1,2]) },{ format:'wav',mimeType:'audio/wav' }),error => error.code === 'storage_full');
  assert.equal(db.prepare("SELECT id FROM audio_assets WHERE id='partial_write'").get(),undefined);
  assert.ok(existsSync(join(directory,'partial_write.wav')));
  await audio.reconcile();
  assert.equal(existsSync(join(directory,'partial_write.wav')),false);
  assert.ok(existsSync(retainedVoice.uri));
  db.prepare('DELETE FROM phrasebook_audio WHERE audio_id=?').run(retainedVoice.id);
  const denied = audioModule.createAudioStorage(connection,{ ...files,async remove(name) { if (name === retainedVoice.file_name) throw new Error('delete denied'); return files.remove(name); } },() => 'unused');
  assert.equal((await denied.reconcile()).failures.some(f => f.error === 'delete denied'),true);
  assert.ok(existsSync(retainedVoice.uri));
  assert.ok(db.prepare('SELECT id FROM audio_assets WHERE id=?').get(retainedVoice.id));
  await audio.reconcile();
  assert.equal(existsSync(retainedVoice.uri),false);
  assert.equal(db.prepare('SELECT id FROM audio_assets WHERE id=?').get(retainedVoice.id),undefined);
  writeFileSync(join(directory,'listing_failure.wav'),new Uint8Array([1]));
  const unlistable = audioModule.createAudioStorage(connection,{ ...files,async list() { throw new Error('cannot list'); } },() => 'unused');
  await assert.rejects(unlistable.reconcile(),/cannot list/);
  assert.ok(existsSync(join(directory,'listing_failure.wav')));
  await audio.reconcile();
  await history.createConversation({ id:'delete-conversation',title:'Remove me',originMode:'chat',myLanguage:'en',theirLanguage:'es' });
  await history.queueMessage({ ...pending,id:'delete-message',requestId:'delete-request',conversationId:'delete-conversation',originalText:'large saved transcript '.repeat(50000) });
  db.prepare(`INSERT INTO phrasebook_entries (id,source_message_id,source_language,target_language,original_text,translated_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).run('delete-phrase','delete-message','en','es','Keep copied phrase','Guardar',1,1);
  await audio.save({ kind:'message',id:'delete-message',role:'source' },{ bytes:new Uint8Array([8,9]) },{ format:'wav',mimeType:'audio/wav' });
  await audio.save({ kind:'message',id:'delete-message',role:'translated' },{ bytes:new Uint8Array([3,4]) },{ format:'wav',mimeType:'audio/wav' });
  const shared = await audio.resolve({ kind:'message',id:'delete-message',role:'source' });
  const exclusive = await audio.resolve({ kind:'message',id:'delete-message',role:'translated' });
  db.prepare('INSERT INTO phrasebook_audio VALUES (?,?,?)').run('delete-phrase','source',shared.id);
  const cancelled = deletionModule.createDeletionService(connection,audio,async prompt => { assert.match(prompt.message,/cannot be undone/); return false; });
  assert.equal((await cancelled.delete({ kind:'conversation',id:'delete-conversation' })).status,'cancelled');
  assert.ok(await history.getMessage('delete-message'));
  assert.ok(existsSync(exclusive.uri));
  const changed = deletionModule.createDeletionService(connection,audio,async () => { db.prepare('UPDATE conversations SET updated_at=updated_at+1 WHERE id=?').run('delete-conversation'); return true; });
  assert.equal((await changed.delete({ kind:'conversation',id:'delete-conversation' })).status,'changed');
  assert.ok(await history.getMessage('delete-message'));
  const deleteService = deletionModule.createDeletionService(connection,audio,async () => true);
  db.exec("CREATE TRIGGER refuse_delete BEFORE DELETE ON conversations WHEN old.id='delete-conversation' BEGIN SELECT RAISE(ABORT,'delete failed'); END;");
  await assert.rejects(deleteService.delete({ kind:'conversation',id:'delete-conversation' }),/delete failed/);
  assert.ok(await history.getMessage('delete-message'));
  assert.ok(existsSync(exclusive.uri));
  db.exec('DROP TRIGGER refuse_delete');
  const beforeSize = statSync(databasePath).size;
  const deletion = await deleteService.delete({ kind:'conversation',id:'delete-conversation' });
  assert.equal(deletion.status,'deleted');
  assert.equal(deletion.compacted,true);
  assert.deepEqual(deletion.maintenanceErrors,[]);
  assert.equal(await history.getMessage('delete-message'),null);
  assert.ok(statSync(databasePath).size < beforeSize);
  assert.equal(existsSync(exclusive.uri),false);
  assert.ok(existsSync(shared.uri));
  assert.equal(db.prepare('SELECT source_message_id FROM phrasebook_entries WHERE id=?').get('delete-phrase').source_message_id,null);
  assert.equal(db.prepare('SELECT original_text FROM phrasebook_entries WHERE id=?').get('delete-phrase').original_text,'Keep copied phrase');
  assert.equal(await history.finishRequest('delete-message','delete-request',{ status:'ready',originalText:'late',translatedText:'late' },1),false);
  let maintenanceFails = true;
  const failingDeleteAudio = audioModule.createAudioStorage(connection,{ ...files,async remove(name) { if (maintenanceFails && name === shared.file_name) throw new Error('file in use'); return files.remove(name); } },() => 'unused');
  const compactConnection = { ...connection,async execAsync(sql) { if (maintenanceFails && sql === 'VACUUM;') throw new Error('not enough disk space'); return connection.execAsync(sql); } };
  const partialDeletionService = deletionModule.createDeletionService(compactConnection,failingDeleteAudio,async () => true);
  const partialDeletion = await partialDeletionService.delete({ kind:'phrase',id:'delete-phrase' });
  assert.equal(partialDeletion.status,'deleted');
  assert.equal(partialDeletion.compacted,false);
  assert.equal(partialDeletion.cleanup.failures[0].error,'file in use');
  assert.deepEqual(partialDeletion.maintenanceErrors,['not enough disk space']);
  assert.ok(existsSync(shared.uri));
  maintenanceFails = false;
  assert.equal((await partialDeletionService.retryMaintenance()).compacted,true);
  assert.equal(existsSync(shared.uri),false);
  assert.equal((await deleteService.delete({ kind:'phrase',id:'delete-phrase' })).status,'missing');
  assert.throws(() => db.prepare('UPDATE messages SET speaker = ?').run('unknown'));
  assert.throws(() => db.prepare('UPDATE messages SET conversation_id = ?').run('missing'));
  assert.throws(() => db.prepare('UPDATE preferences SET value_json = ?').run('invalid'));
  db.prepare('DELETE FROM conversations WHERE id = ?').run('c');
  assert.equal(db.prepare('SELECT count(*) AS n FROM messages').get().n, 0);
  assert.equal(db.prepare('SELECT source_message_id FROM phrasebook_entries').get().source_message_id, null);
  assert.equal(db.prepare('SELECT original_text FROM phrasebook_entries').get().original_text, 'Hello');
  db.exec('PRAGMA user_version = 99');
  await assert.rejects(migrateHistoryDatabase(connection), /newer app/);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 99);
  db.exec('PRAGMA user_version = 0');
  const failureDb = new DatabaseSync(':memory:');
  failureDb.exec("CREATE TABLE preserved_history (text TEXT); INSERT INTO preserved_history VALUES ('keep existing history');");
  const failureConnection = {
    async execAsync(sql) { failureDb.exec(sql); throw new Error('disk failure'); },
    async getFirstAsync(sql) { return failureDb.prepare(sql).get(); },
    async withExclusiveTransactionAsync(task) {
      failureDb.exec('BEGIN IMMEDIATE');
      try { await task(failureConnection); failureDb.exec('COMMIT'); }
      catch (error) { failureDb.exec('ROLLBACK'); throw error; }
    },
  };
  await assert.rejects(migrateHistoryDatabase(failureConnection), /disk failure/);
  assert.equal(failureDb.prepare('PRAGMA user_version').get().user_version, 0);
  assert.equal(failureDb.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get().n, 1);
  assert.equal(failureDb.prepare('SELECT text FROM preserved_history').get().text,'keep existing history');
  failureDb.close();
  assert.equal(historyMigrations.length, 4);
  console.log('History/audio checks passed: migrations, disk restart, audio recovery, indexed queries, retries, confirmed deletion, shared ownership, actual compaction and maintenance failures.');
} finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
