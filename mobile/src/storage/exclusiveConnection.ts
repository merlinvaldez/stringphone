import type { SQLiteDatabase } from '../adapters/storage';

// Retain a separate writer for the session instead of opening/closing one per
// transaction. Reads on the main connection cannot join this transaction.
export function attachExclusiveConnection(database: SQLiteDatabase, transaction: SQLiteDatabase) {
  let queue: Promise<void> = Promise.resolve();
  let closing = false;
  const closeMain = database.closeAsync.bind(database);
  database.withExclusiveTransactionAsync = task => {
    if (closing) return Promise.reject(new Error('History database is closing.'));
    const operation = queue.then(async () => {
      await transaction.execAsync('BEGIN IMMEDIATE;');
      try {
        await task(transaction);
        await transaction.execAsync('COMMIT;');
      } catch (error) {
        await transaction.execAsync('ROLLBACK;').catch(() => undefined);
        throw error;
      }
    });
    queue = operation.catch(() => undefined);
    return operation;
  };
  let closed: Promise<void> | undefined;
  database.closeAsync = () => {
    closing = true;
    closed ??= queue.then(async () => {
      try { await transaction.closeAsync(); }
      finally { await closeMain(); }
    });
    return closed;
  };
}
