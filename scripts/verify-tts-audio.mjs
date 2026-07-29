import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

import { db } from "../src/db/client.ts";
import { getSupportedTtsLanguage } from "../src/lib/languages.ts";
import { runOutputTextToSpeech } from "../src/lib/runOutputTextToSpeech.ts";
import { prepareVoiceReference } from "../src/services/prepareVoiceReference.ts";
import { getRecentUserVoiceSamples } from "../src/db/queries/voiceSamples.ts";

const SAMPLE_TEXT_BY_LANGUAGE = {
  it: "Ciao, come stai oggi?",
  sv: "Hej, hur mar du idag?",
  fa: "سلام، امروز حال شما چطور است؟",
};

function parseArgs() {
  const userId = Number(process.argv[2] ?? "1");
  const languageCodes = (process.argv[3] ?? "it,sv,fa")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!Number.isInteger(userId) || userId < 1) {
    throw new Error("userId must be a positive integer.");
  }

  if (languageCodes.length === 0) {
    throw new Error("Provide at least one language code.");
  }

  return {
    userId,
    languageCodes,
  };
}

function decodeStoredVoiceSample(audioValue) {
  const trimmedAudioValue = audioValue.trim();

  if (!trimmedAudioValue) {
    return null;
  }

  if (trimmedAudioValue.startsWith("data:")) {
    const match = trimmedAudioValue.match(/^data:([^;]+);base64,(.+)$/i);

    if (!match) {
      return null;
    }

    return {
      audioBuffer: Buffer.from(match[2], "base64"),
      originalFilename: getDecodedSampleFilename(match[1]),
      mimeType: match[1],
    };
  }

  const inferredFormat = inferStoredVoiceSampleFormat(
    Buffer.from(trimmedAudioValue, "base64"),
  );

  return {
    audioBuffer: Buffer.from(trimmedAudioValue, "base64"),
    originalFilename: inferredFormat.filename,
    mimeType: inferredFormat.mimeType,
  };
}

function getDecodedSampleFilename(mimeType) {
  if (mimeType.includes("webm")) {
    return "saved-sample.webm";
  }

  if (mimeType.includes("wav")) {
    return "saved-sample.wav";
  }

  if (mimeType.includes("ogg")) {
    return "saved-sample.ogg";
  }

  return "saved-sample.mp3";
}

function inferStoredVoiceSampleFormat(audioBuffer) {
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
        filename: "saved-sample.webm",
        mimeType: "audio/webm",
      };
    }

    if (asciiHeader.startsWith("OggS")) {
      return {
        filename: "saved-sample.ogg",
        mimeType: "audio/ogg",
      };
    }

    if (asciiHeader.startsWith("RIFF") && asciiHeader.slice(8, 12) === "WAVE") {
      return {
        filename: "saved-sample.wav",
        mimeType: "audio/wav",
      };
    }
  }

  return {
    filename: "saved-sample.mp3",
    mimeType: "audio/mpeg",
  };
}

function analyzeAudioBuffer(audioBuffer, label) {
  const tempDirectory = mkdtempSync(path.join(os.tmpdir(), "stringphone-verify-tts-"));
  const filePath = path.join(tempDirectory, `${label}.mp3`);

  try {
    writeFileSync(filePath, audioBuffer);
    const result = spawnSync(
      ffmpegPath,
      [
        "-i",
        filePath,
        "-af",
        "volumedetect",
        "-f",
        "null",
        process.platform === "win32" ? "NUL" : "/dev/null",
      ],
      {
        encoding: "utf8",
      },
    );
    const stderr = result.stderr || "";

    return {
      ffmpegStatus: result.status,
      meanVolumeDb: Number(
        (stderr.match(/mean_volume:\s*([-\d.]+) dB/) || [])[1] ?? NaN,
      ),
      maxVolumeDb: Number(
        (stderr.match(/max_volume:\s*([-\d.]+) dB/) || [])[1] ?? NaN,
      ),
      durationSeconds: Number(
        (
          stderr.match(/Duration:\s*\d+:\d+:([\d.]+)/) || []
        )[1] ?? NaN,
      ),
    };
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

async function getSampleDurations(userId) {
  const samples = await getRecentUserVoiceSamples({
    userId,
    limit: 8,
  });

  const sampleDurations = [];

  for (const sample of samples) {
    const decodedSample = decodeStoredVoiceSample(sample.audio_url);

    if (!decodedSample) {
      sampleDurations.push({
        createdAt: sample.created_at,
        error: "Could not decode saved sample",
      });
      continue;
    }

    try {
      const preparedSample = await prepareVoiceReference(decodedSample, {
        maxDurationSeconds: 90,
      });

      sampleDurations.push({
        createdAt: sample.created_at,
        durationMs: preparedSample.durationMs,
      });
    } catch (error) {
      sampleDurations.push({
        createdAt: sample.created_at,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return sampleDurations;
}

async function verifyLanguage(userId, languageCode) {
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
    userId,
  });

  if (!result.ok) {
    return {
      languageCode,
      provider: supportedLanguage.provider,
      ok: false,
      error: result.body,
    };
  }

  return {
    languageCode,
    provider: supportedLanguage.provider,
    ok: true,
    byteLength: result.audioBuffer.length,
    analysis: analyzeAudioBuffer(result.audioBuffer, languageCode),
  };
}

async function main() {
  const { userId, languageCodes } = parseArgs();
  const sampleDurations = await getSampleDurations(userId);
  const results = [];

  for (const languageCode of languageCodes) {
    results.push(await verifyLanguage(userId, languageCode));
  }

  console.log(
    JSON.stringify(
      {
        userId,
        sampleDurations,
        results,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
