import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
const transportModule = await import('../mobile/src/adapters/processingTransport.ts');
const { createProcessingTransport, ProcessingApiError } = transportModule.default ?? transportModule;

const calls = [];
let reply = new Response('{"translatedText":"Hola"}', { headers: { 'Content-Type': 'application/json' } });
const adapter = createProcessingTransport(path => `https://api.stringphone.ai${path}`, async (url, options) => {
  calls.push({ url, options });
  return reply;
});
const controller = new AbortController();
await adapter.post('/chat/messages/text', {
  text: 'Hello', sourceLanguage: 'en', targetLanguage: 'es',
  localConversationId: 'local', conversationId: 'web', userId: 'user', localMessageId: 'message',
}, controller.signal);
assert.equal(calls[0].url, 'https://api.stringphone.ai/chat/messages/text');
assert.equal(calls[0].options.signal, controller.signal);
assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'Hello', sourceLanguage: 'en', targetLanguage: 'es' });
assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
reply = new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'audio/wav' } });
const speech = await adapter.post('/speech/output', { text: 'Hola', language: 'es', speechVoice: 'onyx', conversationId: 'local' });
assert.deepEqual(new Uint8Array(await speech.arrayBuffer()), new Uint8Array([82, 73, 70, 70]));
assert.deepEqual(JSON.parse(calls[1].options.body), { text: 'Hola', language: 'es', speechVoice: 'onyx' });
for (const [response, status, message] of [
  [new Response('{"error":"text is required"}', { status: 400 }), 400, 'text is required'],
  [new Response('<html>Proxy failure</html>', { status: 502 }), 502, 'Request failed (502).'],
]) {
  reply = response;
  await assert.rejects(adapter.post('/chat/messages/text', { text: '', sourceLanguage: 'en', targetLanguage: 'es' }),
    error => error instanceof ProcessingApiError && error.status === status && error.message === message);
}
const before = calls.length;
await assert.rejects(adapter.post('/conversations', {}), /Unsupported/);
await assert.rejects(adapter.post('/chat/messages/text', { text: {}, sourceLanguage: 'en', targetLanguage: 'es' }), /must be a string/);
assert.equal(calls.length, before);
const networkError = new TypeError('Network request failed');
const offline = createProcessingTransport(x => x, async () => { throw networkError; });
await assert.rejects(offline.post('/speech/output', { text: 'Hola', language: 'es' }), error => error === networkError);

// Recursively protect native source from accidental web/server dependency copies.
function checkDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) { checkDirectory(path); continue; }
    if (!/\.tsx?$/.test(entry.name)) continue;
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["'][^"']*(?:client\/|src\/(?:lib|services|db)\/|\.css["'])/);
    assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|MediaRecorder|RTCPeerConnection|document\.querySelector|window\.)\b/);
  }
}
checkDirectory(new URL('../mobile/src/', import.meta.url));
console.log('Mobile adapter checks passed: allowlists, binary responses, errors, cancellation forwarding and source boundaries.');
