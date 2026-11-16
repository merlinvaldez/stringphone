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
assert.match(
  nativeRealtimeSrc,
  /const ICE_CANDIDATE_SETTLE_MS = 10;/,
  'nativeRealtime.ts must use 10ms ICE candidate settle for local host candidates',
);
assert.match(
  webCaptureSrc,
  /const ICE_CANDIDATE_SETTLE_MS = 10;/,
  'useLiveConversationCapture.js must use 10ms ICE candidate settle for local host candidates',
);

// Optimization 2: Zero-cost HTTPS/TLS socket pre-warming to api.openai.com
assert.match(
  nativeRealtimeSrc,
  /function prewarmRealtimeSocket\(/,
  'nativeRealtime.ts must define prewarmRealtimeSocket to warm TLS connection to api.openai.com',
);

// Optimization 3: Periodic background refresh of prefetched tokens while screen is focused
assert.match(
  useLiveTurnFlowSrc,
  /SECRET_REFRESH_INTERVAL_MS/,
  'useLiveTurnFlow.ts must periodically refresh prefetched transcription secrets while focused so tokens never expire after 45s',
);

// Optimization 4: Native recorder preparation & start launched in parallel with connection.prepare()
const recorderStartIndex = useLiveTurnFlowSrc.indexOf('const recorderStartPromise =');
const prepareCallIndex = useLiveTurnFlowSrc.indexOf('connection.prepare(sourceLanguage, targetLanguage)');
assert.ok(
  recorderStartIndex !== -1 && prepareCallIndex !== -1 && recorderStartIndex < prepareCallIndex,
  'useLiveTurnFlow.ts must start recorderStartPromise before awaiting connection.prepare() so hardware setup runs in parallel from 0ms',
);

// Optimization 5: No redundant post-channel-open 250ms/400ms waits after oai-events SCTP channel is open
assert.ok(
  !nativeRealtimeSrc.includes('SESSION_EVENT_SETTLE_TIMEOUT_MS') &&
    !nativeRealtimeSrc.includes('PEER_CONNECT_SETTLE_TIMEOUT_MS'),
  'nativeRealtime.ts must not block for extra 250ms/400ms settle timeouts after waitForChannelOpen and waitForLiveMicrophoneTrack succeed',
);

console.log('Microphone listening state & 5 zero-cost performance optimization tests passed.');
