import { transcribe as aiTranscribe } from "ai";
import { createGateway } from "@ai-sdk/gateway";

export const MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL =
  "mistral/voxtral-mini-transcribe-3";

const ADJACENT_SPEAKER_GAP_SECONDS = 0.8;
const MAX_CONTEXT_BIAS_ITEMS = 25;
const MAX_CONTEXT_BIAS_LENGTH = 64;
const NON_SPEECH_ARTIFACT_REGEX = /^[.\s…♪♫*_\[\]()~-]+$/;

export type VoxtralDiarizedSegment = {
  speakerId: string;
  text: string;
  languageCode: string;
  startSecond: number;
  endSecond: number;
};

export type TranscribeVoxtralInput = {
  audioBuffer: Buffer;
  filename: string;
  mimeType?: string;
  contextBias?: string[];
};

export type TranscribeVoxtralResult = {
  text: string;
  detectedLanguage: string;
  segments: VoxtralDiarizedSegment[];
  distinctSpeakerCount: number;
  durationInSeconds: number;
  model: string;
};

type RawTranscriptionResult = {
  text?: unknown;
  language?: unknown;
  durationInSeconds?: unknown;
  segments?: unknown;
  providerMetadata?: unknown;
};

export type TranscribeVoxtralDeps = {
  gatewayApiKey?: string | null;
  oidcToken?: string | null;
  model?: string | null;
  createGatewayImpl?: (options?: { apiKey?: string }) => {
    transcriptionModel: (modelId: string) => unknown;
  };
  transcribeImpl?: (
    options: Record<string, unknown>,
  ) => Promise<RawTranscriptionResult>;
};

function resolveGatewayCredentials(deps?: TranscribeVoxtralDeps) {
  const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;
  const gatewayKey =
    deps && "gatewayApiKey" in deps
      ? (deps.gatewayApiKey?.trim() ?? "")
      : (runtimeEnv?.AI_GATEWAY_API_KEY?.trim() ?? "");
  const oidcToken =
    deps && "oidcToken" in deps
      ? (deps.oidcToken?.trim() ?? "")
      : (runtimeEnv?.VERCEL_OIDC_TOKEN?.trim() ?? "");

  return { gatewayKey, oidcToken };
}

export function sanitizeContextBias(rawBias?: readonly string[]): string[] {
  if (!Array.isArray(rawBias)) {
    return [];
  }

  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of rawBias) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim().slice(0, MAX_CONTEXT_BIAS_LENGTH);
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    sanitized.push(trimmed);
    if (sanitized.length >= MAX_CONTEXT_BIAS_ITEMS) {
      break;
    }
  }

  return sanitized;
}

function normalizeLanguageCode(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function normalizeSpeakerId(raw: Record<string, unknown>, fallback = "speaker_0"): string {
  const candidate = raw.speakerId ?? raw.speaker_id ?? raw.speaker;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return `speaker_${candidate}`;
  }
  return fallback;
}

function normalizeFiniteSecond(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function extractRawSegmentList(
  result: RawTranscriptionResult,
): Array<Record<string, unknown>> {
  const mistralMeta =
    result.providerMetadata &&
    typeof result.providerMetadata === "object" &&
    "mistral" in result.providerMetadata &&
    result.providerMetadata.mistral &&
    typeof result.providerMetadata.mistral === "object"
      ? (result.providerMetadata.mistral as Record<string, unknown>)
      : null;

  const providerSegments = Array.isArray(mistralMeta?.segments)
    ? mistralMeta.segments.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  const sdkSegments = Array.isArray(result.segments)
    ? result.segments.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];

  if (
    providerSegments.length > 0 &&
    sdkSegments.length === providerSegments.length
  ) {
    return sdkSegments.map((sdkSeg, index) => ({
      ...sdkSeg,
      ...providerSegments[index],
    }));
  }

  if (providerSegments.length > 0) {
    return providerSegments;
  }

  return sdkSegments;
}

