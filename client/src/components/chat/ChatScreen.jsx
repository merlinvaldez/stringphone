import React, { useState, useEffect, useRef } from "react";
import { ChatHeader } from "./ChatHeader.jsx";
import { ChatThread } from "./ChatThread.jsx";
import { ChatComposer } from "./ChatComposer.jsx";
import { useLiveTurnFlow } from "../live/useLiveTurnFlow.js";
import {
  useCountdown,
  ErrorNotice,
} from "../../StringPhoneApp.jsx";
import { useUiStrings } from "../../uiStrings.js";

export function ChatScreen({
  myLang,
  setMyLang,
  theirLang,
  setTheirLang,
  onInvertLanguages,
  messages,
  submitTextMessage,
  retryMessage,
  onAudioPlay,
  onPlayTranslatedSpeech,
  onSaveToCollection,
  sharedRoomSession,
  sharedRoom,
  sharedRoomStatus,
  sharedRoomInviteUrl,
  pendingInviteToken,
  sharedRoomCopyNotice,
  sharedRoomError,
  onDismissSharedRoomCopyNotice,
  onToggleSharedRoom,
  onCopySharedRoomInvite,
  onOpenSidebar,
  liveCaptureState,
  setLiveCaptureState,
  authFetch,
  onLiveTranscriptDelta,
  onLiveTranscript,
  onLiveCaptureClosed,
}) {
  const mountedRef = useRef(true);
  const [composerText, setComposerText] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const recordingTimer = useCountdown({
    active: status === "recording",
    onExpire: () => {
      if (status === "recording") {
        void handleStopRecording();
      }
    },
  });

  const sourceLanguage = myLang;
  const targetLanguage = theirLang;
  const screenUiStrings = useUiStrings(sourceLanguage);
  const waitingForSharedRoomAutoJoin =
    Boolean(pendingInviteToken) && !sharedRoomSession && !sharedRoomError;
  const liveRoomBusy =
    sharedRoomStatus === "creating" ||
    sharedRoomStatus === "joining" ||
    sharedRoomStatus === "connecting" ||
    sharedRoomStatus === "updating";
  const composerDisabled =
    waitingForSharedRoomAutoJoin ||
    (Boolean(sharedRoomSession) && sharedRoomStatus !== "active");
  const composerDisabledPlaceholder = waitingForSharedRoomAutoJoin
    ? "Joining shared chat..."
    : sharedRoomStatus === "connecting"
      ? "Live room is reconnecting..."
      : "";
  const addCaptureContext = (payload) => ({
    ...payload,
    messageKind: "voice",
  });
  const flow = useLiveTurnFlow({
    myLang,
    theirLang,
    originMode: "chat",
    captureState: liveCaptureState,
    setCaptureState: setLiveCaptureState,
    authFetch,
    onLiveTranscriptDelta: (payload) =>
      onLiveTranscriptDelta?.(addCaptureContext(payload)),
    onLiveTranscript: (payload) =>
      onLiveTranscript?.(addCaptureContext(payload)),
    onLiveCaptureClosed,
  });
  const liveStatus = liveCaptureState?.status ?? "idle";
  const liveIsActive =
    liveStatus === "starting" ||
    liveStatus === "listening" ||
    liveStatus === "processing" ||
    liveStatus === "stopping";
  useEffect(() => {
    if (liveStatus === "error") {
      setStatus("idle");
      setError(liveCaptureState?.lastError || "Live transcription failed.");
      return;
    }

    if (
      liveStatus === "idle" &&
      (status === "recording" || status === "processing")
    ) {
      setStatus("idle");
    }
  }, [liveCaptureState?.lastError, liveStatus, status]);
  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
      };
    },
    [],
  );

  const handleSendText = async () => {
    const text = composerText.trim();

    if (!text || status !== "idle") {
      return;
    }

    setError("");

    setComposerText("");

    await submitTextMessage({
      sourceLanguage,
      targetLanguage,
      text,
      originMode: "chat",
      sender: "self",
    });
  };

  const handleStartRecording = async () => {
    if (status !== "idle" || liveIsActive) return;

    try {
      setError("");
      setStatus("recording");
      await flow.startRecording({
        sender: "self",
        sourceLanguage,
        targetLanguage,
      });
    } catch (recordingError) {
      if (!mountedRef.current) return;
      setStatus("idle");
      setError(recordingError.message);
    }
  };

  async function handleStopRecording() {
    if (status !== "recording") return;

    if (mountedRef.current) {
      setStatus("processing");
    }

    try {
      flow.stopRecording();
    } catch (recordingError) {
      if (!mountedRef.current) {
        return;
      }

      setStatus("idle");
      setError(recordingError.message);
    }
  }

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
        disabled={
          status !== "idle" ||
          liveRoomBusy ||
          waitingForSharedRoomAutoJoin
        }
        uiStrings={screenUiStrings}
        sharedRoomSession={sharedRoomSession}
        sharedRoom={sharedRoom}
        sharedRoomStatus={sharedRoomStatus}
        sharedRoomInviteUrl={sharedRoomInviteUrl}
        pendingInviteToken={pendingInviteToken}
        sharedRoomCopyNotice={sharedRoomCopyNotice}
        onDismissSharedRoomCopyNotice={onDismissSharedRoomCopyNotice}
        onToggleSharedRoom={onToggleSharedRoom}
        onCopySharedRoomInvite={onCopySharedRoomInvite}
        onOpenSidebar={onOpenSidebar}
      />

      {sharedRoomError ? (
        <div className="mb-3 rounded-[1.4rem] border border-rose-500/20 bg-rose-950/40 px-4 py-3 text-sm text-rose-100">
          {sharedRoomError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={messages}
          onRetry={retryMessage}
          onAudioPlay={onAudioPlay}
          onPlayTranslatedSpeech={onPlayTranslatedSpeech}
          onSaveToCollection={onSaveToCollection}
          uiStrings={screenUiStrings}
          baseLanguageCode={myLang.code}
        />
      </div>

      <ChatComposer
        text={composerText}
        setText={setComposerText}
        recordingStatus={status}
        recordingTimer={recordingTimer}
        sourceLanguage={sourceLanguage}
        uiStrings={screenUiStrings}
        onSendText={handleSendText}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        supportsVoiceInput={!liveIsActive}
        disabled={composerDisabled}
        disabledPlaceholder={composerDisabledPlaceholder}
      />

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
