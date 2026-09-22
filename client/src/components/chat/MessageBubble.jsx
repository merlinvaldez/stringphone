import React, { useEffect, useState } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import { TextToSpeechButton } from "../audio/TextToSpeechButton.jsx";
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

export function MessageBubble({
  message,
  onRetry,
  onAudioPlay,
  onPlayTranslatedSpeech,
  onSaveToCollection,
  uiStrings,
  baseLanguageCode = "",
}) {
  const isSelf = message.sender === "self";
  const isVoice =
    message.kind === "voice" ||
    (message.originMode === "live" && Boolean(message.audioUrl));
  const showEmbeddedVoicePlayer = isVoice && Boolean(message.audioUrl);
  const isLanguageOne = baseLanguageCode
    ? message.sourceLanguageCode === baseLanguageCode
    : isSelf;
  const bubbleClasses = isLanguageOne
    ? "ml-auto border-emerald-500/25 bg-emerald-500/10"
    : "mr-auto border-sky-500/25 bg-sky-500/10";
  const [saveState, setSaveState] = useState("idle");
  const canSaveToCollection =
    typeof onSaveToCollection === "function" &&
    message.status === "ready" &&
    Boolean(
      (isSelf ? message.translatedText : message.originalText) &&
      (isSelf ? message.originalText : message.translatedText),
    );
  const canPlayTranslatedSpeech =
    message.status === "ready" &&
    Boolean(message.translatedText) &&
    typeof onPlayTranslatedSpeech === "function";
  const canPlayOriginalTextSpeech =
    !isVoice &&
    message.status === "ready" &&
    Boolean(message.originalText) &&
    typeof onPlayTranslatedSpeech === "function";
  const originalTextSpeechUiStrings = {
    ...uiStrings,
    playAudio: "Play original-language text audio",
    generatingAudio: "Generating original-language text audio",
    audioUnavailable: "Original-language audio unavailable.",
  };
  const translatedSpeechUiStrings = {
    ...uiStrings,
    playAudio: "Play AI-generated translated audio",
    generatingAudio: "Generating AI-generated translated audio",
    audioUnavailable: "Translated audio unavailable.",
  };

  useEffect(() => {
    setSaveState("idle");
  }, [message.id]);

  const handleSaveToCollection = async () => {
    if (!canSaveToCollection || saveState === "saving") {
      return;
    }

    try {
      setSaveState("saving");
      const result = await onSaveToCollection(message);
      setSaveState(result?.saved ? "saved" : "idle");
    } catch (error) {
      console.error("Failed to save message to collection", error);
      setSaveState("idle");
    }
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving to phrasebook"
      : saveState === "saved"
        ? "Saved to phrasebook"
        : "Save to phrasebook";

  return (
    <article className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[88%] sm:max-w-[78%]">
        <div
          className={`rounded-[1.75rem] border px-4 py-3 shadow-xl backdrop-blur-md ${bubbleClasses}`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {formatTimestamp(message.createdAt)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {canSaveToCollection ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleSaveToCollection();
                  }}
                  disabled={saveState === "saving"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white ${
                    saveState === "saved"
                      ? "border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                      : ""
                  } ${
                    saveState === "saving" ? "cursor-wait opacity-60" : ""
                  }`}
                  title={saveLabel}
                  aria-label={saveLabel}
                >
                  {saveState === "saving" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : saveState === "saved" ? (
                    <Check size={14} />
                  ) : (
                    <Bookmark size={14} />
                  )}
                </button>
              ) : null}
              {!showEmbeddedVoicePlayer ? (
                <MessageStatusPill status={message.status} uiStrings={uiStrings} />
              ) : null}
            </div>
          </div>

          {isVoice ? (
            <div className="space-y-3">
              {message.transcript ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-white">{message.transcript}</p>
                    {!isSelf ? (
                      <PronunciationGuide
                        value={message.originalPronunciation}
                        className="mt-2 text-sm leading-6 text-zinc-300"
                      />
                    ) : null}
                  </div>
                  {showEmbeddedVoicePlayer ? (
                    <VoiceMessagePlayer
                      audioUrl={message.audioUrl}
                      onAudioPlay={onAudioPlay}
                      isSelf={isSelf}
                      uiStrings={uiStrings}
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
                  <div className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
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
                    {canPlayTranslatedSpeech ? (
                      <TextToSpeechButton
                        text={message.translatedText}
                        languageCode={message.targetLanguageCode}
                        onPlay={onPlayTranslatedSpeech}
                        uiStrings={translatedSpeechUiStrings}
                        className="shrink-0"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
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
                  {canPlayOriginalTextSpeech ? (
                    <TextToSpeechButton
                      text={message.originalText}
                      languageCode={message.sourceLanguageCode}
                      onPlay={onPlayTranslatedSpeech}
                      uiStrings={originalTextSpeechUiStrings}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
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
                  {canPlayTranslatedSpeech ? (
                    <TextToSpeechButton
                      text={message.translatedText}
                      languageCode={message.targetLanguageCode}
                      onPlay={onPlayTranslatedSpeech}
                      uiStrings={translatedSpeechUiStrings}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
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
