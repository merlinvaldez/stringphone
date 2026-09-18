import React from "react";
import { Square, Send, Mic, ArrowLeftRight, Loader2 } from "lucide-react";
import { interpolateTemplate } from "../../uiStrings.js";
import { AudioWave } from "../../StringPhoneApp.jsx";
import { ChatCommandMenu } from "./ChatCommandMenu.jsx";

export function ChatComposer({
  text,
  setText,
  recordingStatus,
  recordingTimer,
  sourceLanguage,
  uiStrings,
  onSendText,
  onInvertLanguages,
  onStartRecording,
  onStopRecording,
  supportsVoiceInput = true,
  showInvertLanguages = false,
  disabled = false,
  disabledPlaceholder = "",
  commandMenu = null,
  commandNotice = "",
  onInputKeyDown,
}) {
  const hasText = text.trim().length > 0;
  const canSendText = hasText && recordingStatus === "idle" && !disabled;
  const actionKind =
    recordingStatus === "recording" ? "stop" : hasText ? "send" : "mic";

  const actionProps =
    actionKind === "stop"
      ? {
          onClick: onStopRecording,
          title: uiStrings.stopVoiceNote,
          className:
            "bg-rose-600 text-white shadow-[0_0_30px_rgba(244,63,94,0.35)]",
          icon: <Square size={18} fill="currentColor" />,
          disabled: false,
        }
      : actionKind === "send"
        ? {
            onClick: onSendText,
            title: uiStrings.sendTextMessage,
            className:
              "bg-emerald-500 text-zinc-950 shadow-[0_0_30px_rgba(16,185,129,0.35)] hover:bg-emerald-400",
            icon: <Send size={18} />,
            disabled: false,
          }
        : {
            onClick: onStartRecording,
            title: uiStrings.recordVoiceNote,
            className:
              "border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
            icon: <Mic size={18} />,
            disabled: recordingStatus === "processing" || !supportsVoiceInput,
          };

  return (
    <div className="mt-4 rounded-[2rem] border border-white/10 bg-zinc-900/80 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
      {commandNotice ? (
        <div className="mb-3 rounded-[1.1rem] border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
          {commandNotice}
        </div>
      ) : null}

      {commandMenu?.visible ? (
        <div className="mb-3">
          <ChatCommandMenu
            commands={commandMenu.commands}
            activeIndex={commandMenu.activeIndex}
            onHoverCommand={commandMenu.onHoverCommand}
            onSelectCommand={commandMenu.onSelectCommand}
          />
        </div>
      ) : null}

      {recordingStatus !== "idle" ? (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-zinc-200">
            {recordingStatus === "recording"
              ? interpolateTemplate(uiStrings.secondsLeft, {
                  seconds: recordingTimer,
                })
              : uiStrings.translatingVoiceNote}
          </div>
          {recordingStatus === "recording" ? (
            <AudioWave active colorClass="bg-rose-400" />
          ) : (
            <Loader2 size={18} className="animate-spin text-amber-300" />
          )}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            onInputKeyDown?.(event);

            if (event.defaultPrevented) {
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSendText) {
                onSendText();
              }
            }
          }}
          disabled={recordingStatus !== "idle" || disabled}
          placeholder={
            disabled
              ? disabledPlaceholder
              : interpolateTemplate(uiStrings.messageIn, {
                  language: sourceLanguage.name,
                })
          }
          className="h-14 flex-1 rounded-[1.5rem] border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {showInvertLanguages ? (
          <button
            type="button"
            onClick={onInvertLanguages}
            disabled={recordingStatus !== "idle" || disabled}
            className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            title={uiStrings.invertLanguages}
            aria-label={uiStrings.invertLanguages}
          >
            <ArrowLeftRight size={18} />
          </button>
        ) : null}

        <button
          type="button"
          onClick={actionProps.onClick}
          disabled={actionProps.disabled || disabled}
          className={`flex h-14 w-14 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${actionProps.className}`}
          title={actionProps.title}
          aria-label={actionProps.title}
        >
          {actionProps.icon}
        </button>
      </div>
    </div>
  );
}
