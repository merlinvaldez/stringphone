import React, { useEffect, useState } from "react";
import { Bookmark, Check, Loader2 } from "lucide-react";
import { TextToSpeechButton } from "../audio/TextToSpeechButton.jsx";
import { VoiceMessagePlayer } from "./VoiceMessagePlayer.jsx";
import { MessageStatusPill } from "./MessageStatusPill.jsx";
import { formatTimestamp, formatPronunciationGuide } from "../../utils.js";
import { getTextDirectionAttrs } from "../../chatParityHelpers.js";

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
  isSaved = false,
  isSaving = false,
}) {
  const resolvedSender = message.sender || message.speaker || "self";
  const isSelf = resolvedSender === "self";
  const isVoice =
    message.kind === "voice" ||
    (message.originMode === "live" && Boolean(message.audioUrl));
  const showEmbeddedVoicePlayer = isVoice && Boolean(message.audioUrl);
  const isLanguageOne = baseLanguageCode
    ? message.sourceLanguageCode === baseLanguageCode
    : isSelf;
  const showOriginalPronunciation =
    !isLanguageOne || message.sourceLanguageCode === "zh";
  const showTranslatedPronunciation =
    isLanguageOne || message.targetLanguageCode === "zh";
  const bubbleClasses = isLanguageOne
    ? "ml-auto border-emerald-500/25 bg-emerald-500/10"
    : "mr-auto border-sky-500/25 bg-sky-500/10";
  const [saveState, setSaveState] = useState(isSaved ? "saved" : "idle");

  const isSavedInPhrasebook = isSaved || saveState === "saved";
  const isSavingPhrase = isSaving || saveState === "saving";

  const sourceAttrs = getTextDirectionAttrs(message.sourceLanguageCode);
  const targetAttrs = getTextDirectionAttrs(message.targetLanguageCode);

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
    setSaveState(isSaved ? "saved" : "idle");
  }, [message.id, isSaved]);

  const handleSaveToCollection = async () => {
    if (!canSaveToCollection || isSavingPhrase || isSavedInPhrasebook) {
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

  const saveLabel = isSavingPhrase
    ? "Saving to phrasebook"
    : isSavedInPhrasebook
      ? "Saved to phrasebook"
      : "Save to phrasebook";

  const isPending = message.status === "pending";
  const hasError = message.status === "error" || Boolean(message.errorMessage);

  return (
    <article className={`flex w-full ${isSelf ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[88%] sm:max-w-[78%]">
        <div
          className={`rounded-[1.75rem] border px-4 py-3 shadow-xl backdrop-blur-md ${bubbleClasses}`}
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                {formatTimestamp(message.createdAt)}
              </span>
              {isPending ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-200">
                  <Loader2 size={10} className="animate-spin" />
                  <span>Translating</span>
                </span>
              ) : null}
              {hasError ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
                  <span>Needs retry</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {canSaveToCollection ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleSaveToCollection();
                  }}
                  disabled={isSavingPhrase || isSavedInPhrasebook}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white ${
                    isSavedInPhrasebook
                      ? "border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                      : ""
                  } ${
                    isSavingPhrase ? "cursor-wait opacity-60" : ""
                  }`}
                  title={saveLabel}
                  aria-label={saveLabel}
                >
                  {isSavingPhrase ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : isSavedInPhrasebook ? (
                    <Check size={14} />
                  ) : (
                    <Bookmark size={14} />
                  )}
                </button>
              ) : null}
              {!showEmbeddedVoicePlayer && !isPending && !hasError ? (
                <MessageStatusPill status={message.status} uiStrings={uiStrings} />
              ) : null}
            </div>
          </div>

          {isVoice ? (
            <div className="space-y-3">
              {message.transcript ? (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      dir={sourceAttrs.dir}
                      className={`text-sm leading-6 text-white ${sourceAttrs.className}`.trim()}
                    >
                      {message.transcript}
                    </p>
                    {showOriginalPronunciation ? (
                      <PronunciationGuide
                        value={message.originalPronunciation}
                        className={`mt-2 text-sm leading-6 text-zinc-300 ${sourceAttrs.className}`.trim()}
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
                      <p
                        dir={targetAttrs.dir}
                        className={`text-sm leading-6 text-zinc-200 ${targetAttrs.className}`.trim()}
                      >
                        {message.translatedText}
                      </p>
                      {showTranslatedPronunciation ? (
                        <PronunciationGuide
                          value={message.translatedPronunciation}
                          className={`mt-2 text-xs leading-5 text-zinc-400 ${targetAttrs.className}`.trim()}
                        />
                      ) : null}
                    </div>
                    {canPlayTranslatedSpeech ? (
                      <TextToSpeechButton
                        text={message.translatedText}
                        languageCode={message.targetLanguageCode}
                        onPlay={(input) =>
                          onPlayTranslatedSpeech({
                            ...input,
                            ownerKind: "message",
                            ownerId: message.id,
                            role: "translated",
                            sourceLanguageCode: message.sourceLanguageCode,
                          })
                        }
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
                    <p
                      dir={sourceAttrs.dir}
                      className={`text-sm leading-6 text-white ${sourceAttrs.className}`.trim()}
                    >
                      {message.originalText}
                    </p>
                    {showOriginalPronunciation ? (
                      <PronunciationGuide
                        value={message.originalPronunciation}
                        className={`mt-2 text-sm leading-6 text-zinc-300 ${sourceAttrs.className}`.trim()}
                      />
                    ) : null}
                  </div>
                  {canPlayOriginalTextSpeech ? (
                    <TextToSpeechButton
                      text={message.originalText}
                      languageCode={message.sourceLanguageCode}
                      onPlay={(input) =>
                        onPlayTranslatedSpeech({
                          ...input,
                          ownerKind: "message",
                          ownerId: message.id,
                          role: "source",
                          sourceLanguageCode: message.sourceLanguageCode,
                        })
                      }
                      uiStrings={originalTextSpeechUiStrings}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
              </div>

              <div className="border-t border-white/10 pt-3">
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      dir={targetAttrs.dir}
                      className={`text-sm leading-6 text-zinc-200 ${targetAttrs.className}`.trim()}
                    >
                      {message.translatedText ||
                        (message.status === "error"
                          ? uiStrings.translationFailed
                          : "Translating")}
                    </p>
                    {showTranslatedPronunciation ? (
                      <PronunciationGuide
                        value={message.translatedPronunciation}
                        className={`mt-2 text-xs leading-5 text-zinc-400 ${targetAttrs.className}`.trim()}
                      />
                    ) : null}
                  </div>
                  {canPlayTranslatedSpeech ? (
                    <TextToSpeechButton
                      text={message.translatedText}
                      languageCode={message.targetLanguageCode}
                      onPlay={(input) =>
                        onPlayTranslatedSpeech({
                          ...input,
                          ownerKind: "message",
                          ownerId: message.id,
                          role: "translated",
                          sourceLanguageCode: message.sourceLanguageCode,
                        })
                      }
                      uiStrings={translatedSpeechUiStrings}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {hasError ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
                  Needs retry
                </span>
                {message.errorMessage ? (
                  <span className="text-xs text-rose-200">{message.errorMessage}</span>
                ) : null}
              </div>
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
