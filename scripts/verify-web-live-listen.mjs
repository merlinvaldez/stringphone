import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createVadChunkController } from "../client/src/components/live/useVoxtralLiveListen.js";
import { createLivePlaybackQueue } from "../client/src/components/live/useLiveAudioQueue.js";

const ROOT_DIR = resolve(import.meta.dirname, "..");

// 1. VAD chunking & echo-safe gating state machine
{
  const vad = createVadChunkController({
    speechRmsThreshold: 0.02,
    minSpeechMs: 550,
    silenceFinalizeMs: 750,
    maxChunkMs: 6000,
    previewIntervalMs: 2500,
  });

  // Suppresses speech trigger while local live TTS audio is playing on speaker
  const echoSuppressed = vad.processFrame({
    rms: 0.08,
    nowMs: 100,
    isLocalAudioPlaying: true,
    headphoneMode: false,
  });
  assert.equal(echoSuppressed.action, "none");
  assert.equal(vad.getState().isSpeaking, false);

  // Allows speech trigger while wearing headphones even if audio is playing
  assert.equal(
    vad.processFrame({
      rms: 0.08,
      nowMs: 1000,
      isLocalAudioPlaying: true,
      headphoneMode: true,
    }).action,
    "none",
  );
  assert.equal(vad.getState().isSpeaking, true);

  // Speech >= 550ms followed by >= 750ms silence emits finalize ("silence")
  vad.processFrame({ rms: 0.05, nowMs: 1650 });
  assert.equal(vad.processFrame({ rms: 0.005, nowMs: 2100 }).action, "none");
  const silenceCut = vad.processFrame({ rms: 0.005, nowMs: 2400 });
  assert.equal(silenceCut.action, "finalize");
  assert.equal(silenceCut.reason, "silence");
  assert.equal(silenceCut.speechDurationMs, 650);

  // Continuous uninterrupted speech emits preview at 2500ms and forced rollover at 6000ms
  vad.processFrame({ rms: 0.04, nowMs: 5000 });
  assert.equal(vad.processFrame({ rms: 0.04, nowMs: 7499 }).action, "none");
  const previewCut = vad.processFrame({ rms: 0.04, nowMs: 7500 });
  assert.equal(previewCut.action, "preview");
  assert.equal(vad.processFrame({ rms: 0.04, nowMs: 8500 }).action, "none");
  const maxCut = vad.processFrame({ rms: 0.04, nowMs: 11000 });
  assert.equal(maxCut.action, "finalize");
  assert.equal(maxCut.reason, "max_duration");
  assert.equal(maxCut.speechDurationMs, 6000);
}

// 2. Sequential FIFO live playback queue with parallel prefetch & out-of-order resolution
{
  const prefetchedOrder = [];
  const startedPlayOrder = [];
  const finishedPlayOrder = [];
  let stopCalls = 0;

  const resolvers = new Map();
  const playResolvers = new Map();

  const queue = createLivePlaybackQueue({
    initialAutoPlay: true,
    prefetchItem: (item) => {
      prefetchedOrder.push(item.messageId);
      return new Promise((resolveFn) => {
        resolvers.set(item.messageId, resolveFn);
      });
    },
    playItem: (item) => {
      startedPlayOrder.push(item.messageId);
      return new Promise((resolveFn) => {
        playResolvers.set(item.messageId, () => {
          finishedPlayOrder.push(item.messageId);
          resolveFn();
        });
      });
    },
    onStopPlayback: () => {
      stopCalls += 1;
    },
  });

  // Same-language item with needsPlayback: false is skipped completely
  assert.deepEqual(
    queue.enqueue({
      messageId: "msg-self",
      text: "",
      languageCode: "en",
      needsPlayback: false,
    }),
    { queued: false, prefetched: false },
  );

  queue.enqueue({ messageId: "A", text: "Uno", languageCode: "en", needsPlayback: true });
  queue.enqueue({ messageId: "B", text: "Dos", languageCode: "en", needsPlayback: true });
  queue.enqueue({ messageId: "C", text: "Tres", languageCode: "en", needsPlayback: true });

  // All 3 prefetches started immediately in parallel
  assert.deepEqual(prefetchedOrder, ["A", "B", "C"]);

  // Resolve B before A -> playback must still start A first, never B!
  resolvers.get("B")("audio-B");
  resolvers.get("C")("audio-C");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(startedPlayOrder, []);

  resolvers.get("A")("audio-A");
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(startedPlayOrder, ["A"]);

  playResolvers.get("A")();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(startedPlayOrder, ["A", "B"]);

  // Manual playback yield halts queue before C
  queue.yieldToManualPlayback();
  playResolvers.get("B")?.();
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(startedPlayOrder, ["A", "B"]);
  assert.ok(stopCalls >= 1);
  assert.equal(queue.getState().isPlaying, false);

  // Muting allows prefetch without auto-play
  queue.setAutoPlayEnabled(false);
  const mutedRes = queue.enqueue({
    messageId: "D",
    text: "Cuatro",
    languageCode: "en",
    needsPlayback: true,
  });
  assert.deepEqual(mutedRes, { queued: false, prefetched: true });
  assert.ok(prefetchedOrder.includes("D"));
  assert.equal(startedPlayOrder.includes("D"), false);
}

