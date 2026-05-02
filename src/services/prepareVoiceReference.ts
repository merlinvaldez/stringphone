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

function isSupportedReferenceFormat(input: PrepareVoiceReferenceInput) {
  const lowerName = input.originalFilename.toLowerCase();
  const lowerMimeType = input.mimeType?.toLowerCase() ?? "";

  return (
    lowerName.endsWith(".mp3") ||
    lowerName.endsWith(".wav") ||
    lowerMimeType === "audio/mpeg" ||
    lowerMimeType === "audio/mp3" ||
    lowerMimeType === "audio/wav" ||
    lowerMimeType === "audio/x-wav"
  );
}

function runFfmpeg(inputPath: string, outputPath: string) {
  return new Promise<void>((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg binary is not available."));
      return;
    }

    const ffmpeg = spawn(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      outputPath,
    ]);

    let stderr = "";

    ffmpeg.stderr.on("data", (chunk) => {
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

export async function prepareVoiceReference(input: PrepareVoiceReferenceInput) {
  if (isSupportedReferenceFormat(input)) {
    return input.audioBuffer;
  }

  const tempId = randomUUID();
  const inputPath = path.join(os.tmpdir(), `stringphone-ref-${tempId}.webm`);
  const outputPath = path.join(os.tmpdir(), `stringphone-ref-${tempId}.wav`);

  try {
    await writeFile(inputPath, input.audioBuffer);
    await runFfmpeg(inputPath, outputPath);
    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(outputPath),
    ]);
  }
}
