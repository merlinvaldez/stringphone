import { getConversation } from "../db/queries/conversations.js";
import {
  archiveLanguageCollectionEntry,
  getLanguageCollectionDetail,
  listLanguageCollections,
  upsertLanguageCollectionEntry,
} from "../db/queries/languageCollections.js";
import { getSupportedTtsLanguage } from "../lib/languages.js";

export class CollectionRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CollectionRequestError";
    this.status = status;
  }
}

function normalizeSupportedLanguageCode(value: unknown, message: string) {
  const language = getSupportedTtsLanguage(value);

  if (!language) {
    throw new CollectionRequestError(message, 400);
  }

  return language.code;
}

function coerceRequiredText(value: unknown, message: string, maxLength = 500) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CollectionRequestError(message, 400);
  }

  return value.trim().slice(0, maxLength);
}

function coerceOptionalText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

function coerceOptionalUuid(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function coerceSnapshot(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function parseCollectionSearchQuery(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, 120);
}

export function parseCollectionLanguageCode(value: unknown) {
  return normalizeSupportedLanguageCode(
    value,
    "A supported collection language is required",
  );
}

export async function saveLanguageCollectionEntryForUser(params: {
  userId: number;
  body: unknown;
}) {
  const candidate =
    params.body && typeof params.body === "object"
      ? (params.body as Record<string, unknown>)
      : {};
  const sourceType =
    candidate.sourceType === "manual" || candidate.sourceType === "message"
      ? candidate.sourceType
      : null;

  if (!sourceType) {
    throw new CollectionRequestError(
      "A collection source type is required",
      400,
    );
  }

  const languageCode = normalizeSupportedLanguageCode(
    candidate.languageCode,
    "A supported collection language is required",
  );
  const phraseText = coerceRequiredText(
    candidate.phraseText,
    "A phrase is required",
  );
  const meaningText = coerceRequiredText(
    candidate.meaningText,
    "A meaning is required",
  );
  const sourceLanguageCode = normalizeSupportedLanguageCode(
    candidate.sourceLanguageCode,
    "A supported source language is required",
  );
  const sourceConversationId = coerceOptionalUuid(candidate.sourceConversationId);

  if (sourceConversationId) {
    const conversation = await getConversation(sourceConversationId, params.userId);

    if (!conversation) {
      throw new CollectionRequestError(
        "Conversation not found or unauthorized",
        404,
      );
    }
  }

  return upsertLanguageCollectionEntry({
    userId: params.userId,
    sourceType,
    languageCode,
    phraseText,
    phrasePronunciation: coerceOptionalText(candidate.phrasePronunciation, 300),
    meaningText,
    meaningPronunciation: coerceOptionalText(candidate.meaningPronunciation, 300),
    noteText: coerceOptionalText(candidate.noteText, 500),
    sourceLanguageCode,
    targetLanguageCode: languageCode,
    sourceConversationId,
    sourceMessageKind: coerceOptionalText(candidate.sourceMessageKind, 32),
    sourceMessageSender: coerceOptionalText(candidate.sourceMessageSender, 32),
    sourceSnapshot: coerceSnapshot(candidate.sourceSnapshot),
  });
}

export async function listLanguageCollectionsForUser(params: {
  userId: number;
  query?: unknown;
}) {
  return listLanguageCollections({
    userId: params.userId,
    query: parseCollectionSearchQuery(params.query),
  });
}

export async function getLanguageCollectionForUser(params: {
  userId: number;
  languageCode: unknown;
  query?: unknown;
}) {
  return getLanguageCollectionDetail({
    userId: params.userId,
    languageCode: parseCollectionLanguageCode(params.languageCode),
    query: parseCollectionSearchQuery(params.query),
  });
}

export async function archiveLanguageCollectionEntryForUser(params: {
  userId: number;
  entryId: unknown;
}) {
  const entryId = coerceOptionalUuid(params.entryId);

  if (!entryId) {
    throw new CollectionRequestError("A collection entry id is required", 400);
  }

  return archiveLanguageCollectionEntry({
    entryId,
    userId: params.userId,
  });
}
