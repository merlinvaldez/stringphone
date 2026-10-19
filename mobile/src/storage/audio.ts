import type { SQLiteDatabase } from '../adapters/storage';

export type AudioFormat = 'wav' | 'm4a' | 'mp3' | 'aac' | 'ogg' | 'webm' | 'caf';
export type AudioOwner = { kind: 'message' | 'phrasebook'; id: string; role: 'source' | 'translated' };
export interface AudioFiles {
  save(name: string, input: { uri: string } | { bytes: Uint8Array }): Promise<number>;
  stat(name: string): Promise<{ uri: string; size: number } | null>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
}
export function isManagedAudioName(name: string) {
  return /^[a-zA-Z0-9_-]{1,128}\.(wav|m4a|mp3|aac|ogg|webm|caf)$/.test(name);
}
export class AudioStorageError extends Error {
  readonly code: 'storage_full' | 'audio_save_failed';
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Audio was not confirmed saved: ${detail}`, { cause });
    this.name = 'AudioStorageError';
    this.code = /ENOSPC|SQLITE_FULL|disk.*full|no space|not enough.*space/i.test(detail) ? 'storage_full' : 'audio_save_failed';
  }
}
type AudioRow = { id: string; file_name: string; format: AudioFormat; mime_type: string; duration_ms: number | null; byte_size: number; availability: 'available' | 'missing'; created_at: number };

function ownerTable(owner: AudioOwner) {
  if (!owner.id || !['source', 'translated'].includes(owner.role)) throw new Error('Invalid audio owner.');
  if (owner.kind === 'message') return { table: 'message_audio', column: 'message_id' };
  if (owner.kind === 'phrasebook') return { table: 'phrasebook_audio', column: 'phrasebook_id' };
  throw new Error('Invalid audio owner.');
}

export function createAudioStorage(database: SQLiteDatabase, files: AudioFiles, newId: () => string) {
  return {
    async save(owner: AudioOwner, input: { uri: string } | { bytes: Uint8Array }, metadata: { format: AudioFormat; mimeType: string; durationMs?: number }, replace = false) {
      const { table, column } = ownerTable(owner);
      if (!['wav','m4a','mp3','aac','ogg','webm','caf'].includes(metadata.format) || !metadata.mimeType.trim() ||
          (metadata.durationMs !== undefined && (!Number.isSafeInteger(metadata.durationMs) || metadata.durationMs < 0))) {
        throw new Error('Invalid audio metadata.');
      }
      const id = newId();
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Invalid audio ID.');
      const name = `${id}.${metadata.format}`;
      let written = false;
      try {
        // Hold the SQLite write lock during file creation so maintenance on another
        // connection cannot mistake an in-flight file for an orphan.
        await database.withExclusiveTransactionAsync(async transaction => {
          if (await transaction.getFirstAsync('SELECT id FROM audio_assets WHERE id=? OR file_name=?',id,name)) throw new Error('Audio ID already exists.');
          const size = await files.save(name, input);
          written = true;
          if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Audio file is empty.');
          await transaction.runAsync('INSERT INTO audio_assets VALUES (?,?,?,?,?,?,?,?)', id, name, metadata.format, metadata.mimeType, metadata.durationMs ?? null, size, 'available', Date.now());
          // Explicit replacement is atomic; retained Phrasebook links keep old assets.
          if (replace) await transaction.runAsync(`DELETE FROM ${table} WHERE ${column}=? AND role=?`, owner.id, owner.role);
          await transaction.runAsync(`INSERT INTO ${table} (${column},role,audio_id) VALUES (?,?,?)`, owner.id, owner.role, id);
        });
      } catch (error) {
        if (written) {
          // A commit may have succeeded even if closing the connection failed.
          // Never remove a committed asset; failed checks leave it for maintenance.
          try {
            const retained = await database.getFirstAsync('SELECT id FROM audio_assets WHERE file_name=?',name);
            if (!retained) await files.remove(name);
          } catch { /* Explicit maintenance reports cleanup failures. */ }
        }
        throw new AudioStorageError(error);
      }
      return id;
    },
    async resolve(owner: AudioOwner) {
      const { table, column } = ownerTable(owner);
      const row = await database.getFirstAsync<AudioRow>(`SELECT a.* FROM audio_assets a JOIN ${table} r ON r.audio_id=a.id WHERE r.${column}=? AND r.role=?`, owner.id, owner.role);
      if (!row) return null;
      const file = await files.stat(row.file_name);
      const availability = file && file.size === row.byte_size ? 'available' : 'missing';
      await database.runAsync('UPDATE audio_assets SET availability=? WHERE id=?', availability, row.id);
      return { ...row, availability, uri: availability === 'available' ? file!.uri : null };
    },
    async reconcile() {
      const report = { removedFiles: 0, removedAssets: 0, missingAssets: 0, failures: [] as { fileName: string; error: string }[] };
      await database.withExclusiveTransactionAsync(async transaction => {
        const assets = await transaction.getAllAsync<AudioRow & { retained: number }>(`SELECT a.*, (EXISTS(SELECT 1 FROM message_audio WHERE audio_id=a.id) OR EXISTS(SELECT 1 FROM phrasebook_audio WHERE audio_id=a.id)) AS retained FROM audio_assets a`);
        // If listing fails, do not interpret that as an empty directory.
        const names = await files.list();
        const known = new Set(assets.map(asset => asset.file_name));
        const failure = (fileName: string, error: unknown) => report.failures.push({ fileName,error: error instanceof Error ? error.message : String(error) });
        for (const asset of assets) {
          if (!isManagedAudioName(asset.file_name)) {
            failure(asset.file_name,new Error('Unsafe audio filename; no file operation performed.'));
            await transaction.runAsync("UPDATE audio_assets SET availability='missing' WHERE id=?",asset.id);
            continue;
          }
          if (asset.retained) {
            try {
              const file = await files.stat(asset.file_name);
              const available = file && file.size === asset.byte_size;
              await transaction.runAsync('UPDATE audio_assets SET availability=? WHERE id=?',available ? 'available' : 'missing',asset.id);
              if (!available) report.missingAssets++;
            } catch (error) { failure(asset.file_name,error); }
          } else {
            try {
              const file = await files.stat(asset.file_name);
              await files.remove(asset.file_name);
              if (file) report.removedFiles++;
              const result = await transaction.runAsync('DELETE FROM audio_assets WHERE id=?',asset.id);
              report.removedAssets += result.changes;
            } catch (error) { failure(asset.file_name,error); }
          }
        }
        for (const name of names) {
          if (known.has(name) || !isManagedAudioName(name)) continue;
          try { await files.remove(name); report.removedFiles++; }
          catch (error) { failure(name,error); }
        }
      });
      return report;
    },
  };
}
