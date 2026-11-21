import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  AudioPlaybackCoordinator,
  useNativeAudioPlayer,
  useNativeAudioPlayerStatus,
} from '../adapters/audio';
import { ensureTranslatedSpeech, resolveNativeTranslatedAudio } from '../chat/native';
import {
  createNativeLivePlaybackQueue,
  type LiveQueueItem,
  type LiveQueueState,
} from './livePlaybackQueue';

export { createNativeLivePlaybackQueue, type LiveQueueItem, type LiveQueueState };

function safePausePlayer(player: { pause: () => void }) {
  try {
    player.pause();
  } catch {
    // Player may already be released on unmount
  }
}

export function useNativeLiveAudioQueue(speechVoice?: 'marin' | 'onyx') {
  const player = useNativeAudioPlayer(null);
  const playback = useNativeAudioPlayerStatus(player);
  const [queueState, setQueueState] = useState<LiveQueueState>({
    autoPlayEnabled: true,
    activePlayingMessageId: null,
    isPlaying: false,
    queueLength: 0,
  });

  const speechVoiceRef = useRef(speechVoice);
  const completionResolverRef = useRef<(() => void) | null>(null);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    speechVoiceRef.current = speechVoice;
  }, [speechVoice]);

  const finishCurrentPlayWait = useCallback(() => {
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    const resolver = completionResolverRef.current;
    completionResolverRef.current = null;
    resolver?.();
  }, []);

  useEffect(() => {
    if (
      queueState.isPlaying &&
      !playback.playing &&
      playback.currentTime > 0 &&
      playback.duration > 0 &&
      Math.abs(playback.currentTime - playback.duration) < 0.3
    ) {
      const timer = setTimeout(() => {
        AudioPlaybackCoordinator.stopPlayback();
        finishCurrentPlayWait();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [
    queueState.isPlaying,
    playback.playing,
    playback.currentTime,
    playback.duration,
    finishCurrentPlayWait,
  ]);

  const stopPlayerAndRelease = useCallback(() => {
    safePausePlayer(player);
    AudioPlaybackCoordinator.stopPlayback();
    finishCurrentPlayWait();
  }, [finishCurrentPlayWait, player]);

  const controllerRef = useRef<ReturnType<typeof createNativeLivePlaybackQueue> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createNativeLivePlaybackQueue({
      initialAutoPlay: true,
      prefetchAudio: async item => {
        const existing = await resolveNativeTranslatedAudio(item.messageId);
        if (existing?.uri && existing.availability === 'available') {
          return existing.uri;
        }
        const generated = await ensureTranslatedSpeech(item.messageId, speechVoiceRef.current);
        return generated?.uri && generated.availability === 'available' ? generated.uri : null;
      },
      playItem: async (item, prefetchedUri) => {
        let uri = prefetchedUri;
        if (!uri) {
          const fallback = await ensureTranslatedSpeech(item.messageId, speechVoiceRef.current);
          uri = fallback?.uri && fallback.availability === 'available' ? fallback.uri : null;
        }
        if (!uri || AppState.currentState !== 'active') return;

        await new Promise<void>(resolve => {
          completionResolverRef.current = resolve;
          const allowed = AudioPlaybackCoordinator.startLivePlayback(
            `live_queue:${item.messageId}`,
            () => {
              safePausePlayer(player);
              finishCurrentPlayWait();
            },
          );
          if (!allowed || AppState.currentState !== 'active') {
            finishCurrentPlayWait();
            return;
          }

          completionTimeoutRef.current = setTimeout(() => {
            safePausePlayer(player);
            AudioPlaybackCoordinator.stopPlayback(`live_queue:${item.messageId}`);
            finishCurrentPlayWait();
          }, 45_000);

          player.replace({ uri });
          player.play();
        });
      },
      stopPlayback: stopPlayerAndRelease,
      onStateChange: next => {
        setQueueState(next);
      },
    });
  }

  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener('change', state => {
        if (state !== 'active') {
          controllerRef.current?.pauseAll();
        }
      });
      return () => {
        subscription.remove();
        controllerRef.current?.pauseAll();
      };
    }, []),
  );

  const enqueue = useCallback((item: LiveQueueItem) => {
    return controllerRef.current!.enqueue(item);
  }, []);

  const toggleAutoPlay = useCallback(() => {
    return controllerRef.current!.toggleAutoPlay();
  }, []);

  const pauseAll = useCallback(() => {
    controllerRef.current!.pauseAll();
  }, []);

  return useMemo(
    () => ({
      autoPlayEnabled: queueState.autoPlayEnabled,
      activePlayingMessageId: queueState.activePlayingMessageId,
      isPlaying: queueState.isPlaying,
      queueLength: queueState.queueLength,
      enqueue,
      toggleAutoPlay,
      pauseAll,
      yieldToManualPlayback: pauseAll,
    }),
    [
      queueState.autoPlayEnabled,
      queueState.activePlayingMessageId,
      queueState.isPlaying,
      queueState.queueLength,
      enqueue,
      toggleAutoPlay,
      pauseAll,
    ],
  );
}
