import assert from 'node:assert/strict';
import transportModule from '../mobile/src/adapters/processingTransport.ts';
import voiceModule from '../mobile/src/adapters/voiceChat.ts';
import processorModule from '../mobile/src/storage/voiceProcessing.ts';
const { createProcessingTransport, ProcessingApiError } = transportModule;
const { createVoiceChatApi } = voiceModule;
const { createVoiceMessageProcessor } = processorModule;
let call;
let uploadCall;
const payload = { transcript: 'Hello', translatedText: 'Hola', originalPronunciation: '', translatedPronunciation: '', sourceLanguage: { code: 'en', label: 'English' }, targetLanguage: { code: 'es', label: 'Spanish' }, sourceAudio: { mimeType: 'audio/mp4', base64: 'AQID' }, audio: { mimeType: 'audio/wav', base64: 'BAUG' } };
let uploadResult = { body: JSON.stringify(payload), status: 200, headers: { 'Content-Type': 'application/json' } };
const api = createVoiceChatApi(createProcessingTransport(
  path => `https://test.invalid/api${path}`,
  async (url, options) => { call = { url, ...options }; return Response.json(payload); },
  async uri => ({
    exists: true,
    size: 3,
    async upload(url, options) { uploadCall = { uri, url, options }; return uploadResult; },
  }),
));
const signal = new AbortController().signal;
const input = { uri: 'file:///document/saved.m4a', mimeType: 'audio/mp4', filename: 'saved.m4a', sourceLanguage: 'en', targetLanguage: 'es', conversationId: 'never-upload', signal };
const result = await api.translateVoiceMessage(input);
assert.equal(call, undefined, 'voice upload must use the native file uploader instead of fetch/FormData');
assert.equal(uploadCall.uri, input.uri);
assert.equal(uploadCall.url, 'https://test.invalid/api/chat/messages/voice');
assert.equal(uploadCall.options.fieldName, 'sourceAudio');
assert.equal(uploadCall.options.mimeType, input.mimeType);
assert.deepEqual(uploadCall.options.parameters, { sourceLanguage: 'en', targetLanguage: 'es' });
assert.equal(uploadCall.options.signal, signal);
assert.deepEqual(result.translatedAudio.bytes, new Uint8Array([4,5,6]));
for (const bad of ['!', '', 'AAAA=']) {
  uploadResult = { ...uploadResult, body: JSON.stringify({ ...payload, audio: { mimeType: 'audio/wav', base64: bad } }) };
  await assert.rejects(api.translateVoiceMessage(input), /invalid voice/);
}
uploadResult = { body: 'proxy', status: 413, headers: { 'Content-Type': 'text/plain' } };
await assert.rejects(api.translateVoiceMessage(input), error => error instanceof ProcessingApiError && error.status === 413);
uploadResult = { body: JSON.stringify(payload), status: 200, headers: { 'Content-Type': 'application/json' } };
let saved;
const audio = { resolve: async () => null, save: async (...args) => { saved = args; } };
const processor = createVoiceMessageProcessor(audio, api.translateVoiceMessage);
const durableInput = { message: { id: 'local-message', source_language: 'en', target_language: 'es' }, sourceAudio: { uri: input.uri, availability: 'available', mime_type: 'audio/mp4', file_name: 'saved.m4a', byte_size: 3 } };
const text = await processor(durableInput, signal);
assert.deepEqual(saved[0], { kind: 'message', id: 'local-message', role: 'translated' });
assert.deepEqual(saved[1].bytes, new Uint8Array([4,5,6]));
assert.equal(JSON.stringify(text).includes('base64'), false);
assert.equal(text.originalText, 'Hello');
for (const [change, expected] of [[{ byte_size: 0 }, /empty/], [{ byte_size: 3000001 }, /3 MB/], [{ mime_type: 'application/octet-stream' }, /Unsupported/]]) {
  await assert.rejects(processor({ ...durableInput, sourceAudio: { ...durableInput.sourceAudio, ...change } }, signal), expected);
}
audio.save = async () => { throw new Error('disk full'); };
await assert.rejects(processor(durableInput, signal), /disk full/);
await assert.rejects(processor({ ...durableInput, sourceAudio: null }, signal), /unavailable/);
console.log('Native voice multipart, decoding and durable output checks passed.');
