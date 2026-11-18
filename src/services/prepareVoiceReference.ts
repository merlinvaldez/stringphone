import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const MIN_VOICE_CLONE_DURATION_MS = 10_000;
export const MAX_VOICE_CLONE_DURATION_MS = 60_000;

export type PrepareVoiceReferenceInput = {
  audioBuffer: Buffer;
  originalFilename: string;
  mimeType?: string;
};

export type PrepareVoiceReferenceOptions = {
  maxDurationSeconds?: number;
};

export type PreparedVoiceReference = {
  buffer: Buffer;
  filename: string;
  mimeType: "audio/wav";
  durationMs: number;
};

export type VoiceCloneSampleSelection = {
  eligible: boolean;
  mode: "single" | "merged" | "insufficient";
  totalDurationMs: number;
  mergedReference: PreparedVoiceReference | null;
  usedSampleCount: number;
};

export type ParsedPcmWav = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  pcmData: Buffer;
  durationMs: number;
};

function getInputExtension(input: PrepareVoiceReferenceInput) {
  const filenameExtension = path
    .extname(input.originalFilename)
    .replace(/^\./, "")
    .trim()
    .toLowerCase();

  if (filenameExtension) {
    return filenameExtension;
  }

  const lowerMimeType = input.mimeType?.toLowerCase() ?? "";

  if (lowerMimeType.includes("mpeg") || lowerMimeType.includes("mp3")) {
    return "mp3";
  }

  if (lowerMimeType.includes("wav")) {
    return "wav";
  }

  if (lowerMimeType.includes("ogg")) {
    return "ogg";
  }

  if (lowerMimeType.includes("mp4") || lowerMimeType.includes("m4a")) {
    return "m4a";
  }

  if (lowerMimeType.includes("webm")) {
    return "webm";
  }

  return "bin";
}

export function parsePcmWav(audioBuffer: Buffer): ParsedPcmWav | null {
  if (
    !Buffer.isBuffer(audioBuffer) ||
    audioBuffer.length < 44 ||
    audioBuffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audioBuffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return null;
  }

  let offset = 12;
  let audioFormat = 1;
  let channels = 1;
  let sampleRate = 44100;
  let byteRate = 88200;
  let blockAlign = 2;
  let bitsPerSample = 16;
  let hasFmt = false;
  let pcmData: Buffer | null = null;

  while (offset + 8 <= audioBuffer.length) {
    const chunkId = audioBuffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = audioBuffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const nextOffset = chunkDataStart + chunkSize + (chunkSize % 2);

    if (chunkId === "fmt " && chunkDataStart + 16 <= audioBuffer.length) {
      audioFormat = audioBuffer.readUInt16LE(chunkDataStart);
      channels = audioBuffer.readUInt16LE(chunkDataStart + 2);
      sampleRate = audioBuffer.readUInt32LE(chunkDataStart + 4);
      byteRate = audioBuffer.readUInt32LE(chunkDataStart + 8);
      blockAlign = audioBuffer.readUInt16LE(chunkDataStart + 12);
      bitsPerSample = audioBuffer.readUInt16LE(chunkDataStart + 14);
      hasFmt = true;
    } else if (chunkId === "data") {
      const available = Math.min(
        chunkSize,
        Math.max(audioBuffer.length - chunkDataStart, 0),
      );
      pcmData = audioBuffer.subarray(chunkDataStart, chunkDataStart + available);
      break;
    }

    if (nextOffset <= offset) {
      break;
    }
    offset = nextOffset;
  }

  if (!hasFmt || !pcmData || !byteRate || pcmData.length === 0) {
    return null;
  }

  const durationMs = Math.round((pcmData.length / byteRate) * 1000);

  return {
    audioFormat,
    channels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample,
    pcmData,
    durationMs,
  };
}

export function getWavDurationMs(audioBuffer: Buffer): number {
  return parsePcmWav(audioBuffer)?.durationMs ?? 0;
}

export function createCanonicalPcmWavBuffer(
  pcmData: Buffer,
  sampleRate = 44100,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const alignedLength = pcmData.length - (pcmData.length % blockAlign);
  const alignedPcm =
    alignedLength === pcmData.length
      ? pcmData
      : pcmData.subarray(0, alignedLength);

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + alignedPcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(alignedPcm.length, 40);

  return Buffer.concat([header, alignedPcm]);
}

export function trimCanonicalPcmWavBuffer(
  wavBuffer: Buffer,
  maxDurationMs = MAX_VOICE_CLONE_DURATION_MS,
): Buffer {
  const parsed = parsePcmWav(wavBuffer);
  if (!parsed || parsed.durationMs <= maxDurationMs) {
    return wavBuffer;
  }

  const maxBytes =
    Math.floor((maxDurationMs / 1000) * parsed.byteRate) -
    (Math.floor((maxDurationMs / 1000) * parsed.byteRate) % parsed.blockAlign);

  return createCanonicalPcmWavBuffer(
    parsed.pcmData.subarray(0, Math.max(0, maxBytes)),
    parsed.sampleRate,
    parsed.channels,
    parsed.bitsPerSample,
  );
}

