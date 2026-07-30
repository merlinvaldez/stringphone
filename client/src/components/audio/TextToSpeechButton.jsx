import React, { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";

const FALLBACK_UI_STRINGS = {
  playAudio: "Play audio",
  generatingAudio: "Generating audio",
  audioUnavailable: "Audio unavailable.",
};

export const BASE_AUDIO_ICON_BUTTON_CLASSNAME =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white";

export function TextToSpeechButton({
  text,
  languageCode,
  onPlay,
  uiStrings = FALLBACK_UI_STRINGS,
  className = "",
}) {
  const activePlayerRef = useRef(null);
  const playerCleanupRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
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
      : isPlaying
        ? uiStrings.pauseAudio || "Pause audio"
      : canPlay
        ? uiStrings.playAudio || FALLBACK_UI_STRINGS.playAudio
        : uiStrings.audioUnavailable || FALLBACK_UI_STRINGS.audioUnavailable;

  useEffect(() => {
    return () => {
      if (activePlayerRef.current) {
        activePlayerRef.current.pause();
      }
    };
  }, []);

  const clearActivePlayer = () => {
    if (playerCleanupRef.current) {
      playerCleanupRef.current();
      playerCleanupRef.current = null;
    }

    activePlayerRef.current = null;
    setIsPlaying(false);
  };

  const bindPlayerState = (player) => {
    clearActivePlayer();
    activePlayerRef.current = player;
    const handlePlaying = () => {
      setIsPlaying(true);
    };
    const handlePause = () => {
      clearActivePlayer();
    };
    const handleEnded = () => {
      clearActivePlayer();
    };
    const handleError = () => {
      clearActivePlayer();
    };

    player.addEventListener("playing", handlePlaying);
    player.addEventListener("pause", handlePause);
    player.addEventListener("ended", handleEnded);
    player.addEventListener("error", handleError);
    playerCleanupRef.current = () => {
      player.removeEventListener("playing", handlePlaying);
      player.removeEventListener("pause", handlePause);
      player.removeEventListener("ended", handleEnded);
      player.removeEventListener("error", handleError);
    };
    setIsPlaying(!player.paused);
  };

  const handleClick = async () => {
    if (!canPlay || isLoading) {
      return;
    }

    if (isPlaying && activePlayerRef.current) {
      activePlayerRef.current.pause();
      return;
    }

    try {
      setError("");
      setIsLoading(true);
      const player = await onPlay({ text, languageCode });

      if (
        player &&
        typeof player === "object" &&
        typeof player.pause === "function"
      ) {
        bindPlayerState(player);
      }
    } catch (playbackError) {
      console.error("Generated speech playback failed", playbackError);
      clearActivePlayer();
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
      className={`${BASE_AUDIO_ICON_BUTTON_CLASSNAME} ${
        error
          ? "border-rose-400/30 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100"
          : ""
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
      ) : isPlaying ? (
        <Pause size={14} fill="currentColor" />
      ) : (
        <Volume2 size={14} />
      )}
    </button>
  );
}
