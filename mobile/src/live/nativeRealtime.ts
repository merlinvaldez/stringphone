import {
  mediaDevices,
  RTCPeerConnection,
  type MediaStream,
} from 'react-native-webrtc';
import { nativeLiveApi } from '../adapters/live';

const REALTIME_CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const ICE_GATHER_TIMEOUT_MS = 10_000;
const ICE_CANDIDATE_SETTLE_MS = 60;
const CHANNEL_OPEN_TIMEOUT_MS = 15_000;
const PEER_CONNECT_SETTLE_TIMEOUT_MS = 400;
const SESSION_EVENT_SETTLE_TIMEOUT_MS = 250;
const MIC_TRACK_LIVE_TIMEOUT_MS = 1_500;
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

export function prefetchBothTranscriptionSecrets(langA: string, langB: string) {
  if (!langA || !langB) return;
  prefetchTranscriptionSecret(langA, langB);
  if (langA.trim().toLowerCase() !== langB.trim().toLowerCase()) {
    prefetchTranscriptionSecret(langB, langA);
  }
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
    const priorOnOpen = channel.onopen;
    const priorOnClose = channel.onclose;
    const timeout = setTimeout(() => {
      channel.onopen = priorOnOpen;
      channel.onclose = priorOnClose;
      reject(new Error('Live transcription did not connect. Check your internet and try again.'));
    }, CHANNEL_OPEN_TIMEOUT_MS);
    function opened() {
      clearTimeout(timeout);
      channel.onopen = priorOnOpen;
      channel.onclose = priorOnClose;
      resolve();
    }
    function closed() {
      clearTimeout(timeout);
      channel.onopen = priorOnOpen;
      channel.onclose = priorOnClose;
      reject(new Error('Live transcription disconnected before it was ready.'));
    }
    channel.onopen = opened;
    channel.onclose = closed;
  });
}

function isPeerMediaConnected(peer: RTCPeerConnection): boolean {
  return (
    peer.connectionState === 'connected' ||
    peer.iceConnectionState === 'connected' ||
    peer.iceConnectionState === 'completed'
  );
}

function waitForPeerConnected(peer: RTCPeerConnection) {
  if (isPeerMediaConnected(peer)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(poll);
      if (err) reject(err);
      else resolve();
    };
    const timeout = setTimeout(() => finish(), PEER_CONNECT_SETTLE_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed') {
        finish(new Error('Live transcription connection failed. Check your internet and try again.'));
        return;
      }
      if (isPeerMediaConnected(peer)) {
        finish();
      }
    }, 15);
  });
}

function isStreamAudioLive(stream: MediaStream | null): boolean {
  if (!stream) return false;
  const tracks = stream.getAudioTracks();
  return tracks.length > 0 && tracks.some(track => track.enabled && track.readyState === 'live');
}

function waitForLiveMicrophoneTrack(stream: MediaStream | null) {
  if (isStreamAudioLive(stream)) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (isStreamAudioLive(stream)) {
        clearInterval(poll);
        resolve();
        return;
      }
      if (Date.now() - startedAt >= MIC_TRACK_LIVE_TIMEOUT_MS) {
        clearInterval(poll);
        reject(new Error('Microphone could not start. Check microphone permissions and try again.'));
      }
    }, 15);
  });
}

export class NativeLiveConnection {
  private peer: RTCPeerConnection | null = null;
  private channel: RTCDataChannelLike | null = null;
  private stream: MediaStream | null = null;
  private clientSecret = '';
  private closing = false;
  private sessionConfirmed = false;
  private resolveSessionReady: (() => void) | null = null;
  private sessionReadyPromise: Promise<void> = Promise.resolve();
  liveMode = 'fallback-transcription';
  fallbackReason = '';

  constructor(private readonly handlers: NativeRealtimeHandlers) {}

  async prepare(sourceLanguage: string, targetLanguage: string) {
    this.sessionConfirmed = false;
    this.sessionReadyPromise = new Promise<void>(resolve => {
      this.resolveSessionReady = () => {
        this.sessionConfirmed = true;
        resolve();
      };
    });

    const secretPromise = consumeOrCreateTranscriptionSecret(sourceLanguage, targetLanguage);
    const localOfferPromise = (async () => {
      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      if (this.closing) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('Live session closed during preparation.');
      }
      this.stream = stream;
      await waitForLiveMicrophoneTrack(stream);

      const peer = new RTCPeerConnection({});
      this.peer = peer;
      const channel = peer.createDataChannel('oai-events');
      this.channel = channel;

      channel.onmessage = (event: { data: unknown }) => {
        if (typeof event.data !== 'string') return;
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && typeof parsed === 'object') {
            const eventObj = parsed as RealtimeEvent;
            const eventType = typeof eventObj.type === 'string' ? eventObj.type : '';
            if (
              eventType === 'session.created' ||
              eventType === 'transcription_session.created' ||
              eventType === 'session.updated' ||
              eventType === 'transcription_session.updated' ||
              eventType.startsWith('input_audio_buffer.') ||
              eventType.startsWith('conversation.item.')
            ) {
              this.resolveSessionReady?.();
            }
            this.handlers.onEvent(eventObj);
          }
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
    await Promise.all([
      waitForChannelOpen(this.channel),
      waitForPeerConnected(this.peer),
      waitForLiveMicrophoneTrack(this.stream),
    ]);
    await Promise.race([
      this.sessionReadyPromise,
      new Promise<void>(resolve => setTimeout(() => {
        this.resolveSessionReady?.();
        resolve();
      }, SESSION_EVENT_SETTLE_TIMEOUT_MS)),
    ]);
    if (!this.isMicrophoneActive()) {
      throw new Error('Microphone is not active. Try again.');
    }
  }

  commitCurrentAudio() {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    return true;
  }

  isMicrophoneActive(): boolean {
    if (this.closing) return false;
    return isStreamAudioLive(this.stream);
  }

  isReady(): boolean {
    return this.isMicrophoneActive() && this.channel?.readyState === 'open' && this.sessionConfirmed;
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
