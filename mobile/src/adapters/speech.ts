import { getSupportedTtsLanguage } from '../shared';
import type { createProcessingTransport } from './processingTransport';

export const MAX_SPEECH_CHUNK_CHARACTERS = 500;

export function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export function splitSpeechTextIntoChunks(text: string, maxChunkLength = MAX_SPEECH_CHUNK_CHARACTERS): string[] {
  const normalized = normalizeSpeechText(text);
  if (!normalized) return [];
  if (normalized.length <= maxChunkLength) return [normalized];

  const chunks: string[] = [];
  // Split on sentence boundaries first
  const sentences = normalized.match(/[^.!?\n]+[.!?\n]+|[^.!?\n]+$/g) || [normalized];
  let currentChunk = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;

    if (trimmedSentence.length > maxChunkLength) {
      // If a single sentence is longer than maxChunkLength, split by clauses/words
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      const words = trimmedSentence.split(' ');
      let wordChunk = '';
      for (const word of words) {
        if (!word) continue;
        const candidate = wordChunk ? `${wordChunk} ${word}` : word;
        if (candidate.length <= maxChunkLength) {
          wordChunk = candidate;
        } else {
          if (wordChunk) chunks.push(wordChunk);
          // If a single word is somehow > maxChunkLength, hard slice
          if (word.length > maxChunkLength) {
            let remaining = word;
            while (remaining.length > maxChunkLength) {
              chunks.push(remaining.slice(0, maxChunkLength));
              remaining = remaining.slice(maxChunkLength);
            }
            wordChunk = remaining;
          } else {
            wordChunk = word;
          }
        }
      }
      if (wordChunk) chunks.push(wordChunk);
    } else {
      const candidate = currentChunk ? `${currentChunk} ${trimmedSentence}` : trimmedSentence;
      if (candidate.length <= maxChunkLength) {
        currentChunk = candidate;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = trimmedSentence;
      }
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

interface ParsedWav {
  format: number;
  channels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  pcmData: Uint8Array;
}

export function parseWav(buffer: Uint8Array): ParsedWav {
  if (buffer.length < 44) throw new Error('WAV buffer is too short.');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const riff = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  const wave = String.fromCharCode(buffer[8], buffer[9], buffer[10], buffer[11]);
  if (riff !== 'RIFF' || wave !== 'WAVE') throw new Error('Invalid WAV header.');

  let offset = 12;
  let format = 1;
  let channels = 1;
  let sampleRate = 24000;
  let byteRate = 48000;
  let blockAlign = 2;
  let bitsPerSample = 16;
  let pcmData: Uint8Array | null = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = String.fromCharCode(
      buffer[offset],
      buffer[offset + 1],
      buffer[offset + 2],
      buffer[offset + 3],
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;

    if (chunkId === 'fmt ') {
      format = view.getUint16(chunkDataStart, true);
      channels = view.getUint16(chunkDataStart + 2, true);
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      byteRate = view.getUint32(chunkDataStart + 8, true);
      blockAlign = view.getUint16(chunkDataStart + 12, true);
      bitsPerSample = view.getUint16(chunkDataStart + 14, true);
    } else if (chunkId === 'data') {
      const available = Math.min(chunkSize, buffer.length - chunkDataStart);
      pcmData = buffer.subarray(chunkDataStart, chunkDataStart + available);
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!pcmData) throw new Error('WAV data chunk not found.');
  return { format, channels, sampleRate, byteRate, blockAlign, bitsPerSample, pcmData };
}

export function concatenateWavBuffers(buffers: Uint8Array[]): Uint8Array {
  if (buffers.length === 0) return new Uint8Array(0);
  if (buffers.length === 1) return buffers[0];

  const parsedList = buffers.map(parseWav);
  const first = parsedList[0];
  let totalPcmLength = 0;
  for (const item of parsedList) {
    totalPcmLength += item.pcmData.length;
  }

  const outBuffer = new Uint8Array(44 + totalPcmLength);
  const view = new DataView(outBuffer.buffer);

  // RIFF header
  outBuffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + totalPcmLength, true);
  outBuffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // fmt subchunk
  outBuffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, first.format, true); // AudioFormat
  view.setUint16(22, first.channels, true); // NumChannels
  view.setUint32(24, first.sampleRate, true); // SampleRate
  view.setUint32(28, first.byteRate, true); // ByteRate
  view.setUint16(32, first.blockAlign, true); // BlockAlign
  view.setUint16(34, first.bitsPerSample, true); // BitsPerSample

  // data subchunk
  outBuffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, totalPcmLength, true);

  let pcmOffset = 44;
  for (const item of parsedList) {
    outBuffer.set(item.pcmData, pcmOffset);
    pcmOffset += item.pcmData.length;
  }

  return outBuffer;
}

export interface OutputSpeechRequest {
  text: string;
  language: string;
  speechVoice?: 'marin' | 'onyx';
  signal?: AbortSignal;
}

export interface OutputSpeechResult {
  bytes: Uint8Array;
  format: 'wav';
  mimeType: 'audio/wav';
  durationMs: number;
}

export function createSpeechApi(transport: ReturnType<typeof createProcessingTransport>) {
  return {
    async requestOutputSpeech(request: OutputSpeechRequest): Promise<OutputSpeechResult> {
      const normalized = normalizeSpeechText(request.text);
      if (!normalized) {
        throw new Error('Text is required for speech generation.');
      }

      const supported = getSupportedTtsLanguage(request.language);
      if (!supported) {
        throw new Error(`Language '${request.language}' is not supported for speech output.`);
      }

      if (
        request.speechVoice !== undefined &&
        request.speechVoice !== 'marin' &&
        request.speechVoice !== 'onyx'
      ) {
        throw new Error(`Speech voice '${String(request.speechVoice)}' is not supported.`);
      }

      const chunks = splitSpeechTextIntoChunks(normalized, MAX_SPEECH_CHUNK_CHARACTERS);
      const audioBuffers: Uint8Array[] = [];

      for (const chunk of chunks) {
        if (request.signal?.aborted) {
          throw new Error('Speech generation was interrupted.');
        }

        const response = await transport.post(
          '/speech/output',
          {
            text: chunk,
            language: supported.code,
            ...(request.speechVoice ? { speechVoice: request.speechVoice } : {}),
          },
          request.signal,
        );

        const arrayBuffer = await response.arrayBuffer();
        audioBuffers.push(new Uint8Array(arrayBuffer));
      }

      const combined = concatenateWavBuffers(audioBuffers);
      const parsed = parseWav(combined);
      const durationMs = parsed.byteRate > 0
        ? Math.round((parsed.pcmData.length / parsed.byteRate) * 1000)
        : 0;

      return {
        bytes: combined,
        format: 'wav',
        mimeType: 'audio/wav',
        durationMs,
      };
    },
  };
}
