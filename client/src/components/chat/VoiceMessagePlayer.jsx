import React, { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { formatDuration } from "../../utils.js";

export function VoiceMessagePlayer({ audioUrl, onAudioPlay, isSelf, uiStrings }) {
  const audioRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const accentClass = isSelf ? "text-emerald-200" : "text-zinc-200";
  const trackClass = isSelf ? "stroke-emerald-300/25" : "stroke-white/15";
  const progressClass = isSelf ? "stroke-emerald-300" : "stroke-indigo-300";
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const remainingSeconds =
    duration > 0 ? Math.max(duration - currentTime, 0) : 0;
  const progress =
    duration > 0 ? Math.max(remainingSeconds / duration, 0) : 0;
  const dashOffset = circumference * (1 - progress);

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
        await audioElement.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }

    audioElement.pause();
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`min-w-[2.8rem] text-right text-[11px] font-semibold tabular-nums tracking-[0.12em] ${accentClass}`}
      >
        {formatDuration(isPlaying ? remainingSeconds : duration)}
      </span>

      <button
        type="button"
        onClick={() => {
          void togglePlayback();
        }}
        className={`relative flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/20 transition hover:bg-black/30 ${accentClass}`}
        title={isPlaying ? uiStrings.pauseAudio : uiStrings.playAudio}
      >
        <svg
          viewBox="0 0 44 44"
          className="absolute inset-0 h-full w-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            className={trackClass}
          />
          <circle
            cx="22"
            cy="22"
            r={radius}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={progressClass}
          />
        </svg>
        {isPlaying ? (
          <Pause size={16} className="relative z-10" fill="currentColor" />
        ) : (
          <Play size={16} className="relative z-10 translate-x-[1px]" fill="currentColor" />
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
        onPlay={(event) => {
          setIsPlaying(true);
          onAudioPlay(event.currentTarget);
        }}
        onPause={() => {
          setIsPlaying(false);
        }}
        onEnded={(event) => {
          event.currentTarget.currentTime = 0;
          setCurrentTime(0);
          setIsPlaying(false);
        }}
        className="hidden"
      />
    </div>
  );
}
