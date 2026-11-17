import { createLiveTranscriptionClientSecret } from "../../chatApi.js";

export const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
export const SECRET_CACHE_TTL_MS = 50_000;
export const SECRET_EARLY_REFRESH_WINDOW_MS = 12_000;
export const SECRET_REFRESH_INTERVAL_MS = 40_000;
export const SOCKET_PREWARM_MIN_INTERVAL_MS = 25_000;

export function normalizeLanguageCode(lang) {
  if (!lang) return "";
  if (typeof lang === "string") return lang.trim().toLowerCase();
  if (typeof lang?.code === "string") return lang.code.trim().toLowerCase();
  return "";
}

export function secretCacheKey(sourceLanguage, targetLanguage) {
  const src = normalizeLanguageCode(sourceLanguage);
  const tgt = normalizeLanguageCode(targetLanguage);
  return `${src}::${tgt}`;
}

function toLanguageParam(lang) {
  if (lang && typeof lang === "object" && typeof lang.code === "string") {
    return lang;
  }
  const code = normalizeLanguageCode(lang);
  return { code };
}

function parseLangArgs(arg1, arg2, arg3) {
  if (
    arg1 &&
    typeof arg1 === "object" &&
    ("sourceLanguage" in arg1 || "myLang" in arg1 || "langA" in arg1)
  ) {
    return {
      sourceLanguage: arg1.sourceLanguage ?? arg1.myLang ?? arg1.langA,
      targetLanguage: arg1.targetLanguage ?? arg1.theirLang ?? arg1.langB,
      authFetch: arg1.authFetch,
    };
  }
  return {
    sourceLanguage: arg1,
    targetLanguage: arg2,
    authFetch: arg3,
  };
}

