import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSpeech as aiGenerateSpeech } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  getWavDurationMs,
  normalizeWavToSampleRateAndMaxDuration,
  parsePcmWav,
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "./prepareVoiceReference.js";

export const MISTRAL_VOXTRAL_DEFAULT_GATEWAY_MODEL = "mistral/voxtral-mini-tts-3";
export const MISTRAL_VOXTRAL_DEFAULT_PACE = "moderate";
export const VOXTRAL_REFERENCE_SAMPLE_RATE = 16_000;
export const VOXTRAL_REFERENCE_MAX_DURATION_MS = 8_000;
export const MAX_INLINE_REFERENCE_AUDIO_BASE64_LENGTH = 2_000_000;

const SAFE_VOICE_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const VOICE_REF_DIR = path.join(os.tmpdir(), "stringphone-voice-refs");

export type CreateMistralVoiceCloneInput = {
  mergedReference: PreparedVoiceReference;
  languageCode: string;
  languageName: string;
  conversationScopeId?: string;
  transcripts?: string[];
};

export type CreateMistralVoiceCloneResult = {
  voiceId: string;
  durationMs: number;
  referenceAudioBase64: string;
};

export type GenerateMistralClonedSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  clonedVoiceId?: string | null;
  referenceAudioBase64?: string | null;
};

export type MistralVoiceCloningDeps = {
  gatewayApiKey?: string | null;
  oidcToken?: string | null;
  generateSpeechImpl?: (
    options: Record<string, unknown>,
  ) => Promise<{ audio: { uint8Array: Uint8Array } }>;
};

type CachedVoiceReference = {
  buffer: Buffer;
  durationMs: number;
};

const voiceReferenceMemoryStore = new Map<string, CachedVoiceReference>();

function resolveGatewayCredentials(deps?: MistralVoiceCloningDeps) {
  const gatewayKey =
    deps && "gatewayApiKey" in deps
      ? (deps.gatewayApiKey?.trim() ?? "")
      : (process.env.AI_GATEWAY_API_KEY?.trim() ?? "");
  const oidcToken =
    deps && "oidcToken" in deps
      ? (deps.oidcToken?.trim() ?? "")
      : (process.env.VERCEL_OIDC_TOKEN?.trim() ?? "");

  return { gatewayKey, oidcToken };
}

export function hasAiGatewayCredentials(deps?: MistralVoiceCloningDeps): boolean {
  const { gatewayKey, oidcToken } = resolveGatewayCredentials(deps);
  return Boolean(gatewayKey || oidcToken);
}

function compactVoxtralReferenceBuffer(rawBuffer: Buffer): Buffer {
  return normalizeWavToSampleRateAndMaxDuration(
    rawBuffer,
    VOXTRAL_REFERENCE_SAMPLE_RATE,
    VOXTRAL_REFERENCE_MAX_DURATION_MS,
  );
}

function saveVoiceReference(
  voiceId: string,
  buffer: Buffer,
  fallbackDurationMs: number,
): CachedVoiceReference {
  const compactedBuffer = compactVoxtralReferenceBuffer(buffer);
  const compactedDurationMs = getWavDurationMs(compactedBuffer) || fallbackDurationMs;
  const entry: CachedVoiceReference = {
    buffer: compactedBuffer,
    durationMs: compactedDurationMs,
  };

  voiceReferenceMemoryStore.set(voiceId, entry);

  try {
    mkdirSync(VOICE_REF_DIR, { recursive: true });
    writeFileSync(
      path.join(VOICE_REF_DIR, `${voiceId}.json`),
      JSON.stringify({
        base64: compactedBuffer.toString("base64"),
        durationMs: compactedDurationMs,
      }),
      "utf8",
    );
  } catch {
    // Memory cache remains active even if tmpdir write fails.
  }

  return entry;
}

