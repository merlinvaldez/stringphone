import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { unlink, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export type PrepareVoiceReferenceInput = {
  audioBuffer: Buffer;
  originalFilename: string;
  mimeType?: string;
};

export type PreparedVoiceReference = {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  durationMs: number;
};

type PrepareVoiceReferenceOptions = {
  maxDurationSeconds?: number;
};

function getInputExtension(input: PrepareVoiceReferenceInput) {
  const lowerName = input.originalFilename.toLowerCase();
  const lowerMimeType = input.mimeType?.toLowerCase() ?? "";

  if (lowerName.endsWith(".wav") || lowerMimeType.includes("wav")) {
    return "wav";
  }

  if (
    lowerName.endsWith(".mp3") ||
    lowerMimeType === "audio/mpeg" ||
    lowerMimeType === "audio/mp3"
  ) {
    return "mp3";
  }

  if (lowerName.endsWith(".m4a") || lowerMimeType.includes("mp4")) {
    return "m4a";
  }

  if (lowerName.endsWith(".ogg") || lowerMimeType.includes("ogg")) {
    return "ogg";
  }

  if (lowerName.endsWith(".webm") || lowerMimeType.includes("webm")) {
    return "webm";
  }

  return "bin";
}

function getVoiceReferenceFilter(maxDurationSeconds?: number) {
  const filterSteps = [
    "silenceremove=start_periods=1:start_duration=0.08:start_threshold=-55dB:stop_periods=0",
    "areverse",
    "silenceremove=start_periods=1:start_duration=0.12:start_threshold=-55dB:stop_periods=0",
    "areverse",
  ];

  if (typeof maxDurationSeconds === "number" && maxDurationSeconds > 0) {
    filterSteps.push(`atrim=0:${maxDurationSeconds}`);
  }

  return filterSteps.join(",");
}

function getWavDurationMs(audioBuffer: Buffer) {
  if (
    audioBuffer.length < 44 ||
    audioBuffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audioBuffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return 0;
  }

  const byteRate = audioBuffer.readUInt32LE(28);

  if (!byteRate) {
    return 0;
  }

  let offset = 12;
  let dataSize = 0;

  while (offset + 8 <= audioBuffer.length) {
    const chunkId = audioBuffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = audioBuffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const nextOffset = chunkDataStart + chunkSize + (chunkSize % 2);

    if (chunkId === "data") {
      dataSize = Math.min(chunkSize, Math.max(audioBuffer.length - chunkDataStart, 0));
      break;
    }

    offset = nextOffset;
  }

  if (!dataSize) {
    return 0;
  }

  return Math.round((dataSize / byteRate) * 1000);
}

function runFfmpeg(
  inputPath: string,
  outputPath: string,
  maxDurationSeconds?: number,
) {
  return new Promise<void>((resolve, reject) => {
    const executablePath =
      typeof ffmpegPath === "string"
        ? ffmpegPath
        : typeof ffmpegPath?.default === "string"
          ? ffmpegPath.default
          : null;

    if (!executablePath) {
      reject(new Error("ffmpeg binary is not available."));
      return;
    }

    const ffmpeg = spawn(executablePath, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-af",
      getVoiceReferenceFilter(maxDurationSeconds),
      "-ac",
      "1",
      "-ar",
      "44100",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);

    let stderr = "";

    ffmpeg.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `ffmpeg failed while preparing voice reference (exit ${code}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

export async function prepareVoiceReference(
  input: PrepareVoiceReferenceInput,
  options: PrepareVoiceReferenceOptions = {},
): Promise<PreparedVoiceReference> {
  const tempId = randomUUID();
  const inputPath = path.join(
    os.tmpdir(),
    `stringphone-ref-input-${tempId}.${getInputExtension(input)}`,
  );
  const outputPath = path.join(os.tmpdir(), `stringphone-ref-output-${tempId}.wav`);
  const outputFilename = `${path.parse(input.originalFilename).name || "stringphone-ref"}.wav`;

  try {
    await writeFile(inputPath, input.audioBuffer);
    await runFfmpeg(inputPath, outputPath, options.maxDurationSeconds);
    const preparedBuffer = await readFile(outputPath);
    const durationMs = getWavDurationMs(preparedBuffer);

    if (!durationMs) {
      throw new Error("Prepared voice reference did not contain valid audio.");
    }

    return {
      buffer: preparedBuffer,
      filename: outputFilename,
      mimeType: "audio/wav",
      durationMs,
    };
  } finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(outputPath),
    ]);
  }
}
