import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  AudioPlaybackCoordinator,
  configureNativeAudioSession,
  useNativeAudioPlayer,
  useNativeAudioPlayerStatus,
} from '../adapters/audio';
import {
  ensureTranslatedSpeech,
  resolveNativeSourceAudio,
  resolveNativeTranslatedAudio,
} from './native';

export type ActivePlayback = {
  messageId: string;
  role: 'source' | 'translated';
} | null;

export function useAudioPlayback(speechVoice?: 'marin' | 'onyx') {
  const player = useNativeAudioPlayer(null);
  const playback = useNativeAudioPlayerStatus(player);
  const [activeAudio, setActiveAudio] = useState<ActivePlayback>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const busy = useRef(false);

  // When player naturally finishes, clear active state
  useEffect(() => {
    if (activeAudio && !playback.playing && playback.currentTime > 0 && playback.duration > 0 && Math.abs(playback.currentTime - playback.duration) < 0.3) {
      const timer = setTimeout(() => {
        setActiveAudio(null);
        AudioPlaybackCoordinator.stopPlayback();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeAudio, playback.playing, playback.currentTime, playback.duration]);

  const stop = useCallback(() => {
    player.pause();
    setActiveAudio(null);
    AudioPlaybackCoordinator.stopPlayback();
  }, [player]);

  const playSource = useCallback(async (messageId: string) => {
    if (busy.current || AudioPlaybackCoordinator.isRecording()) return;
    if (activeAudio?.messageId === messageId && activeAudio.role === 'source' && playback.playing) {
      stop();
      return;
    }
    busy.current = true;
    setErrorNotice(null);
    try {
      player.pause();
      const resolved = await resolveNativeSourceAudio(messageId);
      if (!resolved?.uri || resolved.availability !== 'available') {
        throw new Error('Original recording is unavailable.');
      }
      await configureNativeAudioSession(false);
      const allowed = AudioPlaybackCoordinator.startPlayback(`${messageId}:source`, () => {
        player.pause();
        setActiveAudio(null);
      });
      if (!allowed || AppState.currentState !== 'active') return;
      player.replace({ uri: resolved.uri });
      player.play();
      setActiveAudio({ messageId, role: 'source' });
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : 'Could not play original recording.');
      setActiveAudio(null);
    } finally {
      busy.current = false;
    }
  }, [activeAudio, playback.playing, player, stop]);

  const playTranslated = useCallback(async (messageId: string) => {
    if (busy.current || AudioPlaybackCoordinator.isRecording()) return;
    if (activeAudio?.messageId === messageId && activeAudio.role === 'translated' && playback.playing) {
      stop();
      return;
    }
    busy.current = true;
    setErrorNotice(null);
    try {
      player.pause();
      // First try resolving existing translated audio
      let resolved = await resolveNativeTranslatedAudio(messageId);
      if (!resolved?.uri || resolved.availability !== 'available') {
        // Generate on demand
        setGeneratingId(messageId);
        try {
          resolved = await ensureTranslatedSpeech(messageId, speechVoice);
        } finally {
          setGeneratingId(null);
        }
      }
      if (!resolved?.uri || resolved.availability !== 'available') {
        throw new Error('Translated speech is unavailable.');
      }
      await configureNativeAudioSession(false);
      const allowed = AudioPlaybackCoordinator.startPlayback(`${messageId}:translated`, () => {
        player.pause();
        setActiveAudio(null);
      });
      if (!allowed || AppState.currentState !== 'active') return;
      player.replace({ uri: resolved.uri });
      player.play();
      setActiveAudio({ messageId, role: 'translated' });
    } catch (error) {
      setErrorNotice(error instanceof Error ? error.message : 'Could not play translated speech.');
      setActiveAudio(null);
    } finally {
      busy.current = false;
      setGeneratingId(null);
    }
  }, [activeAudio, playback.playing, player, speechVoice, stop]);

  useFocusEffect(useCallback(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        stop();
      }
    });
    return () => {
      subscription.remove();
      stop();
    };
  }, [stop]));

  const clearErrorNotice = useCallback(() => setErrorNotice(null), []);

  return useMemo(
    () => ({
      player,
      playback,
      activeAudio,
      generatingId,
      errorNotice,
      clearErrorNotice,
      playSource,
      playTranslated,
      stop,
    }),
    [player, playback, activeAudio, generatingId, errorNotice, clearErrorNotice, playSource, playTranslated, stop],
  );
}