export function concatenatePcmWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) {
    return Buffer.alloc(0);
  }

  if (wavBuffers.length === 1) {
    const singleParsed = parsePcmWav(wavBuffers[0]);
    if (!singleParsed) {
      throw new Error("Invalid WAV buffer for concatenation.");
    }
    return createCanonicalPcmWavBuffer(
      singleParsed.pcmData,
      singleParsed.sampleRate,
      singleParsed.channels,
      singleParsed.bitsPerSample,
    );
  }

  const parsedBuffers = wavBuffers.map((buf) => {
    const parsed = parsePcmWav(buf);
    if (!parsed) {
      throw new Error("Invalid WAV buffer for concatenation.");
    }
    return parsed;
  });

  const first = parsedBuffers[0];
  const combinedPcm = Buffer.concat(parsedBuffers.map((item) => item.pcmData));

  return createCanonicalPcmWavBuffer(
    combinedPcm,
    first.sampleRate,
    first.channels,
    first.bitsPerSample,
  );
}

function normalizeParsedWavToCanonicalPcm(
  parsed: ParsedPcmWav,
  targetSampleRate = 44100,
): Buffer | null {
  if (
    parsed.audioFormat === 1 &&
    parsed.channels === 1 &&
    parsed.sampleRate === targetSampleRate &&
    parsed.bitsPerSample === 16
  ) {
    return createCanonicalPcmWavBuffer(
      parsed.pcmData,
      targetSampleRate,
      1,
      16,
    );
  }

  if (
    (parsed.audioFormat !== 1 && parsed.audioFormat !== 3) ||
    (parsed.bitsPerSample !== 16 && parsed.bitsPerSample !== 32) ||
    parsed.channels < 1 ||
    parsed.sampleRate <= 0
  ) {
    return null;
  }

  const bytesPerSample = parsed.bitsPerSample / 8;
  const frameSize = bytesPerSample * parsed.channels;
  const frameCount = Math.floor(parsed.pcmData.length / frameSize);
  if (frameCount <= 0) {
    return null;
  }

  // Downmix to mono float [-1, 1]
  const monoFloat = new Float32Array(frameCount);
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    let sum = 0;
    const frameOffset = frameIndex * frameSize;
    for (let ch = 0; ch < parsed.channels; ch += 1) {
      const sampleOffset = frameOffset + ch * bytesPerSample;
      let val = 0;
      if (parsed.audioFormat === 3 && parsed.bitsPerSample === 32) {
        val = parsed.pcmData.readFloatLE(sampleOffset);
      } else if (parsed.audioFormat === 1 && parsed.bitsPerSample === 16) {
        val = parsed.pcmData.readInt16LE(sampleOffset) / 32768;
      } else if (parsed.audioFormat === 1 && parsed.bitsPerSample === 32) {
        val = parsed.pcmData.readInt32LE(sampleOffset) / 2147483648;
      }
      sum += val;
    }
    monoFloat[frameIndex] = sum / parsed.channels;
  }

  // Resample to targetSampleRate using linear interpolation
  const outputFrames =
    parsed.sampleRate === targetSampleRate
      ? frameCount
      : Math.max(1, Math.round((frameCount * targetSampleRate) / parsed.sampleRate));
  const outPcm = Buffer.alloc(outputFrames * 2);

  for (let i = 0; i < outputFrames; i += 1) {
    const srcPos =
      parsed.sampleRate === targetSampleRate
        ? i
        : (i * parsed.sampleRate) / targetSampleRate;
    const idx0 = Math.min(frameCount - 1, Math.floor(srcPos));
    const idx1 = Math.min(frameCount - 1, idx0 + 1);
    const frac = srcPos - idx0;
    const sample = monoFloat[idx0] * (1 - frac) + monoFloat[idx1] * frac;
    const clamped = Math.max(-1, Math.min(1, sample));
    const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    outPcm.writeInt16LE(int16, i * 2);
  }

  return createCanonicalPcmWavBuffer(outPcm, targetSampleRate, 1, 16);
}

