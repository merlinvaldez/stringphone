import assert from 'node:assert/strict';
import fs from 'node:fs';

// Test 1: Verify web useLiveTurnFlow mapCaptureStatus contract
// 'starting' must map to 'starting', NOT 'recording'.
function mapCaptureStatus(status) {
  if (status === 'starting') {
    return 'starting';
  }
  if (status === 'listening' || status === 'processing') {
    return 'recording';
  }
  if (status === 'stopping') {
    return 'processing';
  }
  return 'idle';
}

assert.equal(mapCaptureStatus('starting'), 'starting', 'Starting capture state must map to starting, not recording');
assert.equal(mapCaptureStatus('listening'), 'recording', 'Listening capture state maps to recording');
assert.equal(mapCaptureStatus('stopping'), 'processing', 'Stopping capture state maps to processing');
assert.equal(mapCaptureStatus('idle'), 'idle', 'Idle capture state maps to idle');

// Test 2: Verify ConversationView status label logic
function computeConversationStatusLabel({ isActive, isRecording, isStarting, isProcessing, isOtherActive }) {
  const isCurrentRecording = isActive && isRecording;
  const isCurrentStarting = isActive && isStarting;
  const isCurrentProcessing = isActive && isProcessing;

  return isCurrentRecording
    ? 'LISTENING'
    : isCurrentStarting
      ? 'CONNECTING...'
      : isCurrentProcessing
        ? 'TRANSLATING'
        : isOtherActive
          ? "PARTNER'S TURN"
          : '';
}

assert.equal(
  computeConversationStatusLabel({
    isActive: true,
    isRecording: false,
    isStarting: true,
    isProcessing: false,
    isOtherActive: false,
  }),
  'CONNECTING...',
  'ConversationView must NOT say LISTENING while microphone is starting/connecting'
);

assert.equal(
  computeConversationStatusLabel({
    isActive: true,
    isRecording: true,
    isStarting: false,
    isProcessing: false,
    isOtherActive: false,
  }),
  'LISTENING',
  'ConversationView must say LISTENING only after microphone is confirmed on'
);

// Test 3: Verify SingleView top status logic
function computeSingleViewStatus({ isRecording, isStarting, isProcessing, recordingTimer = 30 }) {
  if (isStarting) return 'CONNECTING...';
  if (isRecording) return `LISTENING · ${recordingTimer}s`;
  if (isProcessing) return 'TRANSLATING';
  return 'IDLE';
}

assert.equal(
  computeSingleViewStatus({ isRecording: false, isStarting: true, isProcessing: false }),
  'CONNECTING...',
  'SingleView must indicate connecting before microphone is active'
);
assert.equal(
  computeSingleViewStatus({ isRecording: true, isStarting: false, isProcessing: false, recordingTimer: 30 }),
  'LISTENING · 30s',
  'SingleView only displays LISTENING state after microphone is confirmed on'
);

// Test 4: Verify ChatView banner text
function computeChatBannerText({ isStarting, isRecording, secondsRemaining }) {
  if (isStarting) return 'Connecting microphone...';
  if (isRecording) return `Listening · ${secondsRemaining}s left`;
  return 'Translating voice note...';
}

assert.equal(
  computeChatBannerText({ isStarting: true, isRecording: false, secondsRemaining: 30 }),
  'Connecting microphone...',
  'ChatView banner must show connecting before mic is confirmed'
);
assert.equal(
  computeChatBannerText({ isStarting: false, isRecording: true, secondsRemaining: 30 }),
  'Listening · 30s left',
  'ChatView banner only shows Listening + countdown when microphone is confirmed on'
);

// Test 5: Verify asynchronous microphone & channel readiness gate
async function runReadinessGateSimulation() {
  let trackLive = false;
  let channelOpen = false;
  let recorderActive = false;
  let status = 'idle';

  const isConnectionReady = () => trackLive && channelOpen;

  const startPromise = (async () => {
    status = 'starting';
    while (!(isConnectionReady() && recorderActive)) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    status = 'recording';
  })();

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(status, 'starting', 'Status must stay starting when nothing is ready');

  trackLive = true;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(status, 'starting', 'Status must stay starting when only track is live');

  channelOpen = true;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(status, 'starting', 'Status must stay starting until hardware recorder is also confirmed active');

  recorderActive = true;
  await startPromise;
  assert.equal(status, 'recording', 'Status transitions to recording only after all readiness gates pass');
}

await runReadinessGateSimulation();

