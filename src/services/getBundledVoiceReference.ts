import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "./prepareVoiceReference.js";

const OUTPUT_SPEECH_REFERENCE_CACHE = new Map<
  string,
  Promise<PreparedVoiceReference>
>();
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FALLBACK_REFERENCE_FILENAMES = [
  "translated-speech.mp3",
  "translated-speech-en.mp3",
  "temp-voice-test.wav",
] as const;

async function loadBundledReferenceAudio(languageCode: string) {
  const candidateFilenames = [
    `translated-speech-${languageCode}.mp3`,
    ...FALLBACK_REFERENCE_FILENAMES,
  ];

  for (const filename of candidateFilenames) {
    const absolutePath = path.join(REPOSITORY_ROOT, filename);

    try {
      return {
        audioBuffer: await readFile(absolutePath),
        filename,
        mimeType: filename.toLowerCase().endsWith(".wav")
          ? "audio/wav"
          : "audio/mpeg",
      };
    } catch (error) {
      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof error.code === "string"
          ? error.code
          : "";

      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(
    `Bundled output-speech reference audio is missing for ${languageCode}.`,
  );
}

async function buildBundledVoiceReference(languageCode: string) {
  const referenceAudio = await loadBundledReferenceAudio(languageCode);

  return prepareVoiceReference({
    audioBuffer: referenceAudio.audioBuffer,
    originalFilename: referenceAudio.filename,
    mimeType: referenceAudio.mimeType,
  });
}

export function getBundledVoiceReference(languageCode: string) {
  const normalizedLanguageCode = languageCode.trim().toLowerCase();

  if (!OUTPUT_SPEECH_REFERENCE_CACHE.has(normalizedLanguageCode)) {
    OUTPUT_SPEECH_REFERENCE_CACHE.set(
      normalizedLanguageCode,
      buildBundledVoiceReference(normalizedLanguageCode),
    );
  }

  return OUTPUT_SPEECH_REFERENCE_CACHE.get(normalizedLanguageCode)!;
}