export function createSecretCacheHarness(options = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? SECRET_CACHE_TTL_MS;
  const earlyRefreshWindowMs =
    options.earlyRefreshWindowMs ?? SECRET_EARLY_REFRESH_WINDOW_MS;
  const socketPrewarmMinIntervalMs =
    options.socketPrewarmMinIntervalMs ?? SOCKET_PREWARM_MIN_INTERVAL_MS;
  let nowFn =
    typeof options.nowFn === "function" ? options.nowFn : () => Date.now();
  const fetchFn =
    typeof options.fetchFn === "function"
      ? options.fetchFn
      : typeof fetch === "function"
        ? fetch
        : null;
  const fetchSecret =
    typeof options.fetchSecret === "function"
      ? options.fetchSecret
      : ({ sourceLanguage, targetLanguage, authFetch }) =>
          createLiveTranscriptionClientSecret({
            sourceLanguage: toLanguageParam(sourceLanguage),
            targetLanguage: toLanguageParam(targetLanguage),
            forceFallback: true,
            authFetch,
          });

  const prefetchedSecrets = new Map();
  let lastSocketPrewarmAt = 0;

  function prewarmRealtimeSocket() {
    const now = nowFn();
    if (now - lastSocketPrewarmAt < socketPrewarmMinIntervalMs) {
      return false;
    }
    lastSocketPrewarmAt = now;

    if (typeof options.fetchFn === "function") {
      try {
        const p = options.fetchFn(REALTIME_CALLS_URL, { method: "HEAD" });
        if (p && typeof p.catch === "function") {
          p.catch(() => undefined);
        }
      } catch {
        // Non-blocking socket prewarm
      }
    } else if (typeof document !== "undefined") {
      try {
        let link = document.querySelector(
          'link[rel="preconnect"][href="https://api.openai.com"]'
        );
        if (!link) {
          link = document.createElement("link");
          link.rel = "preconnect";
          link.href = "https://api.openai.com";
          link.crossOrigin = "anonymous";
          if (link.setAttribute) {
            link.setAttribute("crossorigin", "anonymous");
          }
          if (document.head) {
            document.head.appendChild(link);
          } else if (document.body) {
            document.body.appendChild(link);
          }
        }
      } catch {
        // Non-blocking socket prewarm via link preconnect
      }
    } else if (fetchFn) {
      try {
        const p = fetchFn(REALTIME_CALLS_URL, { method: "HEAD" });
        if (p && typeof p.catch === "function") {
          p.catch(() => undefined);
        }
      } catch {
        // Non-blocking socket prewarm
      }
    }
    return true;
  }

  function fetchAndCacheSecret(key, sourceLanguage, targetLanguage, authFetch) {
    const promise = (async () => {
      const secret = await fetchSecret({
        sourceLanguage: toLanguageParam(sourceLanguage),
        targetLanguage: toLanguageParam(targetLanguage),
        authFetch,
      });
      return {
        ...secret,
        expiresAt: nowFn() + cacheTtlMs,
      };
    })();

    prefetchedSecrets.set(key, promise);

    promise.catch(() => {
      if (prefetchedSecrets.get(key) === promise) {
        prefetchedSecrets.delete(key);
      }
    });

    return promise;
  }

  function prefetchTranscriptionSecret(arg1, arg2, arg3) {
    const { sourceLanguage, targetLanguage, authFetch } = parseLangArgs(
      arg1,
      arg2,
      arg3,
    );
    const srcCode = normalizeLanguageCode(sourceLanguage);
    const tgtCode = normalizeLanguageCode(targetLanguage);
    if (!srcCode || !tgtCode) return null;

    prewarmRealtimeSocket();
    const key = secretCacheKey(srcCode, tgtCode);
    const existing = prefetchedSecrets.get(key);

    if (existing) {
      existing
        .then((cached) => {
          if (
            nowFn() + earlyRefreshWindowMs >= cached.expiresAt &&
            prefetchedSecrets.get(key) === existing
          ) {
            prefetchedSecrets.delete(key);
            void fetchAndCacheSecret(
              key,
              sourceLanguage,
              targetLanguage,
              authFetch,
            ).catch(() => undefined);
          }
        })
        .catch(() => undefined);
      return existing;
    }

    const p = fetchAndCacheSecret(
      key,
      sourceLanguage,
      targetLanguage,
      authFetch,
    );
    p.catch(() => undefined);
    return p;
  }

  function prefetchBothTranscriptionSecrets(arg1, arg2, arg3) {
    let langA;
    let langB;
    let authFetch;
    if (
      arg1 &&
      typeof arg1 === "object" &&
      ("myLang" in arg1 || "langA" in arg1 || "sourceLanguage" in arg1)
    ) {
      langA = arg1.myLang ?? arg1.langA ?? arg1.sourceLanguage;
      langB = arg1.theirLang ?? arg1.langB ?? arg1.targetLanguage;
      authFetch = arg1.authFetch;
    } else {
      langA = arg1;
      langB = arg2;
      authFetch = arg3;
    }

    const codeA = normalizeLanguageCode(langA);
    const codeB = normalizeLanguageCode(langB);
    if (!codeA || !codeB) return;

    prewarmRealtimeSocket();
    prefetchTranscriptionSecret(langA, langB, authFetch);
    if (codeA !== codeB) {
      prefetchTranscriptionSecret(langB, langA, authFetch);
    }
  }

  async function consumeOrCreateTranscriptionSecret(arg1, arg2, arg3) {
    const { sourceLanguage, targetLanguage, authFetch } = parseLangArgs(
      arg1,
      arg2,
      arg3,
    );
    const key = secretCacheKey(sourceLanguage, targetLanguage);
    const existing = prefetchedSecrets.get(key);

    if (existing) {
      prefetchedSecrets.delete(key);
      try {
        const cached = await existing;
        const now = nowFn();
        if (now < cached.expiresAt && cached.value) {
          // Warm up next secret in background for subsequent turns
          void fetchAndCacheSecret(
            key,
            sourceLanguage,
            targetLanguage,
            authFetch,
          ).catch(() => undefined);
          return cached;
        }
      } catch {
        // Fall through to fresh fetch if cached promise rejected
      }
    }

    const fresh = await fetchSecret({
      sourceLanguage: toLanguageParam(sourceLanguage),
      targetLanguage: toLanguageParam(targetLanguage),
      authFetch,
    });
    void fetchAndCacheSecret(
      key,
      sourceLanguage,
      targetLanguage,
      authFetch,
    ).catch(() => undefined);
    return fresh;
  }

  function clearPrefetchedTranscriptionSecrets() {
    prefetchedSecrets.clear();
  }

  return {
    prefetchedSecrets,
    prewarmRealtimeSocket,
    prefetchTranscriptionSecret,
    prefetchBothTranscriptionSecrets,
    consumeOrCreateTranscriptionSecret,
    clearPrefetchedTranscriptionSecrets,
    getCacheSize: () => prefetchedSecrets.size,
    hasCacheKey: (src, tgt) => prefetchedSecrets.has(secretCacheKey(src, tgt)),
    getLastSocketPrewarmAt: () => lastSocketPrewarmAt,
    setNow: (fn) => {
      nowFn = typeof fn === "function" ? fn : () => fn;
    },
  };
}

const defaultHarness = createSecretCacheHarness();

export function prewarmRealtimeSocket() {
  return defaultHarness.prewarmRealtimeSocket();
}

export function prefetchTranscriptionSecret(arg1, arg2, arg3) {
  return defaultHarness.prefetchTranscriptionSecret(arg1, arg2, arg3);
}

export function prefetchBothTranscriptionSecrets(arg1, arg2, arg3) {
  return defaultHarness.prefetchBothTranscriptionSecrets(arg1, arg2, arg3);
}

export function consumeOrCreateTranscriptionSecret(arg1, arg2, arg3) {
  return defaultHarness.consumeOrCreateTranscriptionSecret(arg1, arg2, arg3);
}

export function clearPrefetchedTranscriptionSecrets() {
  return defaultHarness.clearPrefetchedTranscriptionSecrets();
}