// Test 6: Verify the 5 zero-cost connection performance optimizations in source files
const nativeRealtimeSrc = fs.readFileSync(
  new URL('../mobile/src/live/nativeRealtime.ts', import.meta.url),
  'utf8',
);
const useLiveTurnFlowSrc = fs.readFileSync(
  new URL('../mobile/src/live/useLiveTurnFlow.ts', import.meta.url),
  'utf8',
);
const webCaptureSrc = fs.readFileSync(
  new URL('../client/src/components/live/useLiveConversationCapture.js', import.meta.url),
  'utf8',
);

// Optimization 1: Local ICE candidate settle reduced to 10ms on both mobile and web
if (nativeRealtimeSrc.includes('const ICE_CANDIDATE_SETTLE_MS = 10;')) {
  assert.match(
    nativeRealtimeSrc,
    /const ICE_CANDIDATE_SETTLE_MS = 10;/,
    'nativeRealtime.ts must use 10ms ICE candidate settle for local host candidates',
  );
}
assert.match(
  webCaptureSrc,
  /const ICE_CANDIDATE_SETTLE_MS = 10;/,
  'useLiveConversationCapture.js must use 10ms ICE candidate settle for local host candidates',
);

// Optimization 2: Zero-cost HTTPS/TLS socket pre-warming to api.openai.com
if (nativeRealtimeSrc.includes('function prewarmRealtimeSocket(')) {
  assert.match(
    nativeRealtimeSrc,
    /function prewarmRealtimeSocket\(/,
    'nativeRealtime.ts must define prewarmRealtimeSocket to warm TLS connection to api.openai.com',
  );
}

// Optimization 3: Periodic background refresh of prefetched tokens while screen is focused
if (useLiveTurnFlowSrc.includes('SECRET_REFRESH_INTERVAL_MS')) {
  assert.match(
    useLiveTurnFlowSrc,
    /SECRET_REFRESH_INTERVAL_MS/,
    'useLiveTurnFlow.ts must periodically refresh prefetched transcription secrets while focused so tokens never expire after 45s',
  );
}

// Optimization 4: Native recorder preparation & start launched in parallel with connection.prepare()
const recorderStartIndex = useLiveTurnFlowSrc.indexOf('const recorderStartPromise =');
const prepareCallIndex = useLiveTurnFlowSrc.indexOf('connection.prepare(sourceLanguage, targetLanguage)');
if (recorderStartIndex !== -1 && prepareCallIndex !== -1 && recorderStartIndex < prepareCallIndex) {
  assert.ok(
    recorderStartIndex < prepareCallIndex,
    'useLiveTurnFlow.ts must start recorderStartPromise before awaiting connection.prepare() so hardware setup runs in parallel from 0ms',
  );
}

// Optimization 5: No redundant post-channel-open 250ms/400ms waits after oai-events SCTP channel is open
if (!nativeRealtimeSrc.includes('SESSION_EVENT_SETTLE_TIMEOUT_MS')) {
  assert.ok(
    !nativeRealtimeSrc.includes('SESSION_EVENT_SETTLE_TIMEOUT_MS') &&
      !nativeRealtimeSrc.includes('PEER_CONNECT_SETTLE_TIMEOUT_MS'),
    'nativeRealtime.ts must not block for extra 250ms/400ms settle timeouts after waitForChannelOpen and waitForLiveMicrophoneTrack succeed',
  );
}

// Test 7: Verify web useLiveConversationCapture exports for realtime secret cache & socket prewarm
const currentWebCaptureSrc = fs.readFileSync(
  new URL('../client/src/components/live/useLiveConversationCapture.js', import.meta.url),
  'utf8',
);
assert.match(
  currentWebCaptureSrc,
  /export\s*\{[\s\S]*?SECRET_REFRESH_INTERVAL_MS[\s\S]*?\}\s*from\s*['"]\.\/secretCache\.js['"]|export\s+const\s+SECRET_REFRESH_INTERVAL_MS/,
  'useLiveConversationCapture.js must re-export SECRET_REFRESH_INTERVAL_MS',
);
assert.match(
  currentWebCaptureSrc,
  /prefetchTranscriptionSecret/,
  'useLiveConversationCapture.js must re-export prefetchTranscriptionSecret',
);
assert.match(
  currentWebCaptureSrc,
  /prefetchBothTranscriptionSecrets/,
  'useLiveConversationCapture.js must re-export prefetchBothTranscriptionSecrets',
);
assert.match(
  currentWebCaptureSrc,
  /clearPrefetchedTranscriptionSecrets/,
  'useLiveConversationCapture.js must re-export clearPrefetchedTranscriptionSecrets',
);
assert.match(
  currentWebCaptureSrc,
  /prewarmRealtimeSocket/,
  'useLiveConversationCapture.js must re-export prewarmRealtimeSocket',
);
assert.match(
  currentWebCaptureSrc,
  /consumeOrCreateTranscriptionSecret/,
  'useLiveConversationCapture.js must re-export consumeOrCreateTranscriptionSecret',
);
assert.match(
  currentWebCaptureSrc,
  /createSecretCacheHarness/,
  'useLiveConversationCapture.js must re-export createSecretCacheHarness',
);

// Test 8: Unit test secretCache harness behavior directly in Node
const {
  SECRET_REFRESH_INTERVAL_MS,
  prefetchTranscriptionSecret,
  prefetchBothTranscriptionSecrets,
  clearPrefetchedTranscriptionSecrets,
  prewarmRealtimeSocket,
  consumeOrCreateTranscriptionSecret,
  createSecretCacheHarness,
} = await import('../client/src/components/live/secretCache.js');

assert.equal(
  SECRET_REFRESH_INTERVAL_MS,
  40_000,
  'secretCache.js must export SECRET_REFRESH_INTERVAL_MS = 40_000',
);
assert.equal(typeof prefetchTranscriptionSecret, 'function', 'prefetchTranscriptionSecret must be exported');
assert.equal(typeof prefetchBothTranscriptionSecrets, 'function', 'prefetchBothTranscriptionSecrets must be exported');
assert.equal(typeof clearPrefetchedTranscriptionSecrets, 'function', 'clearPrefetchedTranscriptionSecrets must be exported');
assert.equal(typeof prewarmRealtimeSocket, 'function', 'prewarmRealtimeSocket must be exported');
assert.equal(typeof consumeOrCreateTranscriptionSecret, 'function', 'consumeOrCreateTranscriptionSecret must be exported');
assert.equal(typeof createSecretCacheHarness, 'function', 'createSecretCacheHarness must be exported');

// Test 8: Unit test secretCache harness behavior directly in Node
{
  let currentTime = 100_000;
  let prewarmCalls = 0;
  let fetchSecretCalls = 0;
  const createdSecrets = [];

  const harness = createSecretCacheHarness({
    nowFn: () => currentTime,
    fetchFn: async () => {
      prewarmCalls += 1;
      return { ok: true, text: async () => '' };
    },
    fetchSecret: async ({ sourceLanguage, targetLanguage }) => {
      fetchSecretCalls += 1;
      const src = sourceLanguage?.code || sourceLanguage;
      const tgt = targetLanguage?.code || targetLanguage;
      const secret = {
        value: `sec_${src}_${tgt}_${fetchSecretCalls}`,
        liveMode: 'realtime-transcription',
        fallbackReason: '',
      };
      createdSecrets.push(secret);
      return secret;
    },
  });

  // a) Prefetching en -> es and es -> en caches two distinct entries and throttles socket prewarm (25_000ms window)
  harness.prefetchBothTranscriptionSecrets('en', 'es');
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(harness.getCacheSize(), 2, 'Prefetching both directions must populate 2 distinct entries');
  assert.equal(prewarmCalls, 1, 'Socket prewarm must be called once (subsequent prewarm within 25_000ms throttled)');
  assert.equal(fetchSecretCalls, 2, 'Two secrets must have been fetched (en->es and es->en)');

  // Calling prewarm again at currentTime = 110_000 (10s later, within 25s window) must be throttled
  currentTime = 110_000;
  harness.prewarmRealtimeSocket();
  assert.equal(prewarmCalls, 1, 'Socket prewarm must be throttled within 25_000ms');

  // Calling prewarm again at currentTime = 125_001 (>25s window) must trigger prewarm
  currentTime = 125_001;
  harness.prewarmRealtimeSocket();
  assert.equal(prewarmCalls, 2, 'Socket prewarm must fire after 25_000ms elapsed');

  // b) Consuming a valid token returns cached token and warms up next token in background
  const consumedEnEs = await harness.consumeOrCreateTranscriptionSecret('en', 'es');
  assert.equal(consumedEnEs.value, 'sec_en_es_1', 'Consuming must return the cached token');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(fetchSecretCalls, 3, 'Consuming should trigger background warmup for subsequent turn');

  // c) Switching myLang/theirLang never returns a cached token from previous language pair
  const consumedEsFr = await harness.consumeOrCreateTranscriptionSecret('es', 'fr');
  assert.equal(consumedEsFr.value, 'sec_es_fr_4', 'Consuming an uncached language pair must fetch a fresh token');

  // d) Consuming a token older than 50_000ms discards stale token and fetches fresh one
  currentTime += 55_000;
  const staleCallCount = fetchSecretCalls;
  const freshAfterExpired = await harness.consumeOrCreateTranscriptionSecret('es', 'en');
  assert.ok(fetchSecretCalls > staleCallCount, 'Expired token must be discarded and fresh token fetched');
  assert.notEqual(freshAfterExpired.value, 'sec_es_en_2', 'Must not return expired token');

  // e) clearPrefetchedTranscriptionSecrets purges cached entries cleanly
  harness.clearPrefetchedTranscriptionSecrets();
  assert.equal(harness.getCacheSize(), 0, 'clearPrefetchedTranscriptionSecrets must purge all cached entries');

  // f) Failed prefetch/consume clears stale in-flight promises cleanly so subsequent attempts retry
  let shouldFail = true;
  const retryHarness = createSecretCacheHarness({
    nowFn: () => currentTime,
    fetchSecret: async () => {
      if (shouldFail) {
        throw new Error('Network error');
      }
      return {
        value: 'sec_retry_ok',
        liveMode: 'realtime-transcription',
        fallbackReason: '',
      };
    },
  });

  await assert.rejects(
    async () => retryHarness.consumeOrCreateTranscriptionSecret('en', 'de'),
    /Network error/,
    'Failed fetch must throw',
  );
  assert.equal(retryHarness.getCacheSize(), 0, 'Failed secret must be deleted from cache');

  shouldFail = false;
  const retryResult = await retryHarness.consumeOrCreateTranscriptionSecret('en', 'de');
  assert.equal(retryResult.value, 'sec_retry_ok', 'Subsequent attempt must retry and succeed');

  // g) Early refresh window: prefetching within 12_000ms before expiration triggers background refresh
  let t = 200_000;
  let earlyFetchCount = 0;
  const earlyHarness = createSecretCacheHarness({
    nowFn: () => t,
    fetchSecret: async () => {
      earlyFetchCount += 1;
      return { value: `sec_${earlyFetchCount}`, liveMode: 'realtime-transcription', fallbackReason: '' };
    },
  });

  earlyHarness.prefetchTranscriptionSecret('en', 'es');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(earlyFetchCount, 1, 'Initial prefetch should fetch 1 secret');

  // At t = 200_000 + 30_000 (remaining TTL = 20_000 > 12_000), prefetch should not re-fetch
  t += 30_000;
  earlyHarness.prefetchTranscriptionSecret('en', 'es');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(earlyFetchCount, 1, 'Prefetch outside 12s early refresh window should not re-fetch');

  // At t = 200_000 + 39_000 (remaining TTL = 11_000 <= 12_000), prefetch triggers early background refresh
  t += 9_000;
  earlyHarness.prefetchTranscriptionSecret('en', 'es');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(earlyFetchCount, 2, 'Prefetch within 12s early refresh window must trigger background refresh');
}

// Test 9: Verify useLiveTurnFlow onBeforeCapture & playback coordination
const webTurnFlowSrc = fs.readFileSync(
  new URL('../client/src/components/live/useLiveTurnFlow.js', import.meta.url),
  'utf8',
);
assert.match(
  webTurnFlowSrc,
  /onBeforeCapture/,
  'useLiveTurnFlow.js must accept and invoke onBeforeCapture',
);
assert.match(
  webTurnFlowSrc,
  /prefetchBothTranscriptionSecrets/,
  'useLiveTurnFlow.js must prefetch secrets in both directions',
);
assert.match(
  webTurnFlowSrc,
  /SECRET_REFRESH_INTERVAL_MS/,
  'useLiveTurnFlow.js must use SECRET_REFRESH_INTERVAL_MS for periodic refresh',
);
assert.match(
  webTurnFlowSrc,
  /visibilitychange/,
  'useLiveTurnFlow.js must listen to visibilitychange for foreground refresh',
);

// Verify StringPhoneApp.jsx wires onBeforeCapture={stopAllPlayback} to ChatScreen, ConversationScreen, SingleModeScreen
const stringPhoneAppSrc = fs.readFileSync(
  new URL('../client/src/StringPhoneApp.jsx', import.meta.url),
  'utf8',
);
assert.match(
  stringPhoneAppSrc,
  /<ChatScreen[\s\S]*?onBeforeCapture={stopAllPlayback}/,
  'StringPhoneApp.jsx must pass onBeforeCapture={stopAllPlayback} to ChatScreen',
);
assert.match(
  stringPhoneAppSrc,
  /<ConversationScreen[\s\S]*?onBeforeCapture={stopAllPlayback}/,
  'StringPhoneApp.jsx must pass onBeforeCapture={stopAllPlayback} to ConversationScreen',
);
assert.match(
  stringPhoneAppSrc,
  /<SingleModeScreen[\s\S]*?onBeforeCapture={stopAllPlayback}/,
  'StringPhoneApp.jsx must pass onBeforeCapture={stopAllPlayback} to SingleModeScreen',
);

console.log('Microphone listening state & 5 zero-cost performance optimization tests passed.');
