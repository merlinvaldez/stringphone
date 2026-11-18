import { generateSpeech as aiGenerateSpeech } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { createFishAudio } from "@ai-sdk/fish-audio";
import type { SupportedTtsLanguage } from "../lib/languages.js";
import {
  MIN_VOICE_CLONE_DURATION_MS,
  createCanonicalPcmWavBuffer,
  parsePcmWav,
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "./prepareVoiceReference.js";

export const FISH_AUDIO_API_BASE_URL = "https://api.fish.audio";
export const FISH_AUDIO_DEFAULT_GATEWAY_MODEL = "fish-audio/s2.1-pro";
export const FISH_AUDIO_DEFAULT_DIRECT_MODEL = "s2.1-pro";

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

  const fishApiKey = getFishAudioApiKey(deps.apiKey);
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
    latency: "balanced",
  };

  if (useGateway || deps.generateSpeechImpl) {
    try {
      const gateway = createGateway({
        ...(gatewayApiKey ? { apiKey: gatewayApiKey } : {}),
      });
      // First attempt uses Vercel AI Gateway system credits (requires visibility='unlist' on Fish Audio).
      const result = await generateSpeechFn({
        model: gateway.speechModel(gatewayModelSlug),
        text: input.text,
        voice: clonedVoiceId,
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
    text: input.text,
    voice: clonedVoiceId,
    outputFormat: "wav",
    providerOptions: {
      fishAudio: fishAudioOptions,
    },
  });

  return ensureCanonicalWavOutput(Buffer.from(directResult.audio.uint8Array));
}
