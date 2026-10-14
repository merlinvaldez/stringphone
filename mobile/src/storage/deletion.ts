import type { SQLiteDatabase } from '../adapters/storage';
import type { createAudioStorage } from './audio';

export type DeletionTarget = { kind: 'conversation' | 'phrase'; id: string };
export type DeletionPrompt = DeletionTarget & { label: string; title: string; message: string };
export type ConfirmDeletion = (prompt: DeletionPrompt) => Promise<boolean>;
type CleanupReport = Awaited<ReturnType<ReturnType<typeof createAudioStorage>['reconcile']>>;
export type DeletionReport = {
  status: 'cancelled' | 'missing' | 'changed' | 'deleted';
  cleanup: CleanupReport | null;
  compacted: boolean;
  maintenanceErrors: string[];
};

function tableFor(target: DeletionTarget) {
  if (!target.id.trim()) throw new Error('Deletion target is empty.');
  if (target.kind === 'conversation') return 'conversations';
  if (target.kind === 'phrase') return 'phrasebook_entries';
  throw new Error('Invalid deletion target.');
}

export function createDeletionService(database: SQLiteDatabase, audio: Pick<ReturnType<typeof createAudioStorage>, 'reconcile'>, confirm: ConfirmDeletion) {
  let busy = false;
  async function maintenance() {
    const report = { cleanup: null as CleanupReport | null, compacted: false, maintenanceErrors: [] as string[] };
    try { report.cleanup = await audio.reconcile(); }
    catch (error) { report.maintenanceErrors.push(error instanceof Error ? error.message : String(error)); }
    try {
      // VACUUM must run outside a transaction. Failure never reverses a committed deletion.
      await database.execAsync('VACUUM;');
      report.compacted = true;
    } catch (error) { report.maintenanceErrors.push(error instanceof Error ? error.message : String(error)); }
    return report;
  }
  return {
    async delete(target: DeletionTarget): Promise<DeletionReport> {
      const table = tableFor(target);
      if (busy) throw new Error('Deletion or storage maintenance is already active.');
      busy = true;
      const empty = (status: DeletionReport['status']): DeletionReport => ({ status,cleanup: null,compacted: false,maintenanceErrors: [] });
      try {
        const row = await database.getFirstAsync<{ label: string; updated_at: number }>(`SELECT ${target.kind === 'conversation' ? 'title' : 'original_text'} AS label,updated_at FROM ${table} WHERE id=?`,target.id);
        if (!row) return empty('missing');
        const approved = await confirm({ ...target,label: row.label,
          title: target.kind === 'conversation' ? 'Delete conversation?' : 'Delete phrase?',
          message: target.kind === 'conversation'
            ? 'Permanently delete this conversation and its messages? Saved Phrasebook entries will remain. Audio used only by this conversation will be removed. This cannot be undone.'
            : 'Permanently delete this saved phrase? Its original conversation will remain. Audio used only by this phrase will be removed. This cannot be undone.',
        });
        if (!approved) return empty('cancelled');
        let removed = false;
        await database.withExclusiveTransactionAsync(async transaction => {
          // If the record changed while the prompt was open, require a fresh review.
          const result = await transaction.runAsync(`DELETE FROM ${table} WHERE id=? AND updated_at=?`,target.id,row.updated_at);
          removed = result.changes === 1;
        });
        if (!removed) return empty('changed');
        return { status:'deleted',...await maintenance() };
      } finally { busy = false; }
    },
    async retryMaintenance() {
      if (busy) throw new Error('Deletion or storage maintenance is already active.');
      busy = true;
      try { return await maintenance(); } finally { busy = false; }
    },
  };
}
