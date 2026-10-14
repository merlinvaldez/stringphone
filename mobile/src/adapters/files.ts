import { Directory, File, Paths } from 'expo-file-system';

// Obtaining this handle does not create a directory or save a recording.
// Step 4 owns file writes, DB coordination and missing-file recovery.
export function getNativeAudioDirectory() {
  return new Directory(Paths.document, 'stringphone-audio');
}
export { File };
