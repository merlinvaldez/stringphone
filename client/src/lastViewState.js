const LAST_VIEW_STATE_STORAGE_KEY = "stringphone_last_view_state_v1";

function readStoredLastViewMap() {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(LAST_VIEW_STATE_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

function isNullableString(value) {
  return value == null || typeof value === "string";
}

function normalizeLastViewState(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (typeof value.appMode !== "string") {
    return null;
  }

  if (typeof value.myLanguageCode !== "string") {
    return null;
  }

  if (typeof value.theirLanguageCode !== "string") {
    return null;
  }

  if (
    value.learningView != null &&
    value.learningView !== "lessons" &&
    value.learningView !== "collections"
  ) {
    return null;
  }

  if (
    !isNullableString(value.currentConversationId) ||
    !isNullableString(value.activeLessonId) ||
    !isNullableString(value.activeCollectionLanguageCode)
  ) {
    return null;
  }

  return {
    appMode: value.appMode,
    learningView: value.learningView ?? "lessons",
    myLanguageCode: value.myLanguageCode,
    theirLanguageCode: value.theirLanguageCode,
    currentConversationId: value.currentConversationId ?? null,
    activeLessonId: value.activeLessonId ?? null,
    activeCollectionLanguageCode: value.activeCollectionLanguageCode ?? null,
  };
}

export function readLastViewState(userKey) {
  if (typeof window === "undefined" || typeof userKey !== "string" || !userKey) {
    return null;
  }

  return normalizeLastViewState(readStoredLastViewMap()[userKey]);
}

export function saveLastViewState(userKey, state) {
  if (typeof window === "undefined" || typeof userKey !== "string" || !userKey) {
    return;
  }

  const storedMap = readStoredLastViewMap();
  storedMap[userKey] = {
    appMode: state.appMode,
    learningView: state.learningView ?? "lessons",
    myLanguageCode: state.myLanguageCode,
    theirLanguageCode: state.theirLanguageCode,
    currentConversationId: state.currentConversationId ?? null,
    activeLessonId: state.activeLessonId ?? null,
    activeCollectionLanguageCode: state.activeCollectionLanguageCode ?? null,
  };

  window.localStorage.setItem(
    LAST_VIEW_STATE_STORAGE_KEY,
    JSON.stringify(storedMap),
  );
}
