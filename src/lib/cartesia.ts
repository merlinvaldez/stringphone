import "dotenv/config";

export const CARTESIA_API_BASE_URL =
  process.env.CARTESIA_API_BASE_URL ?? "https://api.cartesia.ai";
export const CARTESIA_VERSION =
  process.env.CARTESIA_VERSION ?? "2026-03-01";
export const CARTESIA_TTS_MODEL_ID =
  process.env.CARTESIA_TTS_MODEL_ID ?? "sonic-3.5";

export function getCartesiaApiKey() {
  const apiKey = process.env.CARTESIA_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing CARTESIA_API_KEY in the environment");
  }

  return apiKey;
}

export function getCartesiaHeaders(headers: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${getCartesiaApiKey()}`,
    "Cartesia-Version": CARTESIA_VERSION,
    ...headers,
  };
}
