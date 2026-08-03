import { randomUUID } from "crypto";
import { getSupportedTtsLanguage } from "../../lib/languages.js";
import { db } from "../client.js";

let ensureLanguageCollectionsSchemaPromise: Promise<void> | null = null;

type CollectionRow = {
  id: string;
  user_id: number;
  language_code: string;
  language_name: string;
  language_sort_name: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type EntryRow = {
  id: string;
  collection_id: string;
  user_id: number;
  source_type: string;
  phrase_text: string;
  phrase_pronunciation: string | null;
  meaning_text: string;
  meaning_pronunciation: string | null;
  note_text: string | null;
  source_language_code: string;
  target_language_code: string;
  source_conversation_id: string | null;
  source_message_kind: string | null;
  source_message_sender: string | null;
  source_snapshot: unknown;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

type CollectionEntryJoinRow = {
  collection_id: string;
  language_code: string;
  language_name: string;
  language_sort_name: string;
  collection_created_at: string;
  collection_updated_at: string;
  entry_id: string | null;
  source_type: string | null;
  phrase_text: string | null;
  phrase_pronunciation: string | null;
  meaning_text: string | null;
  meaning_pronunciation: string | null;
  note_text: string | null;
  source_language_code: string | null;
  target_language_code: string | null;
  source_conversation_id: string | null;
  source_message_kind: string | null;
  source_message_sender: string | null;
  source_snapshot: unknown;
  entry_created_at: string | null;
  entry_updated_at: string | null;
};

export type LanguageCollectionEntry = {
  id: string;
  collectionId: string;
  sourceType: "message" | "manual";
  phraseText: string;
  phrasePronunciation: string;
  meaningText: string;
  meaningPronunciation: string;
  noteText: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  sourceConversationId: string | null;
  sourceMessageKind: string;
  sourceMessageSender: string;
  sourceSnapshot: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type LanguageCollectionSummary = {
  id: string;
  languageCode: string;
  languageName: string;
  languageSortName: string;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
  previewEntries: Array<
    Pick<
      LanguageCollectionEntry,
      | "id"
      | "phraseText"
      | "phrasePronunciation"
      | "meaningText"
      | "targetLanguageCode"
      | "createdAt"
    >
  >;
};

export type LanguageCollectionDetail = {
  id: string;
  languageCode: string;
  languageName: string;
  languageSortName: string;
  entryCount: number;
  createdAt: string;
  updatedAt: string;
  entries: LanguageCollectionEntry[];
};

function parseSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeEntry(row: EntryRow): LanguageCollectionEntry {
  return {
    id: row.id,
    collectionId: row.collection_id,
    sourceType: row.source_type === "manual" ? "manual" : "message",
    phraseText: row.phrase_text,
    phrasePronunciation: row.phrase_pronunciation ?? "",
    meaningText: row.meaning_text,
    meaningPronunciation: row.meaning_pronunciation ?? "",
    noteText: row.note_text ?? "",
    sourceLanguageCode: row.source_language_code,
    targetLanguageCode: row.target_language_code,
    sourceConversationId: row.source_conversation_id,
    sourceMessageKind: row.source_message_kind ?? "",
    sourceMessageSender: row.source_message_sender ?? "",
    sourceSnapshot: parseSnapshot(row.source_snapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeJoinEntry(row: CollectionEntryJoinRow) {
  if (!row.entry_id || !row.phrase_text || !row.meaning_text) {
    return null;
  }

  return {
    id: row.entry_id,
    collectionId: row.collection_id,
    sourceType: row.source_type === "manual" ? "manual" : "message",
    phraseText: row.phrase_text,
    phrasePronunciation: row.phrase_pronunciation ?? "",
    meaningText: row.meaning_text,
    meaningPronunciation: row.meaning_pronunciation ?? "",
    noteText: row.note_text ?? "",
    sourceLanguageCode: row.source_language_code ?? "",
    targetLanguageCode: row.target_language_code ?? row.language_code,
    sourceConversationId: row.source_conversation_id,
    sourceMessageKind: row.source_message_kind ?? "",
    sourceMessageSender: row.source_message_sender ?? "",
    sourceSnapshot: parseSnapshot(row.source_snapshot),
    createdAt: row.entry_created_at ?? row.collection_created_at,
    updatedAt: row.entry_updated_at ?? row.collection_updated_at,
  } satisfies LanguageCollectionEntry;
}

function normalizeSearchQuery(query: string) {
  return query.trim().toLowerCase();
}

function matchesEntryQuery(entry: LanguageCollectionEntry, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    entry.phraseText,
    entry.phrasePronunciation,
    entry.meaningText,
    entry.meaningPronunciation,
    entry.noteText,
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(query);
}

function buildLanguageMetadata(languageCode: string) {
  const language = getSupportedTtsLanguage(languageCode);

  if (!language) {
    throw new Error(`Unsupported language code: ${languageCode}`);
  }

  return {
    languageCode: language.code,
    languageName: language.name,
    languageSortName: language.name,
  };
}

async function runEnsureLanguageCollectionsSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.language_collections (
      id uuid PRIMARY KEY,
      user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      language_code text NOT NULL,
      language_name text NOT NULL,
      language_sort_name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS public.language_collection_entries (
      id uuid PRIMARY KEY,
      collection_id uuid NOT NULL REFERENCES public.language_collections(id) ON DELETE CASCADE,
      user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      source_type text NOT NULL,
      phrase_text text NOT NULL,
      phrase_pronunciation text,
      meaning_text text NOT NULL,
      meaning_pronunciation text,
      note_text text,
      source_language_code text NOT NULL,
      target_language_code text NOT NULL,
      source_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
      source_message_kind text,
      source_message_sender text,
      source_snapshot jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    )
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS language_collections_active_user_language_idx
    ON public.language_collections (user_id, language_code)
    WHERE archived_at IS NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS language_collections_active_user_sort_idx
    ON public.language_collections (user_id, language_sort_name, updated_at DESC)
    WHERE archived_at IS NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS language_collection_entries_active_collection_idx
    ON public.language_collection_entries (collection_id, created_at DESC)
    WHERE archived_at IS NULL
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS language_collection_entries_active_user_idx
    ON public.language_collection_entries (user_id, target_language_code, created_at DESC)
    WHERE archived_at IS NULL
  `);
}

async function ensureLanguageCollectionsSchema() {
  if (!ensureLanguageCollectionsSchemaPromise) {
    ensureLanguageCollectionsSchemaPromise =
      runEnsureLanguageCollectionsSchema().catch((error) => {
        ensureLanguageCollectionsSchemaPromise = null;
        throw error;
      });
  }

  await ensureLanguageCollectionsSchemaPromise;
}

async function getOrCreateLanguageCollection(params: {
  userId: number;
  languageCode: string;
}) {
  await ensureLanguageCollectionsSchema();

  const language = buildLanguageMetadata(params.languageCode);
  const existingResult = await db.query<CollectionRow>(
    `
    SELECT id, user_id, language_code, language_name, language_sort_name,
           created_at, updated_at, archived_at
    FROM public.language_collections
    WHERE user_id = $1
      AND language_code = $2
      AND archived_at IS NULL
    LIMIT 1
    `,
    [params.userId, language.languageCode],
  );

  if (existingResult.rows[0]) {
    return existingResult.rows[0];
  }

  const createdResult = await db.query<CollectionRow>(
    `
    INSERT INTO public.language_collections (
      id,
      user_id,
      language_code,
      language_name,
      language_sort_name
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, language_code, language_name, language_sort_name,
              created_at, updated_at, archived_at
    `,
    [
      randomUUID(),
      params.userId,
      language.languageCode,
      language.languageName,
      language.languageSortName,
    ],
  );

  return createdResult.rows[0];
}

async function loadCollectionJoinRows(userId: number) {
  await ensureLanguageCollectionsSchema();

  const result = await db.query<CollectionEntryJoinRow>(
    `
    SELECT
      lc.id AS collection_id,
      lc.language_code,
      lc.language_name,
      lc.language_sort_name,
      lc.created_at AS collection_created_at,
      lc.updated_at AS collection_updated_at,
      lce.id AS entry_id,
      lce.source_type,
      lce.phrase_text,
      lce.phrase_pronunciation,
      lce.meaning_text,
      lce.meaning_pronunciation,
      lce.note_text,
      lce.source_language_code,
      lce.target_language_code,
      lce.source_conversation_id,
      lce.source_message_kind,
      lce.source_message_sender,
      lce.source_snapshot,
      lce.created_at AS entry_created_at,
      lce.updated_at AS entry_updated_at
    FROM public.language_collections lc
    LEFT JOIN public.language_collection_entries lce
      ON lce.collection_id = lc.id
     AND lce.archived_at IS NULL
    WHERE lc.user_id = $1
      AND lc.archived_at IS NULL
    ORDER BY lc.language_sort_name ASC, lc.updated_at DESC, lce.created_at DESC
    `,
    [userId],
  );

  return result.rows;
}

export async function listLanguageCollections(params: {
  userId: number;
  query?: string;
}) {
  const joinRows = await loadCollectionJoinRows(params.userId);
  const normalizedQuery = normalizeSearchQuery(params.query ?? "");
  const groupedCollections = new Map<string, LanguageCollectionDetail>();

  for (const row of joinRows) {
    const existingGroup =
      groupedCollections.get(row.collection_id) ??
      {
        id: row.collection_id,
        languageCode: row.language_code,
        languageName: row.language_name,
        languageSortName: row.language_sort_name,
        entryCount: 0,
        createdAt: row.collection_created_at,
        updatedAt: row.collection_updated_at,
        entries: [],
      };

    const entry = normalizeJoinEntry(row);

    if (entry) {
      existingGroup.entryCount += 1;
      existingGroup.entries.push(entry);
    }

    groupedCollections.set(row.collection_id, existingGroup);
  }

  const summaries = Array.from(groupedCollections.values())
    .filter((group) => group.entryCount > 0)
    .filter((group) => {
      if (!normalizedQuery) {
        return true;
      }

      if (group.languageName.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      return group.entries.some((entry) => matchesEntryQuery(entry, normalizedQuery));
    })
    .sort((left, right) =>
      left.languageSortName.localeCompare(right.languageSortName, "en", {
        sensitivity: "base",
      }),
    )
    .map((group) => {
      const previewEntries = group.entries
        .filter((entry) => matchesEntryQuery(entry, normalizedQuery))
        .slice(0, 3)
        .map((entry) => ({
          id: entry.id,
          phraseText: entry.phraseText,
          phrasePronunciation: entry.phrasePronunciation,
          meaningText: entry.meaningText,
          targetLanguageCode: entry.targetLanguageCode,
          createdAt: entry.createdAt,
        }));

      return {
        id: group.id,
        languageCode: group.languageCode,
        languageName: group.languageName,
        languageSortName: group.languageSortName,
        entryCount: group.entryCount,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        previewEntries,
      } satisfies LanguageCollectionSummary;
    });

  return summaries;
}

export async function getLanguageCollectionDetail(params: {
  userId: number;
  languageCode: string;
  query?: string;
}) {
  const joinRows = await loadCollectionJoinRows(params.userId);
  const normalizedQuery = normalizeSearchQuery(params.query ?? "");
  const matchingRows = joinRows.filter(
    (row) => row.language_code === params.languageCode,
  );

  if (matchingRows.length === 0) {
    return null;
  }

  const firstRow = matchingRows[0];
  const entries = matchingRows
    .map((row) => normalizeJoinEntry(row))
    .filter((entry): entry is LanguageCollectionEntry => entry !== null);

  return {
    id: firstRow.collection_id,
    languageCode: firstRow.language_code,
    languageName: firstRow.language_name,
    languageSortName: firstRow.language_sort_name,
    entryCount: entries.length,
    createdAt: firstRow.collection_created_at,
    updatedAt: firstRow.collection_updated_at,
    entries: entries.filter((entry) => matchesEntryQuery(entry, normalizedQuery)),
  } satisfies LanguageCollectionDetail;
}

export async function upsertLanguageCollectionEntry(params: {
  userId: number;
  sourceType: "message" | "manual";
  languageCode: string;
  phraseText: string;
  phrasePronunciation: string;
  meaningText: string;
  meaningPronunciation: string;
  noteText: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  sourceConversationId: string | null;
  sourceMessageKind: string;
  sourceMessageSender: string;
  sourceSnapshot: Record<string, unknown> | null;
}) {
  const collection = await getOrCreateLanguageCollection({
    userId: params.userId,
    languageCode: params.languageCode,
  });

  const duplicateResult = await db.query<EntryRow>(
    `
    SELECT *
    FROM public.language_collection_entries
    WHERE collection_id = $1
      AND user_id = $2
      AND archived_at IS NULL
      AND lower(trim(phrase_text)) = lower(trim($3))
      AND lower(trim(meaning_text)) = lower(trim($4))
    LIMIT 1
    `,
    [
      collection.id,
      params.userId,
      params.phraseText,
      params.meaningText,
    ],
  );

  const existingEntry = duplicateResult.rows[0];

  if (existingEntry) {
    return {
      created: false,
      collection: {
        id: collection.id,
        languageCode: collection.language_code,
        languageName: collection.language_name,
        languageSortName: collection.language_sort_name,
      },
      entry: normalizeEntry(existingEntry),
    };
  }

  const insertedResult = await db.query<EntryRow>(
    `
    INSERT INTO public.language_collection_entries (
      id,
      collection_id,
      user_id,
      source_type,
      phrase_text,
      phrase_pronunciation,
      meaning_text,
      meaning_pronunciation,
      note_text,
      source_language_code,
      target_language_code,
      source_conversation_id,
      source_message_kind,
      source_message_sender,
      source_snapshot
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14, $15::jsonb
    )
    RETURNING *
    `,
    [
      randomUUID(),
      collection.id,
      params.userId,
      params.sourceType,
      params.phraseText,
      params.phrasePronunciation || null,
      params.meaningText,
      params.meaningPronunciation || null,
      params.noteText || null,
      params.sourceLanguageCode,
      params.targetLanguageCode,
      params.sourceConversationId,
      params.sourceMessageKind || null,
      params.sourceMessageSender || null,
      params.sourceSnapshot ? JSON.stringify(params.sourceSnapshot) : null,
    ],
  );

  await db.query(
    `
    UPDATE public.language_collections
    SET updated_at = now()
    WHERE id = $1
    `,
    [collection.id],
  );

  return {
    created: true,
    collection: {
      id: collection.id,
      languageCode: collection.language_code,
      languageName: collection.language_name,
      languageSortName: collection.language_sort_name,
    },
    entry: normalizeEntry(insertedResult.rows[0]),
  };
}

export async function archiveLanguageCollectionEntry(params: {
  entryId: string;
  userId: number;
}) {
  await ensureLanguageCollectionsSchema();

  const result = await db.query<EntryRow>(
    `
    UPDATE public.language_collection_entries
    SET archived_at = now(),
        updated_at = now()
    WHERE id = $1
      AND user_id = $2
      AND archived_at IS NULL
    RETURNING *
    `,
    [params.entryId, params.userId],
  );

  const archivedEntry = result.rows[0] ?? null;

  if (!archivedEntry) {
    return null;
  }

  await db.query(
    `
    UPDATE public.language_collections
    SET updated_at = now()
    WHERE id = $1
    `,
    [archivedEntry.collection_id],
  );

  return normalizeEntry(archivedEntry);
}
