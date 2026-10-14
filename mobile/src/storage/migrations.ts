// Append migrations; never edit a version that has shipped.
export const historyMigrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0),
        title TEXT NOT NULL DEFAULT '',
        origin_mode TEXT NOT NULL CHECK(origin_mode IN ('chat','single','conversation','room')),
        my_language TEXT NOT NULL CHECK(length(my_language) > 0),
        their_language TEXT NOT NULL CHECK(length(their_language) > 0),
        created_at INTEGER NOT NULL CHECK(created_at >= 0),
        updated_at INTEGER NOT NULL CHECK(updated_at >= created_at)
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0),
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        speaker TEXT NOT NULL CHECK(speaker IN ('me','them')),
        origin_mode TEXT NOT NULL CHECK(origin_mode IN ('chat','single','conversation','room')),
        source_language TEXT NOT NULL CHECK(length(source_language) > 0),
        target_language TEXT NOT NULL CHECK(length(target_language) > 0),
        original_text TEXT NOT NULL DEFAULT '',
        translated_text TEXT,
        original_pronunciation TEXT,
        translated_pronunciation TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','ready','failed','interrupted')),
        error_code TEXT,
        error_message TEXT,
        request_id TEXT UNIQUE CHECK(request_id IS NULL OR length(request_id) > 0),
        created_at INTEGER NOT NULL CHECK(created_at >= 0),
        updated_at INTEGER NOT NULL CHECK(updated_at >= created_at)
      );
      CREATE TABLE phrasebook_entries (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0),
        source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        source_language TEXT NOT NULL CHECK(length(source_language) > 0),
        target_language TEXT NOT NULL CHECK(length(target_language) > 0),
        original_text TEXT NOT NULL CHECK(length(original_text) > 0),
        translated_text TEXT NOT NULL DEFAULT '',
        original_pronunciation TEXT,
        translated_pronunciation TEXT,
        created_at INTEGER NOT NULL CHECK(created_at >= 0),
        updated_at INTEGER NOT NULL CHECK(updated_at >= created_at)
      );
      CREATE TABLE preferences (
        key TEXT PRIMARY KEY NOT NULL CHECK(length(key) > 0),
        value_json TEXT NOT NULL CHECK(json_valid(value_json)),
        updated_at INTEGER NOT NULL CHECK(updated_at >= 0)
      );
      CREATE INDEX conversations_updated ON conversations(updated_at DESC, id);
      CREATE INDEX messages_conversation_created ON messages(conversation_id, created_at, id);
      CREATE INDEX messages_status ON messages(status);
      CREATE INDEX phrases_languages ON phrasebook_entries(source_language, target_language, updated_at DESC);
      CREATE INDEX phrases_source_message ON phrasebook_entries(source_message_id);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE audio_assets (
        id TEXT PRIMARY KEY NOT NULL CHECK(length(id) > 0),
        file_name TEXT NOT NULL UNIQUE CHECK(length(file_name) > 0 AND instr(file_name, '/') = 0 AND instr(file_name, char(92)) = 0 AND file_name NOT IN ('.','..')),
        format TEXT NOT NULL CHECK(format IN ('wav','m4a','mp3','aac','ogg','webm','caf')),
        mime_type TEXT NOT NULL CHECK(length(mime_type) > 0),
        duration_ms INTEGER CHECK(duration_ms IS NULL OR duration_ms >= 0),
        byte_size INTEGER NOT NULL CHECK(byte_size > 0),
        availability TEXT NOT NULL CHECK(availability IN ('available','missing')),
        created_at INTEGER NOT NULL CHECK(created_at >= 0)
      );
      CREATE TABLE message_audio (
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('source','translated')),
        audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE RESTRICT,
        PRIMARY KEY(message_id, role)
      );
      CREATE TABLE phrasebook_audio (
        phrasebook_id TEXT NOT NULL REFERENCES phrasebook_entries(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('source','translated')),
        audio_id TEXT NOT NULL REFERENCES audio_assets(id) ON DELETE RESTRICT,
        PRIMARY KEY(phrasebook_id, role)
      );
      CREATE INDEX message_audio_asset ON message_audio(audio_id);
      CREATE INDEX phrasebook_audio_asset ON phrasebook_audio(audio_id);
    `,
  },
  {
    version: 3,
    // Table/column names below are fixed migration source, never user data.
    sql: `CREATE VIRTUAL TABLE history_search USING fts5(kind UNINDEXED, record_id UNINDEXED, text, tokenize='unicode61');
      ${[
        ['conversations', 'conversation', "coalesce(title,'')"],
        ['messages', 'message', "original_text || ' ' || coalesce(translated_text,'') || ' ' || coalesce(original_pronunciation,'') || ' ' || coalesce(translated_pronunciation,'')"],
        ['phrasebook_entries', 'phrase', "original_text || ' ' || translated_text || ' ' || coalesce(original_pronunciation,'') || ' ' || coalesce(translated_pronunciation,'')"],
      ].map(([table, kind, expression]) => {
        const newExpression = expression.replace(/\b(title|original_text|translated_text|original_pronunciation|translated_pronunciation)\b/g, 'new.$1');
        return `
          INSERT INTO history_search(kind, record_id, text) SELECT '${kind}', id, ${expression} FROM ${table};
          CREATE TRIGGER ${table}_search_insert AFTER INSERT ON ${table} BEGIN
            INSERT INTO history_search(kind,record_id,text) VALUES ('${kind}',new.id,${newExpression});
          END;
          CREATE TRIGGER ${table}_search_update AFTER UPDATE ON ${table} BEGIN
            DELETE FROM history_search WHERE kind='${kind}' AND record_id=old.id;
            INSERT INTO history_search(kind,record_id,text) VALUES ('${kind}',new.id,${newExpression});
          END;
          CREATE TRIGGER ${table}_search_delete AFTER DELETE ON ${table} BEGIN
            DELETE FROM history_search WHERE kind='${kind}' AND record_id=old.id;
          END;
        `;
      }).join('\n')}
      CREATE INDEX messages_pending_created ON messages(created_at,id) WHERE status='pending';
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE messages ADD COLUMN input_kind TEXT NOT NULL DEFAULT 'text' CHECK(input_kind IN ('text','voice'));
      ALTER TABLE messages ADD COLUMN processing_attempt INTEGER NOT NULL DEFAULT 0 CHECK(processing_attempt >= 0);
    `,
  },
] as const;

export const HISTORY_SCHEMA_VERSION = historyMigrations[historyMigrations.length - 1].version;

// Structural interface allows migration checks against real SQLite without loading native modules.
export interface MigrationConnection {
  execAsync(sql: string): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
}

export interface MigrationDatabase extends MigrationConnection {
  withExclusiveTransactionAsync(task: (transaction: MigrationConnection) => Promise<void>): Promise<void>;
}

export async function migrateHistoryDatabase(database: MigrationDatabase): Promise<void> {
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
    if (!row || !Number.isInteger(row.user_version) || row.user_version < 0) {
      throw new Error('Cannot read history schema version.');
    }
    if (row.user_version > HISTORY_SCHEMA_VERSION) {
      throw new Error('History was created by a newer app. Update StringPhone to open it.');
    }
    for (const migration of historyMigrations) {
      if (migration.version <= row.user_version) continue;
      await transaction.execAsync(migration.sql);
      // Version is a source-controlled integer, never user input.
      await transaction.execAsync(`PRAGMA user_version = ${migration.version};`);
    }
  });
}
