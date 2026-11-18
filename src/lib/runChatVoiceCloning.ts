import {
  CANONICAL_TTS_LANGUAGES,
  getSupportedTtsLanguage,
} from "./languages.js";
import {
  createFishVoiceClone,
  getFishAudioApiKey,
  type CreateFishVoiceCloneInput,
} from "../services/fishVoiceCloning.js";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  prepareVoiceReference,
  selectAndMergeVoiceSamplesForCloning,
  type PreparedVoiceReference,
} from "../services/prepareVoiceReference.js";

const MAX_CLONE_SAMPLES_PER_REQUEST = 8;
const MAX_CLONE_SAMPLE_BYTES = 3_000_000;

export type RawVoiceCloneSample = {
  buffer?: Buffer;
  base64?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  transcript?: unknown;
};

export type RunChatVoiceCloningInput = {
  conversationId?: unknown;
  language: unknown;
  samples?: unknown;
};

export type RunChatVoiceCloningDeps = {
  prepareVoiceReferenceImpl?: typeof prepareVoiceReference;
  createFishVoiceCloneImpl?: (
    input: CreateFishVoiceCloneInput,
  ) => Promise<{ voiceId: string; durationMs: number }>;
};

export type CachedChatVoiceClone = {
  voiceId: string;
  languageCode: string;
  mode: "single" | "merged";
  totalDurationMs: number;
  usedSampleCount: number;
  createdAt: number;
};

export type RunChatVoiceCloningResult =
  | {
      ok: true;
      cloned: true;
      conversationId: string | null;
      language: string;
      clonedVoiceId: string;
      mode: "single" | "merged";
      totalDurationMs: number;
      minDurationMs: number;
      usedSampleCount: number;
    }
  | {
      ok: true;
      cloned: false;
      reason: "insufficient_duration" | "provider_unavailable";
      conversationId: string | null;
      language: string;
      clonedVoiceId: null;
      mode: "insufficient";
      totalDurationMs: number;
      minDurationMs: number;
      usedSampleCount: number;
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
    };

const serverChatVoiceCloneCache = new Map<string, CachedChatVoiceClone>();

function buildCacheKey(conversationId: string, languageCode: string) {
  return `${conversationId.trim()}::${languageCode.trim().toLowerCase()}`;
}

export function getCachedServerChatVoiceClone(
  conversationId: unknown,
  language: unknown,
): CachedChatVoiceClone | null {
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return null;
  }

  const supportedLanguage = getSupportedTtsLanguage(language);
  if (!supportedLanguage) {
    return null;
  }

  return (
    serverChatVoiceCloneCache.get(
      buildCacheKey(conversationId, supportedLanguage.code),
    ) ?? null
  );
}

export function setCachedServerChatVoiceClone(
  conversationId: string,
  languageCode: string,
  entry: CachedChatVoiceClone,
) {
  if (!conversationId.trim() || !languageCode.trim()) {
    return;
  }

  serverChatVoiceCloneCache.set(
    buildCacheKey(conversationId, languageCode),
    entry,
  );
}

export function clearCachedServerChatVoiceClones() {
  serverChatVoiceCloneCache.clear();
}

function normalizeSampleBuffer(sample: RawVoiceCloneSample): {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  transcript?: string;
} | null {
  let buffer: Buffer | null = null;

  if (Buffer.isBuffer(sample.buffer) && sample.buffer.length > 0) {
    buffer = sample.buffer;
  } else if (typeof sample.base64 === "string" && sample.base64.trim()) {
    const raw = sample.base64.trim().replace(/^data:[^,]+,/, "");
    try {
      buffer = Buffer.from(raw, "base64");
    } catch {
      return null;
    }
  }

  if (!buffer || buffer.length === 0) {
    return null;
  }

  const filename =
    typeof sample.filename === "string" && sample.filename.trim()
      ? sample.filename.trim()
      : "voice-sample.wav";
  const mimeType =
    typeof sample.mimeType === "string" && sample.mimeType.trim()
      ? sample.mimeType.trim()
      : undefined;
  const transcript =
    typeof sample.transcript === "string" && sample.transcript.trim()
      ? sample.transcript.trim()
      : undefined;

  return {
    buffer,
    filename,
    mimeType,
    transcript,
  };
}

