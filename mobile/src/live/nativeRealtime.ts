import {
  mediaDevices,
  RTCPeerConnection,
  type MediaStream,
} from 'react-native-webrtc';
import { nativeLiveApi } from '../adapters/live';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const ICE_GATHER_TIMEOUT_MS = 10_000;
const ICE_CANDIDATE_SETTLE_MS = 220;
const CHANNEL_OPEN_TIMEOUT_MS = 15_000;
const SECRET_CACHE_TTL_MS = 45_000;
type RTCDataChannelLike = ReturnType<RTCPeerConnection['createDataChannel']>;
type CachedSecret = {
  value: string;
  liveMode: string;
  fallbackReason: string;
  expiresAt: number;
};

const prefetchedSecrets = new Map<string, Promise<CachedSecret>>();

function secretCacheKey(sourceLanguage: string, targetLanguage: string) {
  return `${sourceLanguage.trim().toLowerCase()}::${targetLanguage.trim().toLowerCase()}`;
}

async function fetchAndCacheSecret(key: string, sourceLanguage: string, targetLanguage: string): Promise<CachedSecret> {
  const promise = (async () => {
    const secret = await nativeLiveApi.createTranscriptionSecret(sourceLanguage, targetLanguage);
    return {
      ...secret,
      expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
    };
  })();
  prefetchedSecrets.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    if (prefetchedSecrets.get(key) === promise) {
      prefetchedSecrets.delete(key);
    }
    throw err;
  }
}

export function prefetchTranscriptionSecret(sourceLanguage: string, targetLanguage: string) {
  if (!sourceLanguage || !targetLanguage) return;
  const key = secretCacheKey(sourceLanguage, targetLanguage);
  const existing = prefetchedSecrets.get(key);
  if (existing) {
    void existing.then(cached => {
      if (Date.now() >= cached.expiresAt && prefetchedSecrets.get(key) === existing) {
        prefetchedSecrets.delete(key);
        void fetchAndCacheSecret(key, sourceLanguage, targetLanguage).catch(() => undefined);
      }
    }).catch(() => undefined);
    return;
  }
  void fetchAndCacheSecret(key, sourceLanguage, targetLanguage).catch(() => undefined);
}

async function consumeOrCreateTranscriptionSecret(sourceLanguage: string, targetLanguage: string) {
  const key = secretCacheKey(sourceLanguage, targetLanguage);
  const existing = prefetchedSecrets.get(key);
  if (existing) {
    prefetchedSecrets.delete(key);
    try {
      const cached = await existing;
      if (Date.now() < cached.expiresAt && cached.value) {
        // Warm up the next secret in the background for subsequent turns
        void fetchAndCacheSecret(key, sourceLanguage, targetLanguage).catch(() => undefined);
        return cached;
      }
    } catch {
      // Fall through to fresh fetch
    }
  }
  const fresh = await nativeLiveApi.createTranscriptionSecret(sourceLanguage, targetLanguage);
  void fetchAndCacheSecret(key, sourceLanguage, targetLanguage).catch(() => undefined);
  return fresh;
}

export type RealtimeEvent = Record<string, unknown>;
export type NativeRealtimeHandlers = {
  onEvent: (event: RealtimeEvent) => void;
  onError: (message: string) => void;
};

function waitForIceGathering(peer: RTCPeerConnection) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let candidateTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (candidateTimer) clearTimeout(candidateTimer);
      peer.onicegatheringstatechange = null;
      peer.onicecandidate = null;
      resolve();
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      if (peer.localDescription?.sdp) {
        finish();
        return;
      }
      settled = true;
      if (candidateTimer) clearTimeout(candidateTimer);
      peer.onicegatheringstatechange = null;
      peer.onicecandidate = null;
      reject(new Error('Live connection preparation timed out. Check your connection and try again.'));
    }, ICE_GATHER_TIMEOUT_MS);

    peer.onicegatheringstatechange = () => {
      if (peer.iceGatheringState === 'complete') {
        finish();
      }
    };
    peer.onicecandidate = (event: { candidate?: unknown }) => {
      if (!event?.candidate) {
        finish();
        return;
      }
      if (!candidateTimer) {
        candidateTimer = setTimeout(finish, ICE_CANDIDATE_SETTLE_MS);
      }
    };
  });
}

