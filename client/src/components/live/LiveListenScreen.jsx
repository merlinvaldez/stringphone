import React, { useEffect, useRef, useState } from "react";
import { Ear, Loader2, Menu, Volume2, VolumeX } from "lucide-react";
import { ChatThread } from "../chat/ChatThread.jsx";
import { useVoxtralLiveListen } from "./useVoxtralLiveListen.js";
import { useLiveAudioQueue } from "./useLiveAudioQueue.js";
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
  prefetchMessageTranslatedSpeech,
  pauseActiveAudio,
  onSaveToCollection,
  savedSourceMessageIds = null,
  savingMessageId = null,
  onOpenSidebar,
  onBeforeCapture,
  activeChatId = null,
}) {
  const mountedRef = useRef(true);
  const [error, setError] = useState("");

  const listenerLangRef = useRef(myLang);
  const activeChatIdRef = useRef(activeChatId);
  const queueEnqueueRef = useRef(null);

  useEffect(() => {
    listenerLangRef.current = myLang;
  }, [myLang]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const screenUiStrings = useUiStrings(myLang);

  const liveAudioQueue = useLiveAudioQueue({
    prefetchTranslatedSpeech: prefetchMessageTranslatedSpeech,
    playTranslatedSpeech: onPlayTranslatedSpeech,
    pauseActiveAudio,
    chatId: activeChatId,
  });

  useEffect(() => {
    queueEnqueueRef.current = liveAudioQueue.enqueue;
  }, [liveAudioQueue.enqueue]);

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
        return;
      }

      if (!result?.items?.length) {
        return;
      }

      for (const { message, segment } of result.items) {
        if (segment?.needsPlayback && message?.translatedText) {
          queueEnqueueRef.current?.({
            messageId: message.id,
            chatId: activeChatIdRef.current,
            text: message.translatedText,
            translatedPronunciation: message.translatedPronunciation ?? "",
            languageCode: message.targetLanguageCode,
            sourceLanguageCode: message.sourceLanguageCode,
            needsPlayback: true,
          });
        }
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
    isLocalAudioPlaying: liveAudioQueue.isLocalAudioPlaying,
    onBeforeStart: () => {
      setError("");
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

  const handleManualPlayTranslatedSpeech = (input) => {
    liveAudioQueue.yieldToManualPlayback();
    return onPlayTranslatedSpeech?.(input);
  };

  const handleManualAudioPlay = (audioElement) => {
    liveAudioQueue.yieldToManualPlayback();
    onAudioPlay?.(audioElement);
  };

  const autoPlayLabel = liveAudioQueue.autoPlayEnabled
    ? screenUiStrings.liveAutoPlayOn
    : screenUiStrings.liveAutoPlayOff;

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
          activePlayingMessageId={liveAudioQueue.activePlayingMessageId}
          onStopLivePlayback={liveAudioQueue.pauseAll}
        />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3 pb-1">
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

        <button
          type="button"
          onClick={() => liveAudioQueue.toggleAutoPlay()}
          className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition ${
            liveAudioQueue.autoPlayEnabled
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100"
              : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
          }`}
          title={autoPlayLabel}
          aria-label={autoPlayLabel}
          aria-pressed={liveAudioQueue.autoPlayEnabled}
        >
          {liveAudioQueue.autoPlayEnabled ? (
            <Volume2 size={18} />
          ) : (
            <VolumeX size={18} />
          )}
        </button>
      </div>

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