function runFfmpeg(
  inputPath: string,
  outputPath: string,
  maxDurationSeconds?: number,
) {
  return new Promise<void>((resolve, reject) => {
    const candidatePath =
      typeof ffmpegPath === "string"
        ? ffmpegPath
        : typeof (ffmpegPath as { default?: unknown } | null)?.default === "string"
          ? ((ffmpegPath as unknown as { default: string }).default)
          : null;

    const executablePath =
      candidatePath && existsSync(candidatePath) ? candidatePath : "ffmpeg";

    const args = ["-y", "-i", inputPath, "-vn"];

    if (typeof maxDurationSeconds === "number" && maxDurationSeconds > 0) {
      args.push("-af", `atrim=0:${maxDurationSeconds}`);
    }

    args.push("-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", outputPath);

    const ffmpeg = spawn(executablePath, args);
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
  const outputFilename = `${path.parse(input.originalFilename || "stringphone-ref").name || "stringphone-ref"}.wav`;

  // Pure-TypeScript fast-path for any valid PCM WAV buffer (mono or stereo, 16-bit or 32-bit float, any sample rate)
  const directWav = parsePcmWav(input.audioBuffer);
  const normalizedWav = directWav
    ? normalizeParsedWavToCanonicalPcm(directWav, 44100)
    : null;
  if (normalizedWav) {
    let canonical = normalizedWav;
    if (
      typeof options.maxDurationSeconds === "number" &&
      options.maxDurationSeconds > 0
    ) {
      canonical = trimCanonicalPcmWavBuffer(
        canonical,
        Math.round(options.maxDurationSeconds * 1000),
      );
    }
    const durationMs = getWavDurationMs(canonical);
    if (!durationMs) {
      throw new Error("Prepared voice reference did not contain valid audio.");
    }
    return {
      buffer: canonical,
      filename: outputFilename,
      mimeType: "audio/wav",
      durationMs,
    };
  }

  const tempId = randomUUID();
  const inputPath = path.join(
    os.tmpdir(),
    `stringphone-ref-input-${tempId}.${getInputExtension(input)}`,
  );
  const outputPath = path.join(
    os.tmpdir(),
    `stringphone-ref-output-${tempId}.wav`,
  );

  try {
    await writeFile(inputPath, input.audioBuffer);
    await runFfmpeg(inputPath, outputPath, options.maxDurationSeconds);
    const preparedBuffer = await readFile(outputPath);
    const parsed = parsePcmWav(preparedBuffer);

    if (!parsed || !parsed.durationMs) {
      throw new Error("Prepared voice reference did not contain valid audio.");
    }

    const canonical = createCanonicalPcmWavBuffer(
      parsed.pcmData,
      parsed.sampleRate,
      parsed.channels,
      parsed.bitsPerSample,
    );

    return {
      buffer: canonical,
      filename: outputFilename,
      mimeType: "audio/wav",
      durationMs: getWavDurationMs(canonical),
    };
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

export function selectAndMergeVoiceSamplesForCloning(
  samples: PreparedVoiceReference[],
  minDurationMs = MIN_VOICE_CLONE_DURATION_MS,
): VoiceCloneSampleSelection {
  const validSamples = samples.filter(
    (sample) =>
      sample &&
      Buffer.isBuffer(sample.buffer) &&
      sample.durationMs > 0 &&
      parsePcmWav(sample.buffer) !== null,
  );

  if (validSamples.length === 0) {
    return {
      eligible: false,
      mode: "insufficient",
      totalDurationMs: 0,
      mergedReference: null,
      usedSampleCount: 0,
    };
  }

  // Requirement 1: If any single sample is >= 10 seconds, use the most recent qualifying single sample.
  for (let index = validSamples.length - 1; index >= 0; index -= 1) {
    const candidate = validSamples[index];
    if (candidate.durationMs >= minDurationMs) {
      const trimmedBuffer = trimCanonicalPcmWavBuffer(
        candidate.buffer,
        MAX_VOICE_CLONE_DURATION_MS,
      );
      const durationMs = getWavDurationMs(trimmedBuffer);
      return {
        eligible: true,
        mode: "single",
        totalDurationMs: durationMs,
        mergedReference: {
          buffer: trimmedBuffer,
          filename: candidate.filename || "stringphone-single-ref.wav",
          mimeType: "audio/wav",
          durationMs,
        },
        usedSampleCount: 1,
      };
    }
  }

  // Requirement 2: Otherwise merge multiple audio samples to make 10+ seconds.
  const selectedSamples: PreparedVoiceReference[] = [];
  let accumulatedDurationMs = 0;

  for (const sample of validSamples) {
    selectedSamples.push(sample);
    accumulatedDurationMs += sample.durationMs;
    if (accumulatedDurationMs >= MAX_VOICE_CLONE_DURATION_MS) {
      break;
    }
  }

  if (accumulatedDurationMs < minDurationMs) {
    return {
      eligible: false,
      mode: "insufficient",
      totalDurationMs: accumulatedDurationMs,
      mergedReference: null,
      usedSampleCount: selectedSamples.length,
    };
  }

  const mergedBuffer = trimCanonicalPcmWavBuffer(
    concatenatePcmWavBuffers(selectedSamples.map((item) => item.buffer)),
    MAX_VOICE_CLONE_DURATION_MS,
  );
  const mergedDurationMs = getWavDurationMs(mergedBuffer);

  if (mergedDurationMs < minDurationMs) {
    return {
      eligible: false,
      mode: "insufficient",
      totalDurationMs: mergedDurationMs,
      mergedReference: null,
      usedSampleCount: selectedSamples.length,
    };
  }

  return {
    eligible: true,
    mode: "merged",
    totalDurationMs: mergedDurationMs,
    mergedReference: {
      buffer: mergedBuffer,
      filename: "stringphone-merged-ref.wav",
      mimeType: "audio/wav",
      durationMs: mergedDurationMs,
    },
    usedSampleCount: selectedSamples.length,
  };
}