function waitForChannelOpen(channel: RTCDataChannelLike) {
  if (channel.readyState === 'open') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      channel.onopen = null;
      channel.onclose = null;
      reject(new Error('Live transcription did not connect. Check your internet and try again.'));
    }, CHANNEL_OPEN_TIMEOUT_MS);
    function opened() {
      clearTimeout(timeout);
      channel.onopen = null;
      channel.onclose = null;
      resolve();
    }
    function closed() {
      clearTimeout(timeout);
      channel.onopen = null;
      channel.onclose = null;
      reject(new Error('Live transcription disconnected before it was ready.'));
    }
    channel.onopen = opened;
    channel.onclose = closed;
  });
}

export class NativeLiveConnection {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannelLike | null = null;
  private stream: MediaStream | null = null;
  private clientSecret = '';
  private closing = false;
  liveMode = 'fallback-transcription';
  fallbackReason = '';

  constructor(private readonly handlers: NativeRealtimeHandlers) {}

  async prepare(sourceLanguage: string, targetLanguage: string) {
    const secretPromise = consumeOrCreateTranscriptionSecret(sourceLanguage, targetLanguage);
    const localOfferPromise = (async () => {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      if (this.closing) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Live session closed during preparation.');
      }
      this.stream = stream;
      const peer = new RTCPeerConnection({});
      this.peer = peer;
      const channel = peer.createDataChannel('oai-events');
      this.channel = channel;

      channel.onmessage = (event: { data: unknown }) => {
        if (typeof event.data !== 'string') return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object') this.handlers.onEvent(parsed as RealtimeEvent);
        } catch {
          // Ignore non-protocol frames without interrupting the audio session.
        }
      };
      channel.onclose = () => {
        if (!this.closing) this.handlers.onError('Live transcription disconnected. Your saved recordings remain available.');
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' && !this.closing) {
          this.handlers.onError('Live transcription connection failed. Check your internet and try again.');
        }
      };
      peer.ontrack = (event: { track?: { enabled: boolean } }) => {
        // Transcription sessions have no playback. Keep any provider track muted.
        if (event.track) event.track.enabled = false;
      };
      stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error('Could not prepare live audio. Try again.');
      return sdp;
    })();

    const [secret, sdp] = await Promise.all([secretPromise, localOfferPromise]);
    this.clientSecret = secret.value;
    this.liveMode = secret.liveMode;
    this.fallbackReason = secret.fallbackReason;
    return sdp;
  }

  async connect(sdp: string) {
    if (!this.clientSecret || !this.peer || !this.channel) throw new Error('Live session is not prepared.');
    const response = await fetch(REALTIME_CALLS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.clientSecret}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });
    if (!response.ok) throw new Error('Live transcription could not connect. Check your internet and try again.');
    const answer = await response.text();
    await this.peer.setRemoteDescription({ type: 'answer', sdp: answer });
    await waitForChannelOpen(this.channel);
  }

  commitCurrentAudio() {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    return true;
  }

  stopMicrophone() {
    this.stream?.getTracks().forEach(track => {
      try { track.stop(); } catch { /* The connection is already releasing. */ }
    });
  }

  close() {
    this.closing = true;
    const channel = this.channel;
    const peer = this.peer;
    const stream = this.stream;
    this.channel = null;
    this.peer = null;
    this.stream = null;
    this.clientSecret = '';
    try { if (channel && channel.readyState !== 'closed') channel.close(); } catch { /* Already closed. */ }
    try { peer?.close(); } catch { /* Already closed. */ }
    try { stream?.getTracks().forEach(track => track.stop()); } catch { /* Already released. */ }
    try { stream?.release(); } catch { /* Native stream wrapper was already released. */ }
  }
}
