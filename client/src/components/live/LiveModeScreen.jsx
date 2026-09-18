import React from "react";
import { Loader2, Radio, Square } from "lucide-react";
import { ChatHeader } from "../chat/ChatHeader.jsx";
import { ChatThread } from "../chat/ChatThread.jsx";
import { useLiveConversationCapture } from "./useLiveConversationCapture.js";
import { ErrorNotice } from "../../StringPhoneApp.jsx";
import { useUiStrings } from "../../uiStrings.js";

function LanguageSide({ language, active, label }) {
  return (
    <div
      className={`rounded-[1.4rem] border px-4 py-3 transition-colors ${
        active
          ? "border-rose-400/40 bg-rose-500/10 shadow-[0_0_28px_rgba(244,63,94,0.12)]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          {label}
        </span>
        {active ? (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
            Speaking
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-sm font-medium text-zinc-200">
        <span>{language.flag}</span>
        <span className="truncate">{language.name}</span>
      </div>
    </div>
  );
}

export function LiveModeScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  onInvertLanguages,
  messages,
  liveDrafts = [],
  liveCaptureState,
  setLiveCaptureState,
  authFetch,
  onLiveTranscriptDelta,
  onLiveTranscript,
  onRetry,
  onAudioPlay,
  onPlayGeneratedSpeech,
  onSaveToCollection,
  onOpenSidebar,
}) {
  const uiStrings = useUiStrings(myLang);
  const { startListening, stopListening } = useLiveConversationCapture({
    myLang,
    theirLang,
    captureState: liveCaptureState,
    setCaptureState: setLiveCaptureState,
    authFetch,
    onLiveTranscriptDelta,
    onLiveTranscript,
  });
  const status = liveCaptureState?.status ?? "idle";
  const isActive =
    status === "listening" || status === "processing";
  const isBusy = status === "starting" || status === "stopping";
  const activeSpeaker = isActive ? liveCaptureState?.activeSpeaker : null;
  const draftMessages = liveDrafts.map((draft) => ({
    id: `live-draft-${draft.utteranceId}`,
    createdAt: draft.createdAt,
    kind: "text",
    originMode: "live",
    sender: draft.sender === "partner" ? "partner" : "self",
    messageOrigin: "human",
    status: draft.status,
    originalText: draft.transcript ?? "",
    originalPronunciation: "",
    translatedText: draft.translatedText ?? "",
    translatedPronunciation: "",
    transcript: draft.transcript ?? "",
    audioUrl: "",
    errorMessage: "",
    sourceLanguageCode: draft.sourceLanguageCode,
    sourceLanguageLabel: draft.sourceLanguageLabel,
    sourceLanguageFlag: draft.sourceLanguageFlag,
    targetLanguageCode: draft.targetLanguageCode,
    targetLanguageLabel: draft.targetLanguageLabel,
    targetLanguageFlag: draft.targetLanguageFlag,
    retryPayload: null,
  }));
  const threadMessages = [...messages, ...draftMessages];
  const statusLabel =
    status === "starting"
      ? "Starting live listening"
      : status === "stopping"
        ? "Stopping live listening"
        : isActive
          ? liveCaptureState?.pendingSegmentCount > 0
            ? `${liveCaptureState.pendingSegmentCount} segment processing`
            : "Listening continuously"
          : "Live is ready";

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden px-4"
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
        disabled={isActive || isBusy}
        uiStrings={uiStrings}
        onOpenSidebar={onOpenSidebar}
      />

      <div className="mb-3 grid grid-cols-2 gap-3">
        <LanguageSide
          language={myLang}
          label="My language"
          active={activeSpeaker === "self"}
        />
        <LanguageSide
          language={theirLang}
          label="Their language"
          active={activeSpeaker === "partner"}
        />
      </div>

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={threadMessages}
          onRetry={onRetry}
          onAudioPlay={onAudioPlay}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
          onSaveToCollection={onSaveToCollection}
          uiStrings={uiStrings}
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.7rem] border border-white/10 bg-zinc-900/85 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Radio
            size={19}
            className={isActive ? "animate-pulse text-rose-400" : "text-zinc-400"}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-zinc-200">
              {statusLabel}
            </div>
            <div className="truncate text-xs text-zinc-500">
              Words appear while you speak; silence finalizes the turn.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={isActive ? () => void stopListening() : () => void startListening()}
          disabled={isBusy}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition disabled:cursor-wait disabled:opacity-60 ${
            isActive
              ? "bg-rose-600 text-white shadow-[0_0_30px_rgba(244,63,94,0.35)]"
              : "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
          }`}
          title={isActive ? "Stop live listening" : "Start live listening"}
          aria-label={isActive ? "Stop live listening" : "Start live listening"}
        >
          {isBusy ? (
            <Loader2 size={19} className="animate-spin" />
          ) : isActive ? (
            <Square size={18} fill="currentColor" />
          ) : (
            <Radio size={19} />
          )}
        </button>
      </div>

      <ErrorNotice
        message={liveCaptureState?.lastError ?? ""}
        onDismiss={() => setLiveCaptureState((state) => ({ ...state, lastError: "" }))}
      />
    </div>
  );
}
