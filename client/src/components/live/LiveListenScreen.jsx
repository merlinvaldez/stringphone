import React, { useCallback, useEffect, useRef, useState } from "react";
import { Ear, Loader2, Menu } from "lucide-react";
import { ChatThread } from "../chat/ChatThread.jsx";
import { useVoxtralLiveListen } from "./useVoxtralLiveListen.js";
import { ErrorNotice, LanguageSelector } from "../../StringPhoneApp.jsx";
import { useUiStrings } from "../../uiStrings.js";

export function LiveListenScreen({
  myLang,
  setMyLang,
  messages,
  onProcessLiveListenChunk,
  retryMessage,
  onAudioPlay,
  onPlayTranslatedSpeech,
  onSaveToCollection,
  savedSourceMessageIds = null,
  savingMessageId = null,
  onOpenSidebar,
  onBeforeCapture,
}) {
  const mountedRef = useRef(true);
  const [error, setError] = useState("");
  const [isManualAudioPlaying, setIsManualAudioPlaying] = useState(false);

  const listenerLangRef = useRef(myLang);
  const manualAudioCleanupRef = useRef(null);

  useEffect(() => {
    listenerLangRef.current = myLang;
  }, [myLang]);

  const clearManualAudioTracking = useCallback(() => {
    const cleanup = manualAudioCleanupRef.current;
    manualAudioCleanupRef.current = null;
    cleanup?.();
    if (mountedRef.current) {
      setIsManualAudioPlaying(false);
    }
  }, []);

  const trackManualAudioElement = useCallback(
    (audioElement) => {
      clearManualAudioTracking();
      if (
        !audioElement ||
        typeof audioElement !== "object" ||
        typeof audioElement.addEventListener !== "function"
      ) {
        return;
      }

      const handlePlaying = () => {
        if (mountedRef.current) {
          setIsManualAudioPlaying(true);
        }
      };
      const handleStopped = () => {
        clearManualAudioTracking();
      };

      audioElement.addEventListener("playing", handlePlaying);
      audioElement.addEventListener("pause", handleStopped);
      audioElement.addEventListener("ended", handleStopped);
      audioElement.addEventListener("error", handleStopped);

      manualAudioCleanupRef.current = () => {
        audioElement.removeEventListener("playing", handlePlaying);
        audioElement.removeEventListener("pause", handleStopped);
        audioElement.removeEventListener("ended", handleStopped);
        audioElement.removeEventListener("error", handleStopped);
      };

      if (!audioElement.paused && !audioElement.ended && mountedRef.current) {
        setIsManualAudioPlaying(true);
      }
    },
    [clearManualAudioTracking],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      manualAudioCleanupRef.current?.();
      manualAudioCleanupRef.current = null;
    };
  }, []);

  const screenUiStrings = useUiStrings(myLang);

  const handleChunkReady = async (audioBlob) => {
    if (!mountedRef.current || !audioBlob || audioBlob.size <= 0) {
      return;
    }

    try {
      const result = await onProcessLiveListenChunk?.({
        audioBlob,
        listenerLanguage: listenerLangRef.current,
        isPreview: false,
      });

      if (!mountedRef.current) {
        return;
      }

      if (result && result.ok === false && result.error) {
        setError(result.error);
      }
    } catch (chunkError) {
      if (mountedRef.current) {
        setError(
          chunkError instanceof Error && chunkError.message
            ? chunkError.message
            : "Live listening failed.",
        );
      }
    }
  };

  const liveListen = useVoxtralLiveListen({
    isLocalAudioPlaying: isManualAudioPlaying,
    onBeforeStart: () => {
      setError("");
      clearManualAudioTracking();
      onBeforeCapture?.();
    },
    onChunkReady: (blob) => {
      void handleChunkReady(blob);
    },
    onError: (message) => {
      if (mountedRef.current) {
        setError(message);
      }
    },
  });

  const isTransitioning =
    liveListen.status === "starting" || liveListen.status === "stopping";
  const isToggledOn = liveListen.status === "listening";
  const isListeningActive = isToggledOn || isTransitioning;
  const listenButtonLabel = isToggledOn
    ? screenUiStrings.liveListening
    : screenUiStrings.listen;

  const handleToggleListen = () => {
    if (isTransitioning) {
      return;
    }
    if (isToggledOn) {
      liveListen.stopListening();
    } else {
      void liveListen.startListening();
    }
  };

  const handleManualPlayTranslatedSpeech = async (input) => {
    const player = await onPlayTranslatedSpeech?.(input);
    trackManualAudioElement(player);
    return player;
  };

  const handleManualAudioPlay = (audioElement) => {
    trackManualAudioElement(audioElement);
    onAudioPlay?.(audioElement);
  };

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-visible px-4"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 16px) + 5.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 16px) + 0.85rem)",
      }}
    >
      <div className="relative z-20 mb-4 grid grid-cols-[auto_1fr_auto] items-center gap-2 sm:px-1">
        <div className="flex items-center justify-start">
          {onOpenSidebar ? (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="rounded-full border border-white/10 bg-white/5 p-2 text-zinc-300 transition hover:bg-white/10 hover:text-white"
              title="History"
              aria-label="Open history"
            >
              <Menu size={18} />
            </button>
          ) : (
            <div className="w-9" />
          )}
        </div>

        <div className="flex min-w-0 justify-center">
          <LanguageSelector
            selected={myLang}
            onSelect={setMyLang}
            disabled={isListeningActive}
            searchPlaceholder={screenUiStrings.searchLanguages}
            menuAlign="center"
            containerClassName="min-w-[148px] max-w-full"
            buttonClassName="min-w-0 justify-center px-4"
          />
        </div>

        <div className="w-9" />
      </div>

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={messages}
          onRetry={retryMessage}
          onAudioPlay={handleManualAudioPlay}
          onPlayTranslatedSpeech={handleManualPlayTranslatedSpeech}
          onSaveToCollection={onSaveToCollection}
          uiStrings={screenUiStrings}
          baseLanguageCode={myLang.code}
          savedSourceMessageIds={savedSourceMessageIds}
          savingMessageId={savingMessageId}
        />
      </div>

      <div className="mt-4 flex items-center justify-center pb-1">
        <button
          type="button"
          onClick={handleToggleListen}
          disabled={isTransitioning}
          aria-pressed={isToggledOn}
          aria-label={listenButtonLabel}
          title={listenButtonLabel}
          className={`inline-flex h-14 items-center justify-center gap-2.5 rounded-full border px-7 text-xs font-semibold uppercase tracking-[0.2em] transition disabled:cursor-wait disabled:opacity-70 ${
            isToggledOn
              ? "border-rose-400/50 bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-[0_0_32px_rgba(244,63,94,0.35)]"
              : "border-white/10 bg-zinc-800/90 text-zinc-200 hover:bg-zinc-700 hover:text-white"
          }`}
        >
          {isTransitioning ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Ear size={18} />
          )}
          <span>{listenButtonLabel}</span>
        </button>
      </div>

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
