import React from "react";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer.jsx";
import { MessageStatusPill } from "./MessageStatusPill.jsx";
import { formatTimestamp, formatPronunciationGuide } from "../../utils.js";

function PronunciationGuide({ value, className }) {
  const pronunciation = formatPronunciationGuide(value);

  if (!pronunciation) {
    return null;
  }

  return <p className={className}>({pronunciation})</p>;
}

export function MessageBubble({ message, onRetry, onAudioPlay, uiStrings }) {
  const isSelf = message.sender === "self";
  const isVoice = message.kind === "voice";
  const bubbleClasses = isSelf
    ? "ml-auto border-emerald-500/20 bg-emerald-500/10"
    : "mr-auto border-white/10 bg-zinc-900/90";

  return (
    <article className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[88%] sm:max-w-[78%]">
        <div
          className={`rounded-[1.75rem] border px-4 py-3 shadow-xl backdrop-blur-md ${bubbleClasses}`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <span className="pt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {formatTimestamp(message.createdAt)}
            </span>
            {isVoice && message.audioUrl ? (
              <VoiceMessagePlayer
                audioUrl={message.audioUrl}
                onAudioPlay={onAudioPlay}
                isSelf={isSelf}
                uiStrings={uiStrings}
              />
            ) : (
              <MessageStatusPill status={message.status} uiStrings={uiStrings} />
            )}
          </div>

          {isVoice ? (
            <div className="space-y-3">
              {message.transcript ? (
                <div>
                  <p className="text-sm leading-6 text-white">
                    {message.transcript}
                  </p>
                  {!isSelf ? (
                    <PronunciationGuide
                      value={message.originalPronunciation}
                      className="mt-2 text-sm leading-6 text-zinc-300"
                    />
                  ) : null}
                </div>
              ) : message.status !== "error" ? (
                <p className="text-sm leading-6 text-zinc-400">
                  {uiStrings.preparingAudio}
                </p>
              ) : null}

              {message.translatedText ? (
                <div className="border-t border-white/10 pt-3">
                  <p className="text-sm leading-6 text-zinc-200">
                    {message.translatedText}
                  </p>
                  {isSelf ? (
                    <PronunciationGuide
                      value={message.translatedPronunciation}
                      className="mt-2 text-xs leading-5 text-zinc-400"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-sm leading-6 text-white">
                  {message.originalText}
                </p>
                {!isSelf ? (
                  <PronunciationGuide
                    value={message.originalPronunciation}
                    className="mt-2 text-sm leading-6 text-zinc-300"
                  />
                ) : null}
              </div>

              <div className="border-t border-white/10 pt-3">
                <p className="text-sm leading-6 text-zinc-200">
                  {message.translatedText ||
                    (message.status === "error"
                      ? uiStrings.translationFailed
                      : uiStrings.translatingShort)}
                </p>
                {isSelf ? (
                  <PronunciationGuide
                    value={message.translatedPronunciation}
                    className="mt-2 text-xs leading-5 text-zinc-400"
                  />
                ) : null}
              </div>
            </div>
          )}

          {message.errorMessage ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <span className="text-xs text-rose-200">{message.errorMessage}</span>
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-white/10"
              >
                {uiStrings.retry}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