// 3. Web source contract checks
{
  const appSrc = readFileSync(
    resolve(ROOT_DIR, "client/src/StringPhoneApp.jsx"),
    "utf8",
  );
  const bubbleSrc = readFileSync(
    resolve(ROOT_DIR, "client/src/components/chat/MessageBubble.jsx"),
    "utf8",
  );
  const ttsBtnSrc = readFileSync(
    resolve(ROOT_DIR, "client/src/components/audio/TextToSpeechButton.jsx"),
    "utf8",
  );
  const liveScreenSrc = readFileSync(
    resolve(ROOT_DIR, "client/src/components/live/LiveListenScreen.jsx"),
    "utf8",
  );

  const hiddenMatch = appSrc.match(/const HIDDEN_MODE_IDS = new Set\(([^)]*)\);/);
  assert.ok(hiddenMatch, "HIDDEN_MODE_IDS must be defined in StringPhoneApp.jsx");
  assert.doesNotMatch(
    hiddenMatch[1],
    /["']live["']/,
    "Live mode must be unhidden in StringPhoneApp.jsx",
  );
  assert.match(appSrc, /<LiveListenScreen/, "StringPhoneApp.jsx must render LiveListenScreen");
  assert.match(
    appSrc,
    /singleSpeakerAudioEligible\s*===\s*true/,
    "Voice cloning eligibility must check singleSpeakerAudioEligible",
  );
  assert.match(
    bubbleSrc,
    /isSameLanguageReady/,
    "MessageBubble.jsx must guard against showing translation failed on same-language ready messages",
  );
  assert.equal(
    ttsBtnSrc.includes("onAudioPlay"),
    false,
    "TextToSpeechButton.jsx must keep verify-mobile-mic-listening-state invariant",
  );
  assert.doesNotMatch(liveScreenSrc, /\bChatHeader\b/, "LiveListenScreen must omit lang 2 / invert ChatHeader");
  assert.doesNotMatch(liveScreenSrc, /\bChatComposer\b/, "LiveListenScreen must omit text input composer");
  assert.doesNotMatch(liveScreenSrc, /\bLiveTranslationDock\b/, "LiveListenScreen must omit preview dock animation");
  assert.doesNotMatch(liveScreenSrc, /\bAudioWave\b/, "LiveListenScreen must omit waveform animation");
  assert.match(liveScreenSrc, /aria-pressed=\{isToggledOn\}/, "Listen button must expose toggled aria-pressed state");
  assert.match(liveScreenSrc, /Ear/);
  assert.doesNotMatch(liveScreenSrc, /\bVolume2\b|\bVolumeX\b/, "LiveListenScreen must omit speaker toggle next to Listen");
}

console.log(
  "PASS Web Live Listen: VAD chunker & echo gating, parallel prefetch + FIFO audio queue, Live tab unhidden, and multi-speaker clone guard",
);