function normalizeAndMergeSegments(
  result: RawTranscriptionResult,
): VoxtralDiarizedSegment[] {
  const mistralMeta =
    result.providerMetadata &&
    typeof result.providerMetadata === "object" &&
    "mistral" in result.providerMetadata &&
    result.providerMetadata.mistral &&
    typeof result.providerMetadata.mistral === "object"
      ? (result.providerMetadata.mistral as Record<string, unknown>)
      : null;

  const fallbackLanguage = normalizeLanguageCode(
    result.language ?? mistralMeta?.language,
  );
  const rawSegments = extractRawSegmentList(result);
  const normalized: VoxtralDiarizedSegment[] = [];

  for (const raw of rawSegments) {
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text || NON_SPEECH_ARTIFACT_REGEX.test(text)) {
      continue;
    }

    const startSecond = normalizeFiniteSecond(raw.startSecond ?? raw.start, 0);
    const endSecond = Math.max(
      startSecond,
      normalizeFiniteSecond(raw.endSecond ?? raw.end, startSecond),
    );
    const languageCode =
      normalizeLanguageCode(
        raw.languageCode ?? raw.language_code ?? raw.language,
      ) || fallbackLanguage;
    const speakerId = normalizeSpeakerId(raw);

    normalized.push({
      speakerId,
      text,
      languageCode,
      startSecond,
      endSecond,
    });
  }

  if (normalized.length === 0) {
    const fallbackText =
      typeof result.text === "string" ? result.text.trim() : "";
    if (fallbackText && !NON_SPEECH_ARTIFACT_REGEX.test(fallbackText)) {
      normalized.push({
        speakerId: "speaker_0",
        text: fallbackText,
        languageCode: fallbackLanguage,
        startSecond: 0,
        endSecond: normalizeFiniteSecond(result.durationInSeconds, 0),
      });
    }
  }

  normalized.sort((a, b) => a.startSecond - b.startSecond);

  const merged: VoxtralDiarizedSegment[] = [];
  for (const segment of normalized) {
    const prev = merged[merged.length - 1];
    const gap = prev ? segment.startSecond - prev.endSecond : Infinity;
    const languagesCompatible =
      !prev?.languageCode ||
      !segment.languageCode ||
      prev.languageCode === segment.languageCode;

    if (
      prev &&
      prev.speakerId === segment.speakerId &&
      gap < ADJACENT_SPEAKER_GAP_SECONDS &&
      languagesCompatible
    ) {
      prev.text = `${prev.text} ${segment.text}`.trim();
      prev.endSecond = Math.max(prev.endSecond, segment.endSecond);
      if (!prev.languageCode && segment.languageCode) {
        prev.languageCode = segment.languageCode;
      }
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

export async function transcribeWithVoxtral(
  input: TranscribeVoxtralInput,
  deps: TranscribeVoxtralDeps = {},
): Promise<TranscribeVoxtralResult> {
  const { gatewayKey, oidcToken } = resolveGatewayCredentials(deps);
  if (!gatewayKey && !oidcToken && !deps.transcribeImpl) {
    throw new Error("Vercel AI Gateway is not configured.");
  }

  const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;
  const modelSlug =
    deps.model?.trim() ||
    runtimeEnv?.MISTRAL_TRANSCRIBE_MODEL?.trim() ||
    MISTRAL_VOXTRAL_DEFAULT_TRANSCRIBE_MODEL;

  const createGatewayFn = deps.createGatewayImpl ?? createGateway;
  const gateway = createGatewayFn(
    gatewayKey ? { apiKey: gatewayKey } : undefined,
  );
  const transcribeFn =
    deps.transcribeImpl ??
    (aiTranscribe as unknown as NonNullable<
      TranscribeVoxtralDeps["transcribeImpl"]
    >);

  const contextBias = sanitizeContextBias(input.contextBias);
  // Explicitly omit `language` in providerOptions.mistral so Voxtral Transcribe 3
  // auto-detects across 50+ languages in open multilingual conversations.
  const mistralOptions: {
    diarize: boolean;
    timestampGranularities: ["segment"];
    returnLanguage: boolean;
    contextBias?: string[];
  } = {
    diarize: true,
    timestampGranularities: ["segment"],
    returnLanguage: true,
    ...(contextBias.length > 0 ? { contextBias } : {}),
  };

  const result = await transcribeFn({
    model: gateway.transcriptionModel(modelSlug),
    audio: input.audioBuffer,
    providerOptions: {
      mistral: mistralOptions,
    },
  });

  const segments = normalizeAndMergeSegments(result);
  const fullText =
    typeof result.text === "string" && result.text.trim()
      ? result.text.trim()
      : segments.map((s) => s.text).join(" ").trim();
  const distinctSpeakerCount =
    segments.length === 0
      ? 0
      : Math.max(1, new Set(segments.map((segment) => segment.speakerId)).size);
  const detectedLanguage =
    normalizeLanguageCode(result.language) ||
    segments.find((segment) => segment.languageCode)?.languageCode ||
    "";

  return {
    text: fullText,
    detectedLanguage,
    segments,
    distinctSpeakerCount,
    durationInSeconds: normalizeFiniteSecond(result.durationInSeconds, 0),
    model: modelSlug,
  };
}
