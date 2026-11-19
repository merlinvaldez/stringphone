// Runs real processing orchestration with isolated DB/provider substitutes.
// No credentials, network access, or database connection required.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const calls = [];
const logs = [];
let fail = false;
const secret = 'PRIVATE_TRANSCRIPT_TOKEN_PROVIDER_BODY';
const provider = async () => {
  if (fail) throw new Error(secret);
  return 'Hola';
};
const db = Object.fromEntries(['getConversation', 'createMessage', 'updateConversationLanguages'].map(name => [name,
  async () => { calls.push(name); return { id: 'web-message' }; }]));
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file);
  const exports = {};
  cache.set(file, exports);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = specifier => {
    if (specifier.endsWith('/openai.js')) return { createOpenAiResponse: provider };
    if (specifier.includes('db/queries/conversations')) return db;
    if (specifier.includes('refreshConversationTitle')) return { refreshConversationTitle: async () => calls.push('title') };
    if (specifier.includes('services/translateText')) return { translateText: provider };
    if (specifier.includes('services/transcribeAudio')) return { transcribeAudio: provider };
    if (specifier.includes('services/translateLiveDraft')) return { translateLiveDraft: provider };
    if (specifier.includes('services/classifyLiveSegmentLanguage')) return { classifyLiveSegmentLanguage: async () => ({ languageCode: 'en', confidence: 1 }) };
    if (specifier.endsWith('runSpeechTranslation.js')) return { runSpeechTranslation: async () => ({ ok: true, transcript: 'Hello', translation: await provider(), audioBuffer: Buffer.from('audio') }) };
    if (specifier.includes('services/synthesize')) throw new Error('Unexpected speech dependency');
    assert.ok(specifier.startsWith('.'), `Unexpected external dependency: ${specifier}`);
    const target = resolve(dirname(file), specifier.replace(/\.js$/, '.ts') + (/\.(js|ts)$/.test(specifier) ? '' : '.ts'));
    return load(existsSync(target) ? target : target.replace(/\.ts$/, '.js'));
  };
  vm.runInNewContext(code, { exports, require, Buffer, Response, console: {
    error: (...args) => logs.push(args), warn: (...args) => logs.push(args),
  } }, { filename: file });
  return exports;
}
const { runTextChatMessage } = load('src/lib/runTextChatMessage.ts');
const { runVoiceChatMessage } = load('src/lib/runVoiceChatMessage.ts');
const { runLiveConversationSegment } = load('src/lib/runLiveConversationSegment.ts');
const { runLiveConversationTranscript } = load('src/lib/runLiveConversationTranscript.ts');
const pair = { sourceLanguage: 'en', targetLanguage: 'es' };
const sourceAudioFile = { buffer: Buffer.from('recording'), filename: 'turn.m4a' };
for (const userId of [null, 7]) {
  calls.length = 0;
  assert.equal((await runTextChatMessage({ ...pair, text: 'Hello' })).ok, true);
  assert.equal((await runVoiceChatMessage({ ...pair, sourceAudioFile })).ok, true);
  assert.equal((await runLiveConversationSegment({ ...pair, sourceAudioFile, userId })).savedMessage, null);
  const result = await runLiveConversationTranscript({ ...pair, userId, utteranceId: 'turn', revision: 1,
    transcript: 'Hello', translatedText: 'Hola', liveMode: 'realtime-translation', sourceAudioFile });
  assert.equal(result.ok, true);
  assert.equal(result.savedMessage, null);
  assert.deepEqual(calls, [], 'Processing without web conversation ID must never touch history, even with auth');
}
for (const runner of [runLiveConversationSegment, runLiveConversationTranscript]) {
  calls.length = 0;
  const input = { ...pair, conversationId: 'web-conversation', sourceAudioFile, utteranceId: 'turn', revision: 1,
    transcript: 'Hello', translatedText: 'Hola', liveMode: 'realtime-translation' };
  assert.equal((await runner(input)).status, 401);
  assert.deepEqual(calls, []);
  assert.equal((await runner({ ...input, userId: 7 })).savedMessage.id, 'web-message');
  assert.ok(calls.includes('createMessage'), 'Authenticated web history must remain supported');
}
fail = true;
await assert.rejects(runTextChatMessage({ ...pair, text: secret }), /PRIVATE/);
await runLiveConversationTranscript({ sourceLanguage: 'en', targetLanguage: 'ar',
  utteranceId: 'private-turn', revision: 1, transcript: secret, translatedText: secret,
  liveMode: 'realtime-translation' });
assert.ok(logs.length > 0, 'Exercise pronunciation failure diagnostics');
const handler = load('api/chat/messages/text.ts').default;
const response = await handler.fetch(new Request('https://audit.invalid/chat/messages/text', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pair, text: secret }),
}));
assert.equal(response.status, 502);
assert.deepEqual(await response.json(), { error: 'Text chat translation failed' });
assert.ok(!JSON.stringify(logs).includes(secret));
// Guard every reachable processing diagnostic: only fixed literal messages.
const files = ['src/lib/runTextChatMessage.ts', 'src/lib/runVoiceChatMessage.ts',
  'src/lib/runLiveConversationSegment.ts', 'src/lib/runLiveConversationTranscript.ts',
  'src/lib/createLiveTranscriptionClientSecret.ts', 'src/services/generatePronunciationGuidance.ts',
  'src/services/classifyLiveSegmentLanguage.ts', 'src/services/translateLiveDraft.ts',
  'src/services/refreshConversationTitle.ts', 'src/auth/vercel.ts', 'src/db/client.ts',
  'src/db/queries/conversations.ts', 'api/speech/output.ts', 'api/chat/live-transcription/token.ts',
  ...['text', 'voice', 'live-segment', 'live-transcript', 'live-translation'].map(name => `api/chat/messages/${name}.ts`)];
for (const file of files) {
  for (const match of readFileSync(file, 'utf8').matchAll(/console\.(?:error|warn|log)\(([\s\S]*?)\);/g)) {
    assert.match(match[1], /^"[^"\n]*"$/, `Sensitive diagnostic arguments in ${file}`);
  }
}
const expressProcessing = readFileSync('src/server.ts', 'utf8').split('app.post("/chat/messages/text"')[1];
for (const match of expressProcessing.matchAll(/console\.error\(([\s\S]*?)\);/g)) {
  assert.match(match[1], /^"[^"\n]*"$/, 'Sensitive Express processing diagnostic');
}
console.log('PASS processing-only text/voice/live, authenticated web persistence, and fixed-message logging audit');
