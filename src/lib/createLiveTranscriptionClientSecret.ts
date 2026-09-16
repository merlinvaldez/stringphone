import { createHash } from "node:crypto";
import { getSupportedTtsLanguage } from "./languages.js";

type ClientSecretResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; body: Record<string, unknown> };

function asOpenAiSafetyIdentifier(userId: number | null | undefined) {
  if (!Number.isInteger(userId) || !userId || userId < 1) {
    return undefined;
  }

  return createHash("sha256").update(`stringphone:${userId}`).digest("hex");
}

/** Mints a short-lived browser credential without exposing OPENAI_API_KEY. */
export async function createLiveTranscriptionClientSecret(input: {
  sourceLanguage: unknown;
  targetLanguage: unknown;
  userId?: number | null;
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
      body: { error: "Live transcription is not configured." },
    };
  }

  const safetyIdentifier = asOpenAiSafetyIdentifier(input.userId);
  const response = await fetch(
    "https://api.openai.com/v1/realtime/client_secrets",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(safetyIdentifier
          ? { "OpenAI-Safety-Identifier": safetyIdentifier }
          : {}),
      },
      body: JSON.stringify({
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
      }),
    },
  );

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !body || typeof body.value !== "string") {
    console.error("OpenAI live transcription client secret failed", response.status);
    return {
      ok: false,
      status: response.status >= 400 && response.status < 500 ? response.status : 502,
      body: { error: "Unable to start live transcription." },
    };
  }

  return { ok: true, body };
}