function loadVoiceReference(voiceId: string): CachedVoiceReference | null {
  if (!SAFE_VOICE_ID_PATTERN.test(voiceId)) {
    return null;
  }

  const fromMemory = voiceReferenceMemoryStore.get(voiceId);
  if (fromMemory) {
    return fromMemory;
  }

  try {
    const filePath = path.join(VOICE_REF_DIR, `${voiceId}.json`);
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
      base64?: unknown;
      durationMs?: unknown;
    } | null;
    if (typeof raw?.base64 === "string" && raw.base64.trim()) {
      const decoded = Buffer.from(raw.base64.trim(), "base64");
      if (parsePcmWav(decoded)) {
        const compacted = compactVoxtralReferenceBuffer(decoded);
        const entry: CachedVoiceReference = {
          buffer: compacted,
          durationMs: getWavDurationMs(compacted) || Number(raw.durationMs) || 0,
        };
        voiceReferenceMemoryStore.set(voiceId, entry);
        return entry;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function deleteVoiceReferenceFromCache(voiceId: string): void {
  const trimmed = typeof voiceId === "string" ? voiceId.trim() : "";
  if (!trimmed) {
    return;
  }

  voiceReferenceMemoryStore.delete(trimmed);

  if (!SAFE_VOICE_ID_PATTERN.test(trimmed)) {
    return;
  }

  try {
    unlinkSync(path.join(VOICE_REF_DIR, `${trimmed}.json`));
  } catch {
    // Ignore missing cache file.
  }
}

export async function createMistralVoiceClone(
  input: CreateMistralVoiceCloneInput,
  deps: MistralVoiceCloningDeps = {},
): Promise<CreateMistralVoiceCloneResult> {
  if (
    !input.mergedReference ||
    !Buffer.isBuffer(input.mergedReference.buffer) ||
    input.mergedReference.durationMs < MIN_VOICE_CLONE_DURATION_MS
  ) {
    throw new Error(
      `Instant voice cloning requires at least 10 seconds (${MIN_VOICE_CLONE_DURATION_MS}ms) of audio samples.`,
    );
  }

  if (!hasAiGatewayCredentials(deps)) {
    throw new Error("Vercel AI Gateway is not configured.");
  }

  if (!parsePcmWav(input.mergedReference.buffer)) {
    throw new Error("Invalid merged PCM WAV voice reference.");
  }

  const voiceId = `voxtral_ref_${randomUUID().replace(/-/g, "")}`;
  const saved = saveVoiceReference(
    voiceId,
    input.mergedReference.buffer,
    input.mergedReference.durationMs,
  );

  return {
    voiceId,
    durationMs: input.mergedReference.durationMs,
    referenceAudioBase64: saved.buffer.toString("base64"),
  };
}

async function ensureCanonicalWavOutput(rawAudioBuffer: Buffer): Promise<Buffer> {
  const parsed = parsePcmWav(rawAudioBuffer);
  if (parsed && parsed.audioFormat === 1) {
    return createCanonicalPcmWavBuffer(
      parsed.pcmData,
      parsed.sampleRate,
      parsed.channels,
      parsed.bitsPerSample,
    );
  }

  const prepared = await prepareVoiceReference({
    audioBuffer: rawAudioBuffer,
    originalFilename: "voxtral-output.wav",
    mimeType: "audio/wav",
  });
  return prepared.buffer;
}

function resolveInlineReferenceWavBuffer(
  input: GenerateMistralClonedSpeechInput,
): Buffer {
  if (
    typeof input.referenceAudioBase64 === "string" &&
    input.referenceAudioBase64.trim()
  ) {
    const stripped = input.referenceAudioBase64
      .trim()
      .replace(/^data:[^,]+,/, "");
    if (
      !stripped ||
      stripped.length > MAX_INLINE_REFERENCE_AUDIO_BASE64_LENGTH
    ) {
      throw new Error("Invalid cloned voice reference audio.");
    }

    let decoded: Buffer;
    try {
      decoded = Buffer.from(stripped, "base64");
    } catch {
      throw new Error("Invalid cloned voice reference audio.");
    }

    if (decoded.length === 0 || !parsePcmWav(decoded)) {
      throw new Error("Invalid cloned voice reference audio.");
    }

    return compactVoxtralReferenceBuffer(decoded);
  }

  const clonedVoiceId =
    typeof input.clonedVoiceId === "string" ? input.clonedVoiceId.trim() : "";
  if (clonedVoiceId) {
    const cached = loadVoiceReference(clonedVoiceId);
    if (cached && cached.buffer.length > 0) {
      return cached.buffer;
    }
  }

  throw new Error("Cloned voice reference audio is unavailable.");
}

function applyMistralPaceTag(text: string): string {
  const trimmed = text.trim();
  const pace =
    process.env.MISTRAL_TTS_PACE?.trim() || MISTRAL_VOXTRAL_DEFAULT_PACE;
  if (!trimmed || !pace || /^\[pace=/i.test(trimmed)) {
    return text;
  }
  return `[pace=${pace}] ${trimmed}`;
}

export async function generateMistralClonedSpeech(
  input: GenerateMistralClonedSpeechInput,
  deps: MistralVoiceCloningDeps = {},
): Promise<Buffer> {
  const { gatewayKey, oidcToken } = resolveGatewayCredentials(deps);
  if (!gatewayKey && !oidcToken && !deps.generateSpeechImpl) {
    throw new Error("Vercel AI Gateway credentials are not configured.");
  }

  const referenceBuffer = resolveInlineReferenceWavBuffer(input);
  const gatewayModelSlug =
    process.env.MISTRAL_TTS_MODEL?.trim() ||
    MISTRAL_VOXTRAL_DEFAULT_GATEWAY_MODEL;

  const generateSpeechFn =
    deps.generateSpeechImpl ??
    (aiGenerateSpeech as unknown as NonNullable<
      MistralVoiceCloningDeps["generateSpeechImpl"]
    >);

  const gateway = createGateway({
    ...(gatewayKey ? { apiKey: gatewayKey } : {}),
  });

  const result = await generateSpeechFn({
    model: gateway.speechModel(gatewayModelSlug),
    text: applyMistralPaceTag(input.text),
    outputFormat: "wav",
    providerOptions: {
      mistral: {
        refAudio: referenceBuffer.toString("base64"),
      },
    },
  });

  return ensureCanonicalWavOutput(Buffer.from(result.audio.uint8Array));
}
