import { openDatabaseAsync } from 'expo-sqlite';
import { migrateHistoryDatabase } from '../storage/migrations';

// Call explicitly from the future storage repository, never at import/app startup.
// The caller owns this migrated connection and closeAsync().
export async function openNativeHistoryDatabase() {
  const database = await openDatabaseAsync('stringphone-history.db');
  try {
    await database.execAsync('PRAGMA foreign_keys = ON;');
    // Expo's exclusive helper opens a new connection and begins before its callback.
    // SQLite cannot enable foreign keys after BEGIN. Configure each isolated
    // connection first, then acquire the write lock and run only callback queries.
    database.withExclusiveTransactionAsync = async task => {
      const transaction = await openDatabaseAsync('stringphone-history.db', { useNewConnection: true });
      let begun = false;
      try {
        await transaction.execAsync('PRAGMA foreign_keys = ON;');
        await transaction.execAsync('BEGIN IMMEDIATE;');
        begun = true;
        await task(transaction);
        await transaction.execAsync('COMMIT;');
        begun = false;
      } catch (error) {
        if (begun) await transaction.execAsync('ROLLBACK;').catch(() => undefined);
        throw error;
      } finally {
        await transaction.closeAsync();
      }
    };
    await migrateHistoryDatabase(database);
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
