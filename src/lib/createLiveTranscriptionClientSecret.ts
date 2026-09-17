import { createHash } from "node:crypto";
import { getSupportedTtsLanguage } from "./languages.js";

type ClientSecretResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

type ClientSecretRequestResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number };

function asOpenAiSafetyIdentifier(userId: number | null | undefined) {
  if (!Number.isInteger(userId) || !userId || userId < 1) {
    return undefined;
  }

  return createHash("sha256").update(`stringphone:${userId}`).digest("hex");
}

async function requestClientSecret(input: {
  apiKey: string;
  endpoint: string;
  session: Record<string, unknown>;
  safetyIdentifier?: string;
}): Promise<ClientSecretRequestResult> {
  try {
    const response = await fetch(input.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...(input.safetyIdentifier
          ? { "OpenAI-Safety-Identifier": input.safetyIdentifier }
          : {}),
      },
      body: JSON.stringify({ session: input.session }),
    });
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;

    if (!response.ok || !body || typeof body.value !== "string") {
      return {
        ok: false,
        status: response.status >= 400 ? response.status : 502,
      };
    }

    return { ok: true, body };
  } catch (error) {
    console.error("OpenAI live session client secret request failed", error);
    return { ok: false, status: 502 };
  }
}

/** Mints a short-lived browser credential without exposing OPENAI_API_KEY. */
export async function createLiveTranscriptionClientSecret(input: {
  sourceLanguage: unknown;
  targetLanguage: unknown;
  userId?: number | null;
  forceFallback?: boolean;
  fallbackReason?: unknown;
}): Promise<ClientSecretResult> {
  const sourceLanguage = getSupportedTtsLanguage(input.sourceLanguage);
  const targetLanguage = getSupportedTtsLanguage(input.targetLanguage);

  if (!sourceLanguage || !targetLanguage) {
    return {
      ok: false,
      status: 400,
      body: { error: "Both selected languages must be supported." },
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: { error: "Live translation is not configured." },
    };
  }

  const safetyIdentifier = asOpenAiSafetyIdentifier(input.userId);
  const fallbackReason =
    typeof input.fallbackReason === "string" && input.fallbackReason.trim()
      ? input.fallbackReason.trim()
      : "Realtime translation setup failed; using fallback translation.";
  const requestFallbackSecret = () =>
    requestClientSecret({
      apiKey,
      endpoint: "https://api.openai.com/v1/realtime/client_secrets",
      safetyIdentifier,
      session: {
        type: "transcription",
        audio: {
          input: {
            transcription: {
              model: "gpt-live-transcribe",
              languages: [sourceLanguage.code, targetLanguage.code],
              delay: "low",
            },
          },
        },
      },
    });

  if (input.forceFallback) {
    const fallbackResult = await requestFallbackSecret();

    if (!fallbackResult.ok) {
      return {
        ok: false,
        status: fallbackResult.status,
        body: { error: "Unable to start live translation fallback." },
      };
    }

    return {
      ok: true,
      body: {
        ...fallbackResult.body,
        liveMode: "fallback-transcription",
        fallbackReason,
      },
    };
  }

  const realtimeResult = await requestClientSecret({
    apiKey,
    endpoint: "https://api.openai.com/v1/realtime/translations/client_secrets",
    safetyIdentifier,
    session: {
      model: "gpt-realtime-translate",
      audio: {
        input: {
          transcription: { model: "gpt-realtime-whisper" },
        },
        output: { language: targetLanguage.code },
      },
    },
  });

  if (realtimeResult.ok) {
    return {
      ok: true,
      body: {
        ...realtimeResult.body,
        liveMode: "realtime-translation",
        fallbackReason: "",
      },
    };
  }

  const reason = `Realtime translation setup failed (HTTP ${realtimeResult.status}); using fallback translation.`;
  const fallbackResult = await requestFallbackSecret();

  if (!fallbackResult.ok) {
    return {
      ok: false,
      status: fallbackResult.status,
      body: { error: "Unable to start live translation or its fallback." },
    };
  }

  return {
    ok: true,
    body: {
      ...fallbackResult.body,
      liveMode: "fallback-transcription",
      fallbackReason: reason,
    },
  };
}
