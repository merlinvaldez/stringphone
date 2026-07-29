import { getRecentUserVoiceSamples } from "../db/queries/voiceSamples.js";
import {
  prepareVoiceReference,
  type PreparedVoiceReference,
} from "./prepareVoiceReference.js";
import type {
  SupportedTtsLanguage,
  TtsProvider,
} from "../lib/languages.js";

const MAX_VOICE_SAMPLE_CANDIDATES = 8;

const VOICE_SAMPLE_RULES: Record<
  TtsProvider,
  {
    minDurationMs: number;
    maxDurationSeconds?: number;
  }
> = {
  mistral: {
    minDurationMs: 1500,
    maxDurationSeconds: 15,
  },
  cartesia: {
    minDurationMs: 3500,
    maxDurationSeconds: 10,
  },
  elevenlabs: {
    minDurationMs: 8000,
    maxDurationSeconds: 90,
  },
};

const CARTESIA_IDEAL_DURATION_MS = 5000;

type PreparedVoiceSampleCandidate = {
  createdAt: string;
  provider: TtsProvider;
  preparedVoiceSample: PreparedVoiceReference;
  recencyIndex: number;
};

function getFilenameExtension(mimeType: string) {
  if (mimeType.includes("webm")) {
    return "webm";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
    return "mp3";
  }

  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  return "bin";
}

function inferStoredVoiceSampleFormat(audioBuffer: Buffer) {
  if (audioBuffer.length >= 12) {
    const header = audioBuffer.subarray(0, 12);
    const asciiHeader = header.toString("ascii");

    if (
      header[0] === 0x1a &&
      header[1] === 0x45 &&
      header[2] === 0xdf &&
      header[3] === 0xa3
    ) {
      return {
        filename: "saved-voice-reference.webm",
        mimeType: "audio/webm",
      };
    }

    if (asciiHeader.startsWith("OggS")) {
      return {
        filename: "saved-voice-reference.ogg",
        mimeType: "audio/ogg",
      };
    }

    if (asciiHeader.startsWith("RIFF") && asciiHeader.slice(8, 12) === "WAVE") {
      return {
        filename: "saved-voice-reference.wav",
        mimeType: "audio/wav",
      };
    }

    if (asciiHeader.slice(4, 8) === "ftyp") {
      return {
        filename: "saved-voice-reference.m4a",
        mimeType: "audio/mp4",
      };
    }

    if (
      asciiHeader.startsWith("ID3") ||
      (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
    ) {
      return {
        filename: "saved-voice-reference.mp3",
        mimeType: "audio/mpeg",
      };
    }
  }

  return {
    filename: "saved-voice-reference.mp3",
    mimeType: "audio/mpeg",
  };
}

function decodeStoredVoiceSample(audioValue: string) {
  const trimmedAudioValue = audioValue.trim();

  if (!trimmedAudioValue) {
    return null;
  }

  if (trimmedAudioValue.startsWith("data:")) {
    const match = trimmedAudioValue.match(/^data:([^;]+);base64,(.+)$/i);

    if (!match) {
      return null;
    }

    const mimeType = match[1] || "audio/mpeg";

    return {
      audioBuffer: Buffer.from(match[2], "base64"),
      originalFilename: `saved-voice-reference.${getFilenameExtension(mimeType)}`,
      mimeType,
    };
  }

  const audioBuffer = Buffer.from(trimmedAudioValue, "base64");
  const inferredFormat = inferStoredVoiceSampleFormat(audioBuffer);

  return {
    audioBuffer,
    originalFilename: inferredFormat.filename,
    mimeType: inferredFormat.mimeType,
  };
}

export async function resolveSavedUserVoiceReference(input: {
  userId?: number | null;
  targetLanguage: SupportedTtsLanguage;
}): Promise<PreparedVoiceReference | null> {
  if (!Number.isInteger(input.userId) || !input.userId || input.userId < 1) {
    return null;
  }

  try {
    const savedVoiceSamples = await getRecentUserVoiceSamples({
      userId: input.userId,
      limit: MAX_VOICE_SAMPLE_CANDIDATES,
    });
    const rules = VOICE_SAMPLE_RULES[input.targetLanguage.provider];
    const validCandidates: PreparedVoiceSampleCandidate[] = [];

    for (const [recencyIndex, savedVoiceSample] of savedVoiceSamples.entries()) {
      if (!savedVoiceSample?.audio_url) {
        continue;
      }

      const decodedVoiceSample = decodeStoredVoiceSample(savedVoiceSample.audio_url);

      if (!decodedVoiceSample) {
        continue;
      }

      try {
        const preparedVoiceSample = await prepareVoiceReference(decodedVoiceSample, {
          maxDurationSeconds: rules.maxDurationSeconds,
        });

        if (preparedVoiceSample.durationMs < rules.minDurationMs) {
          console.warn(
            "Skipping saved user voice sample that is too short for cloned TTS",
            {
              createdAt: savedVoiceSample.created_at,
              durationMs: preparedVoiceSample.durationMs,
              provider: input.targetLanguage.provider,
            },
          );
          continue;
        }

        validCandidates.push({
          createdAt: savedVoiceSample.created_at,
          provider: input.targetLanguage.provider,
          preparedVoiceSample,
          recencyIndex,
        });
      } catch (error) {
        console.warn("Skipping unusable saved user voice sample", {
          createdAt: savedVoiceSample.created_at,
          provider: input.targetLanguage.provider,
          error,
        });
      }
    }

    if (validCandidates.length > 0) {
      return selectPreferredVoiceSampleCandidate(
        input.targetLanguage.provider,
        validCandidates,
      ).preparedVoiceSample;
    }

    console.warn("Falling back to default TTS voice because no valid saved sample was found", {
      provider: input.targetLanguage.provider,
      userId: input.userId,
    });
    return null;
  } catch (error) {
    console.warn("Failed to load saved user voice sample", error);
    return null;
  }
}

function selectPreferredVoiceSampleCandidate(
  provider: TtsProvider,
  candidates: PreparedVoiceSampleCandidate[],
) {
  if (provider === "elevenlabs") {
    return [...candidates].sort((leftCandidate, rightCandidate) => {
      const durationDelta =
        rightCandidate.preparedVoiceSample.durationMs -
        leftCandidate.preparedVoiceSample.durationMs;

      if (durationDelta !== 0) {
        return durationDelta;
      }

      return leftCandidate.recencyIndex - rightCandidate.recencyIndex;
    })[0];
  }

  if (provider === "cartesia") {
    return [...candidates].sort((leftCandidate, rightCandidate) => {
      const distanceDelta =
        Math.abs(
          leftCandidate.preparedVoiceSample.durationMs - CARTESIA_IDEAL_DURATION_MS,
        ) -
        Math.abs(
          rightCandidate.preparedVoiceSample.durationMs - CARTESIA_IDEAL_DURATION_MS,
        );

      if (distanceDelta !== 0) {
        return distanceDelta;
      }

      return leftCandidate.recencyIndex - rightCandidate.recencyIndex;
    })[0];
  }

  return candidates[0];
}
