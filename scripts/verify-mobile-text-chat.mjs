import assert from 'node:assert/strict';
const transportModule = await import('../mobile/src/adapters/processingTransport.ts');
const { createProcessingTransport, ProcessingApiError } = transportModule.default ?? transportModule;
const chatModule = await import('../mobile/src/adapters/textChat.ts');
const { createTextChatApi, TextTranslationResponseError } = chatModule.default ?? chatModule;
const configModule = await import('../mobile/src/config/api.ts');
const { resolveApiConfig } = configModule.default ?? configModule;

const { baseUrl } = resolveApiConfig({ environment: 'development', developmentUrl: 'http://192.168.1.20:3000/api/' });
const calls = [];
const valid = {
  originalText: 'Hello', translatedText: 'مرحبا', originalPronunciation: '',
  translatedPronunciation: 'marhaban', sourceLanguage: { code: 'en', label: 'English' },
  targetLanguage: { code: 'ar', label: 'Arabic' },
};
let reply;
let failure;
const api = createTextChatApi(createProcessingTransport(path => `${baseUrl}${path}`, async (url, options) => {
  calls.push({ url, options });
  if (failure) throw failure;
  return reply;
}));
const controller = new AbortController();
const input = { text: 'Hello', sourceLanguage: { code: 'en' }, targetLanguage: { code: 'ar' },
  signal: controller.signal, conversationId: 'web-id', localConversationId: 'phone-id' };
reply = Response.json({ ...valid, ok: true, conversationId: 'unexpected' });
assert.deepEqual(await api.translateTextMessage(input), valid);
assert.equal(calls[0].url, 'http://192.168.1.20:3000/api/chat/messages/text');
assert.equal(calls[0].options.method, 'POST');
assert.equal(calls[0].options.signal, controller.signal);
assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'Hello', sourceLanguage: 'en', targetLanguage: 'ar' });
for (const body of [null, [], { ...valid, translatedText: null }, { ...valid, translatedPronunciation: undefined },
  { ...valid, targetLanguage: { code: 'es', label: 'Spanish' } }]) {
  reply = Response.json(body);
  await assert.rejects(api.translateTextMessage(input), TextTranslationResponseError);
}
reply = new Response('<html>Sign in</html>');
await assert.rejects(api.translateTextMessage(input), TextTranslationResponseError);
reply = Response.json({ error: 'sourceLanguage is not supported' }, { status: 400 });
await assert.rejects(api.translateTextMessage(input), error => error instanceof ProcessingApiError && error.status === 400);
reply = new Response('Gateway failure', { status: 502 });
await assert.rejects(api.translateTextMessage(input), /Request failed \(502\)/);
for (const error of [new TypeError('Network request failed'), new DOMException('Aborted', 'AbortError')]) {
  failure = error;
  const before = calls.length;
  await assert.rejects(api.translateTextMessage(input), actual => actual === error);
  assert.equal(calls.length, before + 1, 'No automatic retries');
}
console.log('Mobile text chat checks passed: absolute URL, identity exclusion, language/pronunciation mapping, malformed responses, HTTP/network/abort errors.');
