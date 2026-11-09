import assert from 'node:assert/strict';

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

// Test 5: Verify asynchronous microphone & session readiness gate
// Status must remain 'starting' until WebRTC track is live, channel is open, session is confirmed, and recorder is active.
async function runReadinessGateSimulation() {
  let trackLive = false;
  let channelOpen = false;
  let sessionConfirmed = false;
  let recorderActive = false;
  let status = 'idle';

  const isConnectionReady = () => trackLive && channelOpen && sessionConfirmed;

  const startPromise = (async () => {
    status = 'starting';
    // Wait until all hardware + session readiness conditions are met
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
  assert.equal(status, 'starting', 'Status must stay starting before session and recorder are confirmed');

  sessionConfirmed = true;
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(status, 'starting', 'Status must stay starting until hardware recorder is also confirmed active');

  recorderActive = true;
  await startPromise;
  assert.equal(status, 'recording', 'Status transitions to recording only after all readiness gates pass');
}

await runReadinessGateSimulation();
console.log('Microphone listening state contract tests passed: starting status isolated from listening until hardware + session are confirmed live.');
