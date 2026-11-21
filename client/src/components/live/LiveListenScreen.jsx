import React, { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { ChatHeader } from "../chat/ChatHeader.jsx";
import { ChatThread } from "../chat/ChatThread.jsx";
import { ChatComposer } from "../chat/ChatComposer.jsx";
import { LiveTranslationDock } from "./LiveTranslationDock.jsx";
import { useVoxtralLiveListen } from "./useVoxtralLiveListen.js";
import { useLiveAudioQueue } from "./useLiveAudioQueue.js";
import { ErrorNotice } from "../../StringPhoneApp.jsx";
import { useUiStrings } from "../../uiStrings.js";
import { formatDuration } from "../../utils.js";

export function LiveListenScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  onInvertLanguages,
  messages,
  submitTextMessage,
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
  const [composerText, setComposerText] = useState("");
  const [error, setError] = useState("");
  const [previewDraft, setPreviewDraft] = useState(null);
  const [isDockExpanded, setIsDockExpanded] = useState(false);

  const listenerLangRef = useRef(myLang);
  const theirLangRef = useRef(theirLang);
  const activeChatIdRef = useRef(activeChatId);
  const queueEnqueueRef = useRef(null);

  useEffect(() => {
    listenerLangRef.current = myLang;
  }, [myLang]);

  useEffect(() => {
    theirLangRef.current = theirLang;
  }, [theirLang]);

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
        theirLanguage: theirLangRef.current,
        isPreview: false,
      });

      if (!mountedRef.current) {
        return;
      }

      setPreviewDraft(null);
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

  const handlePreviewReady = async (previewBlob) => {
    if (!mountedRef.current || !previewBlob || previewBlob.size <= 0) {
      return;
    }

    try {
      const result = await onProcessLiveListenChunk?.({
        audioBlob: previewBlob,
        listenerLanguage: listenerLangRef.current,
        theirLanguage: theirLangRef.current,
        isPreview: true,
      });

      if (!mountedRef.current || !result?.segments?.length) {
        return;
      }

      const lastSegment = result.segments[result.segments.length - 1];
      const combinedTranscript = result.segments
        .map((segment) => segment.transcript)
        .filter(Boolean)
        .join(" ");
      const combinedTranslation = result.segments
        .map((segment) => segment.translatedText)
        .filter(Boolean)
        .join(" ");

      setPreviewDraft({
        sourceLanguageCode: lastSegment.sourceLanguage?.code || "",
        sourceLanguageLabel:
          lastSegment.sourceLanguage?.label ||
          lastSegment.sourceLanguage?.code ||
          "Spoken",
        targetLanguageCode: lastSegment.targetLanguage?.code || "",
        targetLanguageLabel:
          lastSegment.targetLanguage?.label ||
          listenerLangRef.current?.name ||
          "Translation",
        transcript: combinedTranscript,
        translatedText: combinedTranslation,
      });
    } catch {
      // Ignore transient preview errors while continuous capture runs.
    }
  };

  const liveListen = useVoxtralLiveListen({
    isLocalAudioPlaying: liveAudioQueue.isLocalAudioPlaying,
    onBeforeStart: () => {
      setError("");
      setPreviewDraft(null);
      onBeforeCapture?.();
    },
    onChunkReady: (blob) => {
      void handleChunkReady(blob);
    },
    onPreviewReady: (blob) => {
      void handlePreviewReady(blob);
    },
    onError: (message) => {
      if (mountedRef.current) {
        setError(message);
      }
    },
  });

  const isListeningActive =
    liveListen.status === "starting" ||
    liveListen.status === "listening" ||
    liveListen.status === "stopping";

  const composerRecordingStatus =
    liveListen.status === "starting"
      ? "starting"
      : liveListen.status === "listening"
        ? "recording"
        : liveListen.status === "stopping"
          ? "processing"
          : "idle";

  const handleManualPlayTranslatedSpeech = (input) => {
    liveAudioQueue.yieldToManualPlayback();
    return onPlayTranslatedSpeech?.(input);
  };

  const handleManualAudioPlay = (audioElement) => {
    liveAudioQueue.yieldToManualPlayback();
    onAudioPlay?.(audioElement);
  };

  const handleSendText = async () => {
    const trimmed = composerText.trim();
    if (!trimmed || composerRecordingStatus !== "idle") {
      return;
    }
    setError("");
    setComposerText("");
    await submitTextMessage?.({
      sourceLanguage: myLang,
      targetLanguage: theirLang,
      text: trimmed,
      originMode: "chat",
      sender: "self",
    });
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
      <ChatHeader
        myLang={myLang}
        setMyLang={setMyLang}
        theirLang={theirLang}
        setTheirLang={setTheirLang}
        onInvertLanguages={onInvertLanguages}
        disabled={isListeningActive}
        uiStrings={screenUiStrings}
        onOpenSidebar={onOpenSidebar}
      />

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

      {isListeningActive || previewDraft ? (
        <LiveTranslationDock
          draft={previewDraft}
          status={liveListen.status}
          isExpanded={isDockExpanded}
          onToggleExpanded={() => setIsDockExpanded((prev) => !prev)}
          uiStrings={screenUiStrings}
        />
      ) : null}

      <ChatComposer
        text={composerText}
        setText={setComposerText}
        recordingStatus={composerRecordingStatus}
        recordingTimer={0}
        recordingBannerText={`${screenUiStrings.liveListening} · ${formatDuration(liveListen.elapsedSeconds)}`}
        sourceLanguage={myLang}
        uiStrings={screenUiStrings}
        onSendText={handleSendText}
        onStartRecording={() => {
          void liveListen.startListening();
        }}
        onStopRecording={() => {
          liveListen.stopListening();
        }}
        extraAction={
          <button
            type="button"
            onClick={() => liveAudioQueue.toggleAutoPlay()}
            className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border transition ${
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
        }
      />

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
