import { useCallback, useEffect, useRef, useState } from "react";

export const LIVE_AUTOPLAY_STORAGE_KEY = "stringphone-live-autoplay-v1";

function readInitialAutoPlay() {
  if (typeof window === "undefined" || !window.localStorage) {
    return true;
  }

  try {
    const raw = window.localStorage.getItem(LIVE_AUTOPLAY_STORAGE_KEY);
    if (raw === "false" || raw === "0") {
      return false;
    }
    if (raw === "true" || raw === "1") {
      return true;
    }
  } catch {
    // Ignore storage read failures
  }
  return true;
}

/**
 * Pure sequential FIFO playback queue with parallel audio prefetching and
 * clean preemption for both Web and Node unit verification.
 */
export function createLivePlaybackQueue({
  prefetchItem,
  playItem,
  onStopPlayback,
  initialAutoPlay = false,
  onStateChange,
} = {}) {
  let autoPlayEnabled = Boolean(initialAutoPlay);
  const queue = [];
  const prefetchedPromises = new Map();
  let draining = false;
  let activePlayingMessageId = null;
  let isPlaying = false;
  let generation = 0;

  const notify = () => {
    onStateChange?.({
      autoPlayEnabled,
      activePlayingMessageId,
      isPlaying,
      queueLength: queue.length,
    });
  };

  const getOrPrefetch = (item) => {
    if (!item?.messageId || typeof prefetchItem !== "function") {
      return Promise.resolve(null);
    }

    if (!prefetchedPromises.has(item.messageId)) {
      let promise;
      try {
        promise = Promise.resolve(prefetchItem(item)).catch(() => null);
      } catch {
        promise = Promise.resolve(null);
      }
      prefetchedPromises.set(item.messageId, promise);
    }

    return prefetchedPromises.get(item.messageId);
  };

  const pauseAll = () => {
    generation += 1;
    queue.length = 0;
    activePlayingMessageId = null;
    isPlaying = false;
    onStopPlayback?.();
    notify();
  };

  const drain = async () => {
    if (draining) {
      return;
    }

    draining = true;
    const runGeneration = generation;

    try {
      while (autoPlayEnabled && queue.length > 0) {
        if (generation !== runGeneration) {
          break;
        }

        const next = queue.shift();
        if (!next) {
          continue;
        }

        activePlayingMessageId = next.messageId;
        isPlaying = true;
        notify();

        const prefetchedAudio = await getOrPrefetch(next);
        if (generation !== runGeneration || !autoPlayEnabled) {
          break;
        }

        try {
          if (typeof playItem === "function") {
            await playItem(next, { prefetchedAudio });
          }
        } catch {
          // Continue advancing queue cleanly if an item fails playback.
        }
      }
    } finally {
      draining = false;
      if (generation === runGeneration || queue.length === 0) {
        activePlayingMessageId = null;
        isPlaying = false;
        notify();
      }
    }
  };

  const enqueue = (item) => {
    const trimmedText =
      typeof item?.text === "string" ? item.text.trim() : "";
    if (
      !item?.messageId ||
      !trimmedText ||
      !item?.languageCode ||
      item.needsPlayback === false
    ) {
      return { queued: false, prefetched: false };
    }

    void getOrPrefetch(item);

    if (!autoPlayEnabled) {
      notify();
      return { queued: false, prefetched: true };
    }

    if (
      activePlayingMessageId !== item.messageId &&
      !queue.some((entry) => entry.messageId === item.messageId)
    ) {
      queue.push({ ...item, text: trimmedText });
      notify();
    }

    void drain();
    return { queued: true, prefetched: true };
  };

  const setAutoPlayEnabled = (nextEnabled) => {
    const normalized = Boolean(nextEnabled);
    autoPlayEnabled = normalized;
    if (!normalized) {
      pauseAll();
      return;
    }
    notify();
  };

  const toggleAutoPlay = () => {
    setAutoPlayEnabled(!autoPlayEnabled);
    return autoPlayEnabled;
  };

  return {
    enqueue,
    pauseAll,
    yieldToManualPlayback: pauseAll,
    setAutoPlayEnabled,
    toggleAutoPlay,
    getState: () => ({
      autoPlayEnabled,
      activePlayingMessageId,
      isPlaying,
      queueLength: queue.length,
    }),
  };
}

