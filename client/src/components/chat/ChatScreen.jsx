import React, { useState, useEffect, useRef } from "react";
import { ChatHeader } from "./ChatHeader.jsx";
import { ChatThread } from "./ChatThread.jsx";
import { ChatComposer } from "./ChatComposer.jsx";
import { useLiveConversationCapture } from "../live/useLiveConversationCapture.js";
import {
  getChatCommandOptions,
  resolveChatSlashSubmission,
} from "./chatCommands.js";
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
  onPlayGeneratedSpeech,
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
  aiPartnerState,
  onExecuteSlashCommand,
  liveCaptureState,
  setLiveCaptureState,
  onLiveSegment,
}) {
  const recorder = useRecorder();
  const mountedRef = useRef(true);
  const [composerText, setComposerText] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [commandNotice, setCommandNotice] = useState("");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
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
  const liveCaptureBusy =
    liveCaptureState?.status === "starting" ||
    liveCaptureState?.status === "listening" ||
    liveCaptureState?.status === "processing" ||
    liveCaptureState?.status === "stopping";
  const composerDisabledPlaceholder = waitingForSharedRoomAutoJoin
    ? "Joining shared chat..."
    : sharedRoomStatus === "connecting"
      ? "Live room is reconnecting..."
      : "";
  const normalizedComposerText = composerText.trim();
  const showCommandMenu = normalizedComposerText.startsWith("/");
  const commandOptions = getChatCommandOptions({
    normalizedComposerText,
    aiPartnerEnabled: Boolean(aiPartnerState?.enabled),
  });
  const partnerStatusLabel = aiPartnerState?.displayName
    ? aiPartnerState.displayName
    : "Partner";
  const { startListening, stopListening } = useLiveConversationCapture({
    myLang,
    theirLang,
    captureState: liveCaptureState,
    setCaptureState: setLiveCaptureState,
    onLiveSegment,
  });

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

  useEffect(() => {
    setActiveCommandIndex(0);
  }, [normalizedComposerText]);

  useEffect(() => {
    if (!commandNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCommandNotice("");
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [commandNotice]);

  const executeSlashCommand = async (commandValue) => {
    const result = await onExecuteSlashCommand({
      rawText: normalizedComposerText,
      command: commandValue,
      sourceLanguage,
      targetLanguage,
    });

    if (!mountedRef.current) {
      return;
    }

    if (result?.handled !== false) {
      setComposerText(result?.nextText ?? "");
    }

    if (result?.notice) {
      setCommandNotice(result.notice);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (!showCommandMenu) {
      return;
    }

    if (commandOptions.length > 0 && event.key === "ArrowDown") {
      event.preventDefault();
      setActiveCommandIndex((currentIndex) =>
        (currentIndex + 1) % commandOptions.length,
      );
      return;
    }

    if (commandOptions.length > 0 && event.key === "ArrowUp") {
      event.preventDefault();
      setActiveCommandIndex((currentIndex) =>
        currentIndex === 0 ? commandOptions.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (
      event.key === "Enter" ||
      (event.key === "Tab" && !event.shiftKey)
    ) {
      event.preventDefault();
      const submission = resolveChatSlashSubmission({
        normalizedComposerText,
        commandOptions,
        activeIndex: activeCommandIndex,
      });

      if (submission.type === "notice") {
        setCommandNotice(submission.notice);
        return;
      }

      void executeSlashCommand(submission.command);
    }
  };

  const handleSendText = async () => {
    const text = composerText.trim();

    if (!text || status !== "idle") {
      return;
    }

    setError("");

    if (text.startsWith("/")) {
      const submission = resolveChatSlashSubmission({
        normalizedComposerText: text,
        commandOptions,
        activeIndex: activeCommandIndex,
      });

      if (submission.type === "notice") {
        setCommandNotice(submission.notice);
        return;
      }

      await executeSlashCommand(submission.command);
      return;
    }

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
        onInvertLanguages={onInvertLanguages}
        disabled={
          status !== "idle" ||
          liveRoomBusy ||
          waitingForSharedRoomAutoJoin ||
          liveCaptureBusy
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

      {aiPartnerState?.enabled || aiPartnerState?.lastError ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {aiPartnerState?.enabled ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
              {aiPartnerState?.status === "replying"
                ? `${partnerStatusLabel} replying`
                : `${partnerStatusLabel} on`}
            </span>
          ) : null}
          {aiPartnerState?.lastError ? (
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-100">
              {aiPartnerState.lastError}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ChatThread
          messages={messages}
          onRetry={retryMessage}
          onAudioPlay={onAudioPlay}
          onPlayGeneratedSpeech={onPlayGeneratedSpeech}
          onSaveToCollection={onSaveToCollection}
          uiStrings={screenUiStrings}
          aiPartnerDisplayName={aiPartnerState?.displayName}
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
        liveCaptureState={liveCaptureState}
        onStartLiveCapture={() => void startListening()}
        onStopLiveCapture={() => void stopListening()}
        supportsVoiceInput
        supportsLiveCapture={!sharedRoomSession && !textOnlyChat}
        showInvertLanguages={textOnlyChat}
        disabled={composerDisabled}
        disabledPlaceholder={composerDisabledPlaceholder}
        commandNotice={commandNotice}
        onInputKeyDown={handleComposerKeyDown}
        commandMenu={{
          visible: showCommandMenu && commandOptions.length > 0,
          commands: commandOptions,
          activeIndex: activeCommandIndex,
          onHoverCommand: setActiveCommandIndex,
          onSelectCommand: (commandValue) => {
            void executeSlashCommand(commandValue);
          },
        }}
      />

      <ErrorNotice message={error} onDismiss={() => setError("")} />
    </div>
  );
}
