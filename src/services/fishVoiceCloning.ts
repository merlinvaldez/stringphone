import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateSpeech as aiGenerateSpeech } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { createFishAudio } from "@ai-sdk/fish-audio";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import { generatePronunciationGuidance } from "./generatePronunciationGuidance.js";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  getWavDurationMs,
  normalizeWavToSampleRateAndMaxDuration,
  parsePcmWav,
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "./prepareVoiceReference.js";

export const FISH_AUDIO_API_BASE_URL = "https://api.fish.audio";
export const FISH_AUDIO_DEFAULT_GATEWAY_MODEL = "fish-audio/s2.1-pro";
export const FISH_AUDIO_DEFAULT_DIRECT_MODEL = "s2.1-pro";
export const FISH_AUDIO_FREE_DIRECT_MODEL = "s2.1-pro-free";
export const FISH_AUDIO_DEFAULT_SPEED = 0.85;
export const INLINE_VOICE_CLONE_SAMPLE_RATE = 24_000;
export const INLINE_VOICE_CLONE_MAX_DURATION_MS = 15_000;

const PERSIAN_LETTER_REGEX = /[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/;

export function normalizeRomanizedPronunciationForFishTts(
  pronunciationGuide?: string | null,
): string {
  if (typeof pronunciationGuide !== "string") {
    return "";
  }

  let cleaned = pronunciationGuide
    .trim()
    .replace(/^pronounce:\s*/i, "")
    .replace(/؟/g, "?")
    .replace(/،/g, ",")
    .replace(/؛/g, ";")
    .replace(/\u200C/g, "");

  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  if (!cleaned || !/[A-Za-z]/.test(cleaned) || PERSIAN_LETTER_REGEX.test(cleaned)) {
    return "";
  }

  // Collapse syllable-stress hyphens (e.g. "aa-YAA be KO-mak" -> "aayaa be komak")
  // so Fish Audio reads natural whole words without pausing on dashes or shouting ALL CAPS.
  let previous = "";
  while (cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned.replace(/([A-Za-z])-([A-Za-z])/g, "$1$2");
  }

  return cleaned.toLowerCase().replace(/\s+/g, " ").trim();
}

type InlineVoiceReference = {
  buffer: Buffer;
  transcript: string;
  durationMs: number;
};

const inlineVoiceReferenceMemoryStore = new Map<string, InlineVoiceReference>();
const INLINE_REF_DIR = path.join(os.tmpdir(), "stringphone-fish-refs");

function compactInlineReference(ref: InlineVoiceReference): InlineVoiceReference {
  const compactedBuffer = normalizeWavToSampleRateAndMaxDuration(
    ref.buffer,
    INLINE_VOICE_CLONE_SAMPLE_RATE,
    INLINE_VOICE_CLONE_MAX_DURATION_MS,
  );
  const compactedDurationMs = getWavDurationMs(compactedBuffer) || ref.durationMs;
  return {
    buffer: compactedBuffer,
    transcript: ref.transcript,
    durationMs: compactedDurationMs,
  };
}

function saveInlineVoiceReference(voiceId: string, ref: InlineVoiceReference) {
  const compacted = compactInlineReference(ref);
  inlineVoiceReferenceMemoryStore.set(voiceId, compacted);
  try {
    mkdirSync(INLINE_REF_DIR, { recursive: true });
    const filePath = path.join(INLINE_REF_DIR, `${voiceId}.json`);
    writeFileSync(
      filePath,
      JSON.stringify({
        base64: compacted.buffer.toString("base64"),
        transcript: compacted.transcript,
        durationMs: compacted.durationMs,
      }),
      "utf8",
    );
  } catch {
    // Memory cache remains active even if tmpdir write fails
  }
}

function loadInlineVoiceReference(voiceId: string): InlineVoiceReference | null {
  const fromMem = inlineVoiceReferenceMemoryStore.get(voiceId);
  if (fromMem) {
    return fromMem;
  }
  if (!/^fish_ref_[a-zA-Z0-9_-]{8,96}$/.test(voiceId)) {
    return null;
  }
  try {
    const filePath = path.join(INLINE_REF_DIR, `${voiceId}.json`);
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    if (typeof raw?.base64 === "string" && raw.base64) {
      const loaded = compactInlineReference({
        buffer: Buffer.from(raw.base64, "base64"),
        transcript: typeof raw.transcript === "string" ? raw.transcript : "",
        durationMs: Number(raw.durationMs) || MIN_VOICE_CLONE_DURATION_MS,
      });
      inlineVoiceReferenceMemoryStore.set(voiceId, loaded);
      return loaded;
    }
  } catch {
    return null;
  }
  return null;
}

function encodeMsgpackString(str: string): Buffer {
  const bytes = Buffer.from(str, "utf8");
  if (bytes.length < 32) {
    return Buffer.concat([Buffer.from([0xa0 | bytes.length]), bytes]);
  }
  if (bytes.length < 256) {
    return Buffer.concat([Buffer.from([0xd9, bytes.length]), bytes]);
  }
  if (bytes.length < 65536) {
    const header = Buffer.alloc(3);
    header[0] = 0xda;
    header.writeUInt16BE(bytes.length, 1);
    return Buffer.concat([header, bytes]);
  }
  const header = Buffer.alloc(5);
  header[0] = 0xdb;
  header.writeUInt32BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

function encodeMsgpackBinary(bytes: Buffer): Buffer {
  if (bytes.length < 256) {
    return Buffer.concat([Buffer.from([0xc4, bytes.length]), bytes]);
  }
  if (bytes.length < 65536) {
    const header = Buffer.alloc(3);
    header[0] = 0xc5;
    header.writeUInt16BE(bytes.length, 1);
    return Buffer.concat([header, bytes]);
  }
  const header = Buffer.alloc(5);
  header[0] = 0xc6;
  header.writeUInt32BE(bytes.length, 1);
  return Buffer.concat([header, bytes]);
}

function encodeMsgpackBool(value: boolean): Buffer {
  return Buffer.from([value ? 0xc3 : 0xc2]);
}

function encodeMsgpackFloat64(value: number): Buffer {
  const buf = Buffer.alloc(9);
  buf[0] = 0xcb;
  buf.writeDoubleBE(value, 1);
  return buf;
}

function encodeFishZeroShotTtsMsgpack(input: {
  text: string;
  referenceAudio: Buffer;
  referenceText: string;
}): Buffer {
  // Map of 9 entries:
  // { text, format: "wav", normalize: true, latency: "balanced", temperature: 0.4, top_p: 0.1, repetition_penalty: 1.2, prosody: { speed: 0.85 }, references: [{ audio, text }] }
  return Buffer.concat([
    Buffer.from([0x89]),
    encodeMsgpackString("text"),
    encodeMsgpackString(input.text),
    encodeMsgpackString("format"),
    encodeMsgpackString("wav"),
    encodeMsgpackString("normalize"),
    encodeMsgpackBool(true),
    encodeMsgpackString("latency"),
    encodeMsgpackString("balanced"),
    encodeMsgpackString("temperature"),
    encodeMsgpackFloat64(0.4),
    encodeMsgpackString("top_p"),
    encodeMsgpackFloat64(0.1),
    encodeMsgpackString("repetition_penalty"),
    encodeMsgpackFloat64(1.2),
    encodeMsgpackString("prosody"),
    Buffer.from([0x81]), // 1-entry map: { speed: 0.85 }
    encodeMsgpackString("speed"),
    encodeMsgpackFloat64(FISH_AUDIO_DEFAULT_SPEED),
    encodeMsgpackString("references"),
    Buffer.from([0x91, 0x82]), // 1-element array of 2-entry map
    encodeMsgpackString("audio"),
    encodeMsgpackBinary(input.referenceAudio),
    encodeMsgpackString("text"),
    encodeMsgpackString(input.referenceText || ""),
  ]);
}

export type CreateFishVoiceCloneInput = {
  mergedReference: PreparedVoiceReference;
  languageCode: string;
  languageName: string;
  conversationScopeId?: string;
  transcripts?: string[];
};

export type GenerateFishClonedSpeechInput = {
  text: string;
  targetLanguage: SupportedTtsLanguage;
  clonedVoiceId: string;
  pronunciationText?: string | null;
};

export type FishVoiceCloningDeps = {
  apiKey?: string | null;
  gatewayApiKey?: string | null;
  oidcToken?: string | null;
  fetchImpl?: typeof fetch;
  generateSpeechImpl?: (
    options: Record<string, unknown>,
  ) => Promise<{ audio: { uint8Array: Uint8Array } }>;
};

export function getFishAudioApiKey(override?: string | null): string | null {
  if (typeof override === "string" && override.trim()) {
    return override.trim();
  }

  const envKey =
    process.env.FISH_AUDIO_API_KEY?.trim() ||
    process.env.FISH_API_KEY?.trim() ||
    "";

  return envKey || null;
}

export function hasAiGatewayCredentials(deps?: FishVoiceCloningDeps): boolean {
  const gatewayKey =
    deps?.gatewayApiKey?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    "";
  const oidcToken =
    deps?.oidcToken?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";

  return Boolean(gatewayKey || oidcToken);
}

type FishCreateModelResponse = {
  _id?: unknown;
  id?: unknown;
  state?: unknown;
  message?: unknown;
  detail?: unknown;
};

export async function createFishVoiceClone(
  input: CreateFishVoiceCloneInput,
  deps: FishVoiceCloningDeps = {},
): Promise<{ voiceId: string; durationMs: number }> {
  if (
    !input.mergedReference ||
    !Buffer.isBuffer(input.mergedReference.buffer) ||
    input.mergedReference.durationMs < MIN_VOICE_CLONE_DURATION_MS
  ) {
    throw new Error(
      `Instant voice cloning requires at least 10 seconds (${MIN_VOICE_CLONE_DURATION_MS}ms) of audio samples.`,
    );
  }

  const apiKey = getFishAudioApiKey(deps.apiKey);
  if (!apiKey) {
    throw new Error("Fish Audio is not configured.");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const scopeSlug = (input.conversationScopeId || "chat")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
  const title = `stringphone-${scopeSlug || "chat"}-${input.languageCode}-${Date.now()}`;

  const formData = new FormData();
  formData.append("type", "tts");
  formData.append("title", title);
  formData.append(
    "description",
    `StringPhone chat-scoped voice clone for ${input.languageName} (${input.languageCode})`,
  );
  formData.append("visibility", "unlist");
  formData.append("train_mode", "fast");
  formData.append("enhance_audio_quality", "true");
  formData.append(
    "voices",
    new Blob([new Uint8Array(input.mergedReference.buffer)], {
      type: input.mergedReference.mimeType || "audio/wav",
    }),
    input.mergedReference.filename || "stringphone-reference.wav",
  );

  const joinedTranscript = (input.transcripts ?? [])
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .trim();

  if (joinedTranscript) {
    formData.append("texts", joinedTranscript);
  }

  const response = await fetchImpl(`${FISH_AUDIO_API_BASE_URL}/model`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as
    | FishCreateModelResponse
    | null;

  if (!response.ok || !body) {
    const detail =
      typeof body?.message === "string"
        ? body.message
        : typeof body?.detail === "string"
          ? body.detail
          : `Fish Audio voice clone creation failed (${response.status}).`;

    // Free Fish Audio API keys have a 0/0 `/model` creation quota (HTTP 403/402),
    // but support zero-shot inline reference cloning via `application/msgpack` on `/v1/tts`.
    if (
      response.status === 403 ||
      response.status === 402 ||
      /model creation limit|insufficient.*credit/i.test(detail)
    ) {
      const inlineVoiceId = `fish_ref_${randomUUID().replace(/-/g, "")}`;
      saveInlineVoiceReference(inlineVoiceId, {
        buffer: input.mergedReference.buffer,
        transcript: joinedTranscript,
        durationMs: input.mergedReference.durationMs,
      });
      return {
        voiceId: inlineVoiceId,
        durationMs: input.mergedReference.durationMs,
      };
    }

    throw new Error(detail);
  }

  const voiceId =
    typeof body._id === "string" && body._id.trim()
      ? body._id.trim()
      : typeof body.id === "string" && body.id.trim()
        ? body.id.trim()
        : "";

  if (!voiceId) {
    throw new Error("Fish Audio did not return a cloned voice ID.");
  }

  return {
    voiceId,
    durationMs: input.mergedReference.durationMs,
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
    originalFilename: "fish-output.wav",
    mimeType: "audio/wav",
  });
  return prepared.buffer;
}

export async function generateFishClonedSpeech(
  input: GenerateFishClonedSpeechInput,
  deps: FishVoiceCloningDeps = {},
): Promise<Buffer> {
  const clonedVoiceId = input.clonedVoiceId?.trim();
  if (!clonedVoiceId) {
    throw new Error("clonedVoiceId is required for Fish Audio cloned speech.");
  }

  let spokenText = input.text;
  if (input.targetLanguage.code === "fa") {
    let romanized = normalizeRomanizedPronunciationForFishTts(
      input.pronunciationText,
    );
    if (!romanized && !deps.generateSpeechImpl) {
      try {
        const guidance = await generatePronunciationGuidance({
          originalText: input.text,
          translatedText: input.text,
          sourceLanguageCode: "fa",
          sourceLanguage: "Persian",
          targetLanguageCode: "en",
          targetLanguage: "English",
        });
        romanized = normalizeRomanizedPronunciationForFishTts(
          guidance.originalPronunciation,
        );
      } catch {
        // Keep original text if on-the-fly romanization fails
      }
    }
    if (romanized) {
      spokenText = romanized;
    }
  }

  const fishApiKey = getFishAudioApiKey(deps.apiKey);
  const inlineReference = loadInlineVoiceReference(clonedVoiceId);
  if (inlineReference && fishApiKey) {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const msgpackPayload = encodeFishZeroShotTtsMsgpack({
      text: spokenText,
      referenceAudio: inlineReference.buffer,
      referenceText: inlineReference.transcript,
    });

    for (const modelHeader of [
      FISH_AUDIO_FREE_DIRECT_MODEL,
      FISH_AUDIO_DEFAULT_DIRECT_MODEL,
    ]) {
      const response = await fetchImpl(`${FISH_AUDIO_API_BASE_URL}/v1/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fishApiKey}`,
          "Content-Type": "application/msgpack",
          model: modelHeader,
        },
        body: new Uint8Array(msgpackPayload),
      });

      if (response.ok) {
        const rawBytes = Buffer.from(await response.arrayBuffer());
        return ensureCanonicalWavOutput(rawBytes);
      }

      if (response.status !== 402 && response.status !== 403) {
        const errText = await response.text().catch(() => "");
        throw new Error(
          `Fish Audio inline reference TTS failed (${response.status}): ${errText}`,
        );
      }
    }
  }

  const gatewayApiKey =
    deps.gatewayApiKey?.trim() ||
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    undefined;
  const useGateway = hasAiGatewayCredentials(deps);

  const gatewayModelSlug =
    process.env.FISH_AUDIO_TTS_MODEL?.trim() ||
    FISH_AUDIO_DEFAULT_GATEWAY_MODEL;
  const directModelSlug = gatewayModelSlug.startsWith("fish-audio/")
    ? gatewayModelSlug.slice("fish-audio/".length)
    : FISH_AUDIO_DEFAULT_DIRECT_MODEL;

  const generateSpeechFn =
    deps.generateSpeechImpl ??
    (aiGenerateSpeech as unknown as NonNullable<
      FishVoiceCloningDeps["generateSpeechImpl"]
    >);

  const fishAudioOptions: Record<string, unknown> = {
    referenceId: clonedVoiceId,
    normalizeLoudness: true,
    normalize: true,
    latency: "balanced",
    temperature: 0.4,
    topP: 0.1,
    repetitionPenalty: 1.2,
  };

  if (useGateway || deps.generateSpeechImpl) {
    try {
      const gateway = createGateway({
        ...(gatewayApiKey ? { apiKey: gatewayApiKey } : {}),
      });
      // First attempt uses Vercel AI Gateway system credits (requires visibility='unlist' on Fish Audio).
      const result = await generateSpeechFn({
        model: gateway.speechModel(gatewayModelSlug),
        text: spokenText,
        voice: clonedVoiceId,
        speed: FISH_AUDIO_DEFAULT_SPEED,
        outputFormat: "wav",
        providerOptions: {
          fishAudio: fishAudioOptions,
        },
      });

      return ensureCanonicalWavOutput(Buffer.from(result.audio.uint8Array));
    } catch (gatewayError) {
      if (!fishApiKey || deps.generateSpeechImpl) {
        throw gatewayError;
      }
    }
  }

  if (!fishApiKey) {
    throw new Error(
      "Neither Vercel AI Gateway nor Fish Audio credentials are configured.",
    );
  }

  const fishAudio = createFishAudio({ apiKey: fishApiKey });
  const directResult = await generateSpeechFn({
    model: fishAudio.speech(directModelSlug),
    text: spokenText,
    voice: clonedVoiceId,
    speed: FISH_AUDIO_DEFAULT_SPEED,
    outputFormat: "wav",
    providerOptions: {
      fishAudio: fishAudioOptions,
    },
  });

  return ensureCanonicalWavOutput(Buffer.from(directResult.audio.uint8Array));
}
