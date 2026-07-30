import React, { useRef, useState } from "react";
import { Loader2, Pause, Volume2 } from "lucide-react";

import { BASE_AUDIO_ICON_BUTTON_CLASSNAME } from "../audio/TextToSpeechButton.jsx";

export function VoiceMessagePlayer({ audioUrl, onAudioPlay, isSelf, uiStrings }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingPlayback, setIsLoadingPlayback] = useState(false);
  const label = isLoadingPlayback
    ? uiStrings.preparingAudio || uiStrings.playAudio
    : isPlaying
      ? uiStrings.pauseAudio
      : uiStrings.playAudio;

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
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
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
