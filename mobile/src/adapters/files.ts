import { Directory, File, Paths } from 'expo-file-system';
import type { AudioFiles } from '../storage/audio';
import { isManagedAudioName } from '../storage/audio';

// Obtaining this handle does not create a directory or save a recording.
// Step 4 owns file writes, DB coordination and missing-file recovery.
export function getNativeAudioDirectory() {
  return new Directory(Paths.document, 'stringphone-audio');
}
export { File };

export function createNativeAudioFiles(): AudioFiles {
  const directory = getNativeAudioDirectory();
  function fileFor(name: string) {
    if (!isManagedAudioName(name)) throw new Error('Invalid audio filename.');
    return new File(directory, name);
  }
  return {
    async save(name, input) {
      directory.create({ intermediates: true, idempotent: true });
      const destination = fileFor(name);
      if (destination.exists) throw new Error('Audio file already exists.');
      try {
        if ('uri' in input) {
          if (!input.uri.startsWith('file://')) throw new Error('Expected a local recording URI.');
          const source = new File(input.uri);
          if (!source.exists || source.size <= 0) throw new Error('Recording is missing or empty.');
          source.copy(destination);
          if (destination.size !== source.size) throw new Error('Incomplete recording copy.');
        } else {
          if (!input.bytes.byteLength) throw new Error('Audio is empty.');
          destination.create();
          destination.write(input.bytes);
          if (destination.size !== input.bytes.byteLength) throw new Error('Incomplete audio write.');
        }
        return destination.size;
      } catch (error) {
        try { if (destination.exists) destination.delete(); } catch { /* Later orphan recovery owns failed cleanup. */ }
        throw error;
      }
    },
    async stat(name) {
      const file = fileFor(name);
      return file.exists ? { uri: file.uri, size: file.size } : null;
    },
    async remove(name) {
      const file = fileFor(name);
      if (file.exists) file.delete();
    },
    async list() {
      if (!directory.exists) return [];
      return directory.list().filter((entry): entry is File => entry instanceof File && isManagedAudioName(entry.name)).map(entry => entry.name);
    },
  };
}
