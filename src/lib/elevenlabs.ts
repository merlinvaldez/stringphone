import "dotenv/config";

export const ELEVENLABS_API_BASE_URL =
  process.env.ELEVENLABS_API_BASE_URL ?? "https://api.elevenlabs.io/v1";
export const ELEVENLABS_STT_MODEL_ID =
  process.env.ELEVENLABS_STT_MODEL_ID ?? "scribe_v2";
export const ELEVENLABS_FARSI_TEST_VOICE_ID =
  process.env.ELEVENLABS_FARSI_TEST_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
export const ELEVENLABS_TTS_MODEL_ID =
  process.env.ELEVENLABS_TTS_MODEL_ID ?? "eleven_v3";
export const ELEVENLABS_TTS_OUTPUT_FORMAT =
  process.env.ELEVENLABS_TTS_OUTPUT_FORMAT ?? "mp3_44100_128";

export function getElevenLabsApiKey() {
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";

  if (!apiKey) {
    throw new Error("Missing ELEVENLABS_API_KEY in the environment");
  }

  return apiKey;
}

export function getElevenLabsHeaders(headers: Record<string, string> = {}) {
  return {
    "xi-api-key": getElevenLabsApiKey(),
    ...headers,
  };
}
