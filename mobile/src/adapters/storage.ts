import { openDatabaseAsync } from 'expo-sqlite';

// Call explicitly from the future storage repository, never at import/app startup.
// The caller owns this connection, migrations and closeAsync().
export async function openNativeHistoryDatabase() {
  const database = await openDatabaseAsync('stringphone-history.db');
  try {
    await database.execAsync('PRAGMA foreign_keys = ON;');
    return database;
  } catch (error) {
    await database.closeAsync().catch(() => undefined);
    throw error;
  }
}

export type { SQLiteDatabase, SQLiteBindValue } from 'expo-sqlite';