export function useLiveAudioQueue({
  prefetchTranslatedSpeech,
  playTranslatedSpeech,
  pauseActiveAudio,
  chatId = null,
} = {}) {
  const [queueState, setQueueState] = useState(() => ({
    autoPlayEnabled: false,
    activePlayingMessageId: null,
    isPlaying: false,
    queueLength: 0,
  }));

  const prefetchRef = useRef(prefetchTranslatedSpeech);
  const playRef = useRef(playTranslatedSpeech);
  const pauseRef = useRef(pauseActiveAudio);
  const chatIdRef = useRef(chatId);
  const activePlayerRef = useRef(null);

  useEffect(() => {
    prefetchRef.current = prefetchTranslatedSpeech;
  }, [prefetchTranslatedSpeech]);

  useEffect(() => {
    playRef.current = playTranslatedSpeech;
  }, [playTranslatedSpeech]);

  useEffect(() => {
    pauseRef.current = pauseActiveAudio;
  }, [pauseActiveAudio]);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  const stopCurrentPlayer = useCallback(() => {
    if (activePlayerRef.current) {
      try {
        activePlayerRef.current.pause();
      } catch {
        // Ignore paused audio element cleanup
      }
      activePlayerRef.current = null;
    }
    pauseRef.current?.();
  }, []);

  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    controllerRef.current = createLivePlaybackQueue({
      initialAutoPlay: false,
      prefetchItem: (item) =>
        prefetchRef.current?.({
          messageId: item.messageId,
          chatId: item.chatId ?? chatIdRef.current,
          translatedText: item.text,
          translatedPronunciation: item.translatedPronunciation ?? "",
          targetLanguageCode: item.languageCode,
          sourceLanguageCode: item.sourceLanguageCode,
        }) ?? Promise.resolve(null),
      playItem: async (item) => {
        if (typeof playRef.current !== "function") {
          return;
        }
        const player = await playRef.current({
          text: item.text,
          languageCode: item.languageCode,
          ownerKind: "message",
          ownerId: item.messageId,
          role: "translated",
          sourceLanguageCode: item.sourceLanguageCode,
        });

        if (
          !player ||
          typeof player !== "object" ||
          typeof player.addEventListener !== "function"
        ) {
          return;
        }

        activePlayerRef.current = player;
        await new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) {
              return;
            }
            settled = true;
            player.removeEventListener("ended", finish);
            player.removeEventListener("pause", finish);
            player.removeEventListener("error", finish);
            if (activePlayerRef.current === player) {
              activePlayerRef.current = null;
            }
            resolve();
          };

          if (player.ended || player.paused) {
            finish();
            return;
          }

          player.addEventListener("ended", finish);
          player.addEventListener("pause", finish);
          player.addEventListener("error", finish);
        });
      },
      onStopPlayback: stopCurrentPlayer,
      onStateChange: (nextState) => {
        setQueueState(nextState);
      },
    });
  }

  const toggleAutoPlay = useCallback(() => {
    const nextValue = controllerRef.current.toggleAutoPlay();
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(
          LIVE_AUTOPLAY_STORAGE_KEY,
          nextValue ? "true" : "false",
        );
      } catch {
        // Ignore storage write failures
      }
    }
    return nextValue;
  }, []);

  const enqueue = useCallback((item) => {
    return controllerRef.current.enqueue(item);
  }, []);

  const pauseAll = useCallback(() => {
    controllerRef.current.pauseAll();
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.pauseAll();
    };
  }, []);

  return {
    autoPlayEnabled: queueState.autoPlayEnabled,
    activePlayingMessageId: queueState.activePlayingMessageId,
    isLocalAudioPlaying: queueState.isPlaying,
    queueLength: queueState.queueLength,
    toggleAutoPlay,
    enqueue,
    pauseAll,
    yieldToManualPlayback: pauseAll,
  };
}
