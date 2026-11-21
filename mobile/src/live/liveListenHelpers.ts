export const SPEECH_DBFS_THRESHOLD = -46;
export const MIN_SPEECH_MS = 550;
export const SILENCE_FINALIZE_MS = 750;
export const MAX_CHUNK_MS = 6_000;
export const IDLE_ROLLOVER_MS = 2_500;

export function selectNativeSegmentAudioForPersistence<
  T extends { singleSpeakerAudioEligible: boolean },
>(
  segment: T,
  segmentIndex: number,
  recording: { uri: string; durationMs: number },
): { uri: string; durationMs: number } | undefined {
  return segment.singleSpeakerAudioEligible === true && segmentIndex === 0 ? recording : undefined;
}
