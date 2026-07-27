import React, { useState, useEffect, useRef } from "react";
import { ChatHeader } from "./ChatHeader.jsx";
import { ChatThread } from "./ChatThread.jsx";
import { ChatComposer } from "./ChatComposer.jsx";
import {
  useRecorder,
  useCountdown,
  ErrorNotice,
  usesChatOnlyTextLanguage,
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
  submitVoiceMessage,
  retryMessage,
  onAudioPlay,
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
}) {
  const recorder = useRecorder();
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
  const textOnlyChat = usesChatOnlyTextLanguage(sourceLanguage, targetLanguage);
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

  useEffect(
    () => {
      mountedRef.current = true;

      return () => {
        mountedRef.current = false;
        recorder.cancel();
      };
    },
    [],
  );

  const handleSendText = async () => {
    const text = composerText.trim();

    if (!text || status !== "idle") {
      return;
    }

    setComposerText("");
    setError("");

    await submitTextMessage({
      sourceLanguage,
      targetLanguage,
      text,
      originMode: "chat",
      sender: "self",
    });
  };

  const handleStartRecording = async () => {
    if (status !== "idle") return;

    try {
      setError("");
      await recorder.start();

      if (mountedRef.current) {
        setStatus("recording");
      }
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
      const recording = await recorder.stop();

      await submitVoiceMessage({
        sourceLanguage,
        targetLanguage,
        recording,
        originMode: "chat",
        sender: "self",
      });

      if (mountedRef.current) {
        setStatus("idle");
      }
    } catch (recordingError) {
      recorder.cancel();

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
        disabled={status !== "idle" || liveRoomBusy || waitingForSharedRoomAutoJoin}
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
          uiStrings={screenUiStrings}
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
        onInvertLanguages={onInvertLanguages}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        supportsVoiceInput
        showInvertLanguages={textOnlyChat}
        disabled={composerDisabled}
        disabledPlaceholder={composerDisabledPlaceholder}
      />

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
