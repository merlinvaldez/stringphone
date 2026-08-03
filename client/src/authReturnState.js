const AUTH_RETURN_STATE_STORAGE_KEY = "stringphone_auth_return_state_v1";

export function readAuthReturnState() {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.sessionStorage.getItem(
      AUTH_RETURN_STATE_STORAGE_KEY,
    );

    if (!rawValue) return null;

    const parsed = JSON.parse(rawValue);

    if (typeof parsed?.appMode !== "string") return null;
    if (typeof parsed?.myLanguageCode !== "string") return null;
    if (typeof parsed?.theirLanguageCode !== "string") return null;
    if (
      parsed?.joinQueryToken != null &&
      typeof parsed.joinQueryToken !== "string"
    ) {
      return null;
    }

    if (
      parsed?.learningView != null &&
      parsed.learningView !== "lessons" &&
      parsed.learningView !== "collections"
    ) {
      return null;
    }

    if (
      parsed?.activeCollectionLanguageCode != null &&
      typeof parsed.activeCollectionLanguageCode !== "string"
    ) {
      return null;
    }

    return {
      appMode: parsed.appMode,
      myLanguageCode: parsed.myLanguageCode,
      theirLanguageCode: parsed.theirLanguageCode,
      joinQueryToken: parsed.joinQueryToken ?? "",
      learningView: parsed.learningView ?? "lessons",
      activeCollectionLanguageCode: parsed.activeCollectionLanguageCode ?? null,
    };
  } catch {
    return null;
  }
}

export function saveAuthReturnState({
  appMode,
  myLanguageCode,
  theirLanguageCode,
  joinQueryToken = "",
  learningView = "lessons",
  activeCollectionLanguageCode = null,
}) {
  if (typeof window === "undefined") return;

  window.sessionStorage.setItem(
    AUTH_RETURN_STATE_STORAGE_KEY,
    JSON.stringify({
      appMode,
      myLanguageCode,
      theirLanguageCode,
      joinQueryToken,
      learningView,
      activeCollectionLanguageCode,
    }),
  );
}

export function clearAuthReturnState() {
  if (typeof window === "undefined") return;

  window.sessionStorage.removeItem(AUTH_RETURN_STATE_STORAGE_KEY);
}
