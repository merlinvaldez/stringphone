import { getSupportedTtsLanguage } from "../src/lib/languages.ts";
import { runOutputTextToSpeech } from "../src/lib/runOutputTextToSpeech.ts";

const SAMPLE_TEXT_BY_LANGUAGE = {
  it: "Ciao, come stai oggi?",
  sv: "Hej, hur mar du idag?",
  fa: "سلام، امروز حال شما چطور است؟",
};

function parseArgs() {
  const languageCodes = (process.argv[2] ?? "it,sv,fa")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (languageCodes.length === 0) {
    throw new Error("Provide at least one language code.");
  }

  return languageCodes;
}

function analyzeWavBuffer(audioBuffer) {
  return {
    isWav:
      audioBuffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      audioBuffer.subarray(8, 12).toString("ascii") === "WAVE",
    byteLength: audioBuffer.length,
  };
}

async function verifyLanguage(languageCode) {
  const supportedLanguage = getSupportedTtsLanguage(languageCode);

  if (!supportedLanguage) {
    return {
      languageCode,
      ok: false,
      error: "Unsupported language code",
    };
  }

  const text =
    SAMPLE_TEXT_BY_LANGUAGE[languageCode] ??
    `Hello from StringPhone in ${supportedLanguage.name}.`;
  const result = await runOutputTextToSpeech({
    text,
    language: languageCode,
    speechVoice: "marin",
  });

  if (!result.ok) {
    return {
      languageCode,
      provider: "openai",
      ok: false,
      error: result.body,
    };
  }

  return {
    languageCode,
    provider: "openai",
    ok: true,
    contentType: result.contentType,
    analysis: analyzeWavBuffer(result.audioBuffer),
  };
}

async function main() {
  const languageCodes = parseArgs();
  const results = [];

  for (const languageCode of languageCodes) {
    results.push(await verifyLanguage(languageCode));
  }

  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
