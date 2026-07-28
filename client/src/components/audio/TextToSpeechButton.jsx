import React, { useState } from "react";
import { Loader2, Volume2 } from "lucide-react";

const FALLBACK_UI_STRINGS = {
  playAudio: "Play audio",
  generatingAudio: "Generating audio",
  audioUnavailable: "Audio unavailable.",
};

export function TextToSpeechButton({
  text,
  languageCode,
  onPlay,
  uiStrings = FALLBACK_UI_STRINGS,
  className = "",
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const canPlay =
    typeof text === "string" &&
    text.trim().length > 0 &&
    typeof languageCode === "string" &&
    languageCode.trim().length > 0 &&
    typeof onPlay === "function";
  const isDisabled = !canPlay || isLoading;
  const label = error
    ? error
    : isLoading
      ? uiStrings.generatingAudio || FALLBACK_UI_STRINGS.generatingAudio
      : canPlay
        ? uiStrings.playAudio || FALLBACK_UI_STRINGS.playAudio
        : uiStrings.audioUnavailable || FALLBACK_UI_STRINGS.audioUnavailable;

  const handleClick = async () => {
    if (!canPlay || isLoading) {
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      await onPlay({ text, languageCode });
    } catch (playbackError) {
      console.error("Generated speech playback failed", playbackError);
      setError(
        playbackError instanceof Error && playbackError.message
          ? playbackError.message
          : uiStrings.audioUnavailable || FALLBACK_UI_STRINGS.audioUnavailable,
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={isDisabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-white/5 transition ${
        error
          ? "border-rose-400/30 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100"
          : "border-white/10 text-zinc-300 hover:bg-white/10 hover:text-white"
      } ${
        !canPlay
          ? "cursor-not-allowed opacity-60"
          : isLoading
            ? "cursor-wait opacity-60"
            : ""
      } ${className}`}
    >
      {isLoading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Volume2 size={14} />
      )}
    </button>
  );
}
