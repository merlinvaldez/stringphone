// Validation-only probes: no successful AI requests, credentials or database writes.
// Run with node --import tsx scripts/verify-mobile-api-contract.mjs [--base-url URL].
import assert from 'node:assert/strict';

const baseIndex = process.argv.indexOf('--base-url');
const baseUrl = baseIndex === -1 ? null : process.argv[baseIndex + 1];
if (baseIndex !== -1 && !baseUrl) throw new Error('--base-url needs a URL');
const handlers = baseUrl ? null : {
  '/chat/messages/text': (await import('../api/chat/messages/text.ts')).default,
  '/chat/messages/voice': (await import('../api/chat/messages/voice.ts')).default,
  '/speech/output': (await import('../api/speech/output.ts')).default,
  '/chat/messages/live-translation': (await import('../api/chat/messages/live-translation.ts')).default,
};
const pair = { sourceLanguage: 'en', targetLanguage: 'es' };
const cases = [
  ['empty text', '/chat/messages/text', { ...pair, text: ' ' }, 400, 'text is required'],
  ['unsupported source', '/chat/messages/text', { ...pair, text: 'Hello', sourceLanguage: 'invalid' }, 400, 'sourceLanguage is not supported'],
  ['unsupported target', '/chat/messages/text', { ...pair, text: 'Hello', targetLanguage: 'invalid' }, 400, 'targetLanguage is not supported'],
  ['missing voice file', '/chat/messages/voice', pair, 400, 'sourceAudio file is required'],
  ['empty speech', '/speech/output', { text: '', language: 'es' }, 400, 'text is required'],
  ['speech over 500 characters', '/speech/output', { text: 'a'.repeat(501), language: 'es' }, 400, 'text must be 500 characters or fewer'],
  ['unsupported speech language', '/speech/output', { text: 'Hola', language: 'invalid' }, 400, 'language is not supported'],
  ['unsupported speech voice', '/speech/output', { text: 'Hola', language: 'es', speechVoice: 'invalid' }, 400, 'speechVoice is not supported'],
  ['missing utterance ID', '/chat/messages/live-translation', pair, 400, 'utteranceId is required'],
  ['invalid revision', '/chat/messages/live-translation', { ...pair, utteranceId: 'audit', revision: 0 }, 400, 'revision must be a positive integer'],
  ['no live speech', '/chat/messages/live-translation', { ...pair, utteranceId: 'audit', revision: 1, transcript: '' }, 422, 'No speech was detected'],
];
for (const [name, path, input, status, error] of cases) {
  const multipart = path.endsWith('/voice');
  const form = new FormData();
  if (multipart) for (const [key, value] of Object.entries(input)) form.append(key, value);
  const request = new Request(`${(baseUrl ?? 'https://audit.invalid').replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: multipart ? undefined : { 'Content-Type': 'application/json' },
    body: multipart ? form : JSON.stringify(input),
    signal: AbortSignal.timeout(15000),
  });
  const response = baseUrl ? await fetch(request) : await handlers[path].fetch(request);
  assert.equal(response.status, status, name);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/, name);
  assert.equal((await response.json()).error, error, name);
  console.log(`PASS ${name}: ${status}, JSON error`);
}
console.log(`Passed ${cases.length} validation probes (${baseUrl ? 'HTTP' : 'Vercel handlers invoked locally'}). No AI processing requested.`);