export async function runChatVoiceCloning(
  input: RunChatVoiceCloningInput,
  deps: RunChatVoiceCloningDeps = {},
): Promise<RunChatVoiceCloningResult> {
  const supportedLanguage = getSupportedTtsLanguage(input.language);

  if (!supportedLanguage) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "language is not supported",
        supportedLanguages: CANONICAL_TTS_LANGUAGES,
      },
    };
  }

  const conversationId =
    typeof input.conversationId === "string" && input.conversationId.trim()
      ? input.conversationId.trim()
      : null;

  // If this chat already has a voice clone for this spoken language, return it immediately.
  if (conversationId) {
    const existing = getCachedServerChatVoiceClone(
      conversationId,
      supportedLanguage.code,
    );
    if (existing) {
      return {
        ok: true,
        cloned: true,
        conversationId,
        language: supportedLanguage.code,
        clonedVoiceId: existing.voiceId,
        mode: existing.mode,
        totalDurationMs: existing.totalDurationMs,
        minDurationMs: MIN_VOICE_CLONE_DURATION_MS,
        usedSampleCount: existing.usedSampleCount,
      };
    }
  }

  if (!Array.isArray(input.samples) || input.samples.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "samples array with at least one audio sample is required" },
    };
  }

  if (input.samples.length > MAX_CLONE_SAMPLES_PER_REQUEST) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `samples must contain ${MAX_CLONE_SAMPLES_PER_REQUEST} items or fewer`,
      },
    };
  }

  const normalizedSamples: Array<{
    buffer: Buffer;
    filename: string;
    mimeType?: string;
    transcript?: string;
  }> = [];

  for (const rawSample of input.samples) {
    if (!rawSample || typeof rawSample !== "object") {
      continue;
    }
    const normalized = normalizeSampleBuffer(rawSample as RawVoiceCloneSample);
    if (!normalized) {
      continue;
    }
    if (normalized.buffer.length > MAX_CLONE_SAMPLE_BYTES) {
      return {
        ok: false,
        status: 400,
        body: { error: "Each voice sample must be 3 MB or smaller" },
      };
    }
    normalizedSamples.push(normalized);
  }

  if (normalizedSamples.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: "At least one valid audio sample is required" },
    };
  }

  const prepareFn = deps.prepareVoiceReferenceImpl ?? prepareVoiceReference;
  const preparedSamples: PreparedVoiceReference[] = [];
  const transcripts: string[] = [];

  for (const sample of normalizedSamples) {
    try {
      const prepared = await prepareFn({
        audioBuffer: sample.buffer,
        originalFilename: sample.filename,
        mimeType: sample.mimeType,
      });
      preparedSamples.push(prepared);
      if (sample.transcript) {
        transcripts.push(sample.transcript);
      }
    } catch {
      console.warn("Skipping unreadable voice sample during clone preparation");
    }
  }

  const selection = selectAndMergeVoiceSamplesForCloning(
    preparedSamples,
    MIN_VOICE_CLONE_DURATION_MS,
  );

  if (
    !selection.eligible ||
    !selection.mergedReference ||
    selection.mode === "insufficient"
  ) {
    return {
      ok: true,
      cloned: false,
      reason: "insufficient_duration",
      conversationId,
      language: supportedLanguage.code,
      clonedVoiceId: null,
      mode: "insufficient",
      totalDurationMs: selection.totalDurationMs,
      minDurationMs: MIN_VOICE_CLONE_DURATION_MS,
      usedSampleCount: selection.usedSampleCount,
    };
  }

  const cloneFn = deps.createFishVoiceCloneImpl ?? createFishVoiceClone;

  if (!deps.createFishVoiceCloneImpl && !getFishAudioApiKey()) {
    return {
      ok: true,
      cloned: false,
      reason: "provider_unavailable",
      conversationId,
      language: supportedLanguage.code,
      clonedVoiceId: null,
      mode: "insufficient",
      totalDurationMs: selection.totalDurationMs,
      minDurationMs: MIN_VOICE_CLONE_DURATION_MS,
      usedSampleCount: selection.usedSampleCount,
    };
  }

  try {
    const cloneResult = await cloneFn({
      mergedReference: selection.mergedReference,
      languageCode: supportedLanguage.code,
      languageName: supportedLanguage.name,
      conversationScopeId: conversationId ?? "chat",
      transcripts,
    });

    if (conversationId) {
      setCachedServerChatVoiceClone(conversationId, supportedLanguage.code, {
        voiceId: cloneResult.voiceId,
        languageCode: supportedLanguage.code,
        mode: selection.mode,
        totalDurationMs: selection.totalDurationMs,
        usedSampleCount: selection.usedSampleCount,
        createdAt: Date.now(),
      });
    }

    return {
      ok: true,
      cloned: true,
      conversationId,
      language: supportedLanguage.code,
      clonedVoiceId: cloneResult.voiceId,
      mode: selection.mode,
      totalDurationMs: selection.totalDurationMs,
      minDurationMs: MIN_VOICE_CLONE_DURATION_MS,
      usedSampleCount: selection.usedSampleCount,
    };
  } catch {
    console.warn("Fish Audio voice clone creation failed; falling back to default speech");
    return {
      ok: true,
      cloned: false,
      reason: "provider_unavailable",
      conversationId,
      language: supportedLanguage.code,
      clonedVoiceId: null,
      mode: "insufficient",
      totalDurationMs: selection.totalDurationMs,
      minDurationMs: MIN_VOICE_CLONE_DURATION_MS,
      usedSampleCount: selection.usedSampleCount,
    };
  }
}
