import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  AudioPlaybackCoordinator,
  configureNativeAudioSession,
  useNativeAudioPlayer,
  useNativeAudioPlayerStatus,
} from '../adapters/audio';
import { ensureNativePhraseSpeech, resolveNativePhraseAudio } from './native';

export type PhraseAudioRole = 'source' | 'translated';
export type PhrasePlayback = { phraseId: string; role: PhraseAudioRole } | null;

function playbackId(active: PhrasePlayback) {
  return active ? `phrasebook:${active.phraseId}:${active.role}` : undefined;
}

export function usePhrasebookAudioPlayback(speechVoice?: 'marin' | 'onyx') {
  const player = useNativeAudioPlayer(null);
  const status = useNativeAudioPlayerStatus(player);
  const [activeAudio, setActiveAudio] = useState<PhrasePlayback>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const activeAudioRef = useRef<PhrasePlayback>(null);
  const setActive = useCallback((next: PhrasePlayback) => {
    activeAudioRef.current = next;
    setActiveAudio(next);
  }, []);

  const stop = useCallback(() => {
    player.pause();
    const id = playbackId(activeAudioRef.current);
    if (id) AudioPlaybackCoordinator.stopPlayback(id);
    setActive(null);
  }, [player, setActive]);

  useEffect(() => {
    if (activeAudio && !status.playing && status.currentTime > 0 && status.duration > 0 && Math.abs(status.currentTime - status.duration) < 0.3) {
      const timer = setTimeout(() => {
        AudioPlaybackCoordinator.stopPlayback(playbackId(activeAudio));
        setActive(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeAudio, status.playing, status.currentTime, status.duration, setActive]);

  const play = useCallback(async (phraseId: string, role: PhraseAudioRole) => {
    if (busy.current || AudioPlaybackCoordinator.isRecording()) return;
    if (activeAudio?.phraseId === phraseId && activeAudio.role === role && status.playing) {
      stop();
      return;
    }
    busy.current = true;
    setErrorNotice(null);
    const key = `${phraseId}:${role}`;
    try {
      player.pause();
      let resolved = await resolveNativePhraseAudio(phraseId, role);
      if (!resolved?.uri || resolved.availability !== 'available') {
        setGeneratingKey(key);
        try {
          resolved = await ensureNativePhraseSpeech(phraseId, role, speechVoice);
        } finally {
          setGeneratingKey(null);
        }
      }
      if (!resolved?.uri || resolved.availability !== 'available') throw new Error('Audio is unavailable.');
      await configureNativeAudioSession(false);
      const id = `phrasebook:${phraseId}:${role}`;
      const allowed = AudioPlaybackCoordinator.startPlayback(id, () => {
        player.pause();
        setActive(null);
      });
      if (!allowed || AppState.currentState !== 'active') return;
      player.replace({ uri: resolved.uri });
      player.play();
      setActive({ phraseId, role });
    } catch (cause) {
      setErrorNotice(cause instanceof Error ? cause.message : 'Could not play phrase audio.');
      setActive(null);
    } finally {
      busy.current = false;
      setGeneratingKey(null);
    }
  }, [activeAudio, player, speechVoice, status.playing, stop, setActive]);

  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', appState => {
      if (appState !== 'active') stop();
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [stop]));

  const clearErrorNotice = useCallback(() => setErrorNotice(null), []);
  return useMemo(() => ({
    activeAudio,
    generatingKey,
    errorNotice,
    clearErrorNotice,
    play,
    stop,
    isPlaying: (phraseId: string, role: PhraseAudioRole) => activeAudio?.phraseId === phraseId && activeAudio.role === role,
    isGenerating: (phraseId: string, role: PhraseAudioRole) => generatingKey === `${phraseId}:${role}`,
  }), [activeAudio, generatingKey, errorNotice, clearErrorNotice, play, stop]);
}
