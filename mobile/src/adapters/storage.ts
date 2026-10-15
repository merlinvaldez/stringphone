import { openDatabaseAsync } from 'expo-sqlite';
import { migrateHistoryDatabase } from '../storage/migrations';
import { attachExclusiveConnection } from '../storage/exclusiveConnection';

// Call explicitly from the future storage repository, never at import/app startup.
// The caller owns this migrated connection and closeAsync().
export async function openNativeHistoryDatabase() {
  const database = await openDatabaseAsync('stringphone-history.db');
  try {
    await database.execAsync('PRAGMA foreign_keys = ON;');
    // Keep the isolated writer alive: closing it after every startup transaction
    // crashes inside Expo Go Android's native SQLite finalization on this device.
    const transaction = await openDatabaseAsync('stringphone-history.db', { useNewConnection: true });
    attachExclusiveConnection(database, transaction);
    await transaction.execAsync('PRAGMA foreign_keys = ON;');
    await migrateHistoryDatabase(database);
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
