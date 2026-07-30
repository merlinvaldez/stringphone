import React, { useRef, useState } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";

import { BASE_AUDIO_ICON_BUTTON_CLASSNAME } from "../audio/TextToSpeechButton.jsx";
import { formatDuration } from "../../utils.js";

export function VoiceMessagePlayer({ audioUrl, onAudioPlay, isSelf, uiStrings }) {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);

  const accentClass = isSelf ? "text-emerald-100" : "text-zinc-300";
  const remainingSeconds =
    duration > 0 ? Math.max(duration - currentTime, 0) : 0;
  const label = isLoadingPlayback
    ? uiStrings.preparingAudio || uiStrings.playAudio
    : isPlaying
      ? uiStrings.pauseAudio
      : uiStrings.playAudio;

  const syncDuration = (audioElement) => {
    if (!audioElement) {
      return;
    }

    if (Number.isFinite(audioElement.duration)) {
      setDuration(audioElement.duration);
    }
  };

  const togglePlayback = async () => {
    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    if (audioElement.paused) {
      try {
        setIsLoadingPlayback(true);
        await audioElement.play();
      } catch {
        setIsPlaying(false);
        setIsLoadingPlayback(false);
      }
      return;
    }

    audioElement.pause();
  };

  return (
    <div className={`flex items-center gap-2 ${isSelf ? "justify-end" : "justify-start"}`}>
      <span
        className={`min-w-[2.8rem] text-[11px] font-semibold tabular-nums tracking-[0.12em] ${accentClass}`}
      >
        {formatDuration(isPlaying ? remainingSeconds : duration)}
      </span>

      <button
        type="button"
        onClick={() => {
          void togglePlayback();
        }}
        className={BASE_AUDIO_ICON_BUTTON_CLASSNAME}
        title={label}
        aria-label={label}
      >
        {isLoadingPlayback ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isPlaying ? (
          <Pause size={14} fill="currentColor" />
        ) : (
          <Volume2 size={14} />
        )}
      </button>

      <audio
        ref={audioRef}
        preload="metadata"
        src={audioUrl}
        onLoadedMetadata={(event) => syncDuration(event.currentTarget)}
        onDurationChange={(event) => syncDuration(event.currentTarget)}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
        }}
        onPlaying={(event) => {
          setIsLoadingPlayback(false);
          setIsPlaying(true);
          onAudioPlay(event.currentTarget);
        }}
        onWaiting={() => {
          setIsLoadingPlayback(true);
        }}
        onPause={() => {
          setIsLoadingPlayback(false);
          setIsPlaying(false);
        }}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setCurrentTime(0);
          setIsLoadingPlayback(false);
          setIsPlaying(false);
        }}
        onError={() => {
          setIsLoadingPlayback(false);
          setIsPlaying(false);
        }}
        className="hidden"
      />
    </div>
  );
}
