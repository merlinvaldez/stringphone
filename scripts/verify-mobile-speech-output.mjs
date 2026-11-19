import assert from 'node:assert/strict';

const { splitSpeechTextIntoChunks, parseWav, concatenateWavBuffers } = await import('../mobile/src/adapters/speech.ts');
const { AudioPlaybackCoordinator } = await import('../mobile/src/adapters/playbackCoordinator.ts');

// 1. Text chunking tests
{
  const short = 'Hello world! How are you today?';
  const chunks = splitSpeechTextIntoChunks(short, 500);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], short);

  // Exactly 500 chars
  const exact500 = 'A'.repeat(500);
  const chunks500 = splitSpeechTextIntoChunks(exact500, 500);
  assert.equal(chunks500.length, 1);
  assert.equal(chunks500[0].length, 500);

  // Long text (> 500 chars) with sentences
  const sentence1 = 'This is the first sentence that will be spoken by the text to speech engine. '.repeat(5); // ~385 chars
  const sentence2 = 'This is the second sentence that continues the conversation with more details. '.repeat(5); // ~395 chars
  const fullText = sentence1 + sentence2; // ~780 chars
  const splitChunks = splitSpeechTextIntoChunks(fullText, 500);
  assert.ok(splitChunks.length >= 2, `Expected >= 2 chunks, got ${splitChunks.length}`);
  for (const chunk of splitChunks) {
    assert.ok(chunk.length <= 500, `Chunk length ${chunk.length} exceeds 500 characters`);
    assert.ok(chunk.trim().length > 0, 'Chunk should not be empty');
  }

  // Combined text matches original when trimmed sentences reassembled
  const reconstructed = splitChunks.join(' ');
  assert.ok(reconstructed.includes('first sentence'));
  assert.ok(reconstructed.includes('second sentence'));
}

// 2. WAV PCM concatenation tests
function createMockWav(pcmLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(buffer);

  // "RIFF"
  view.setUint8(0, 0x52); view.setUint8(1, 0x49); view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + pcmLength, true);
  // "WAVE"
  view.setUint8(8, 0x57); view.setUint8(9, 0x41); view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // "fmt "
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d); view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true); // subchunk1 size
  view.setUint16(20, 1, true); // audioFormat: 1 (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // "data"
  view.setUint8(36, 0x64); view.setUint8(37, 0x61); view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, pcmLength, true);

  const uint8 = new Uint8Array(buffer);
  for (let i = 0; i < pcmLength; i++) {
    uint8[44 + i] = (i % 256);
  }
  return uint8;
}

{
  const wav1 = createMockWav(2400); // 50ms of audio
  const parsed1 = parseWav(wav1);
  assert.equal(parsed1.format, 1);
  assert.equal(parsed1.channels, 1);
  assert.equal(parsed1.sampleRate, 24000);
  assert.equal(parsed1.bitsPerSample, 16);
  assert.equal(parsed1.pcmData.length, 2400);

  const wav2 = createMockWav(4800); // 100ms of audio
  const merged = concatenateWavBuffers([wav1, wav2]);
  const parsedMerged = parseWav(merged);

  assert.equal(parsedMerged.format, 1);
  assert.equal(parsedMerged.channels, 1);
  assert.equal(parsedMerged.sampleRate, 24000);
  assert.equal(parsedMerged.bitsPerSample, 16);
  assert.equal(parsedMerged.pcmData.length, 7200); // 2400 + 4800
  assert.equal(merged.length, 44 + 7200);

  // Single buffer returns unchanged
  const single = concatenateWavBuffers([wav1]);
  assert.equal(single.length, wav1.length);
}

// 3. AudioPlaybackCoordinator tests
{
  AudioPlaybackCoordinator.setRecording(false);
  AudioPlaybackCoordinator.stopPlayback();

  let stopCalled1 = false;
  let stopCalled2 = false;

  // Normal playback starts
  const started1 = AudioPlaybackCoordinator.startPlayback('msg-1:source', () => {
    stopCalled1 = true;
  });
  assert.equal(started1, true);
  assert.equal(AudioPlaybackCoordinator.getActivePlaybackId(), 'msg-1:source');

  // Second playback automatically stops first
  const started2 = AudioPlaybackCoordinator.startPlayback('msg-2:translated', () => {
    stopCalled2 = true;
  });
  assert.equal(started2, true);
  assert.equal(stopCalled1, true, 'First player should have been stopped');
  assert.equal(AudioPlaybackCoordinator.getActivePlaybackId(), 'msg-2:translated');

  // Recording starts: must stop active playback immediately
  AudioPlaybackCoordinator.setRecording(true);
  assert.equal(stopCalled2, true, 'Second player should have been stopped when recording started');
  assert.equal(AudioPlaybackCoordinator.isRecording(), true);
  assert.equal(AudioPlaybackCoordinator.getActivePlaybackId(), null);

  // Playback cannot start while recording is active
  let stopCalled3 = false;
  const started3 = AudioPlaybackCoordinator.startPlayback('msg-3:source', () => {
    stopCalled3 = true;
  });
  assert.equal(started3, false, 'Playback should be blocked during recording');
  assert.equal(stopCalled3, false);

  // Recording stops: playback allowed again
  AudioPlaybackCoordinator.setRecording(false);
  assert.equal(AudioPlaybackCoordinator.isRecording(), false);
  const started4 = AudioPlaybackCoordinator.startPlayback('msg-4:source', () => {});
  assert.equal(started4, true);
  AudioPlaybackCoordinator.stopPlayback('msg-4:source');
  assert.equal(AudioPlaybackCoordinator.getActivePlaybackId(), null);
}

console.log('Mobile speech chunking, WAV concatenation, and AudioPlaybackCoordinator checks passed.');
