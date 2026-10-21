import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { RecordingPresets, configureNativeAudioSession, requestNativeMicrophoneAccess,
  useNativeAudioPlayer, useNativeAudioPlayerStatus, useNativeAudioRecorder, useNativeAudioRecorderState,
  AudioPlaybackCoordinator } from '../adapters/audio';
import { ActionButton } from '../components/ActionButton';
import { IconButton } from '../components/IconButton';
import { palette } from '../theme';
import type { createTextChatController } from './controller';
import { resolveNativeSourceAudio } from './native';

type Chat = ReturnType<typeof createTextChatController>;
type Lease = NonNullable<ReturnType<Chat['beginVoiceCapture']>>;

// One recorder/player for the entire Chat screen, including saved-history replay.
export function VoiceControls({ chat, disabled, messageIds, compact = false }: { chat: Chat; disabled: boolean; messageIds: string[]; compact?: boolean }) {
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState('');
  const [denied, setDenied] = useState(false);
  const lease = useRef<Lease | null>(null);
  const preparing = useRef(false);
  const cancelled = useRef(false);
  const stopping = useRef(false);
  const durationMs = useRef(0);
  const captured = useRef<{ uri: string; duration: number } | null>(null);
  const finishRef = useRef<() => Promise<void>>(async () => {});
  const recorder = useNativeAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, directory: 'document' }, status => {
    if (status.isFinished || status.hasError || status.mediaServicesDidReset) void finishRef.current();
  });
  const recording = useNativeAudioRecorderState(recorder, 100);
  useEffect(() => {
    if (phase === 'recording') durationMs.current = Math.max(durationMs.current, recording.durationMillis);
  }, [phase, recording.durationMillis]);
  const chatRef = useRef(chat);
  const player = useNativeAudioPlayer(null);
  const playerRef = useRef(player);
  useEffect(() => {
    chatRef.current = chat;
    playerRef.current = player;
  });
  const playback = useNativeAudioPlayerStatus(player);
  const playbackBusy = useRef(false);
  const active = useRef(true);

  async function save() {
    if (!captured.current || !lease.current) return;
    setPhase('saving');
    try {
      await lease.current.save(captured.current.uri, captured.current.duration, () => active.current && AppState.currentState === 'active' && !cancelled.current);
      captured.current = null; lease.current = null;
      setPhase('idle'); setNotice('Recording saved. Check the message for translation status.');
    } catch (error) { setPhase('save-failed'); setNotice(`Recording save is unconfirmed. Tap Retry saving recording. Do not close the app. ${error instanceof Error ? error.message : ''}`); }
  }
  async function finish() {
    if (!lease.current || preparing.current || stopping.current || captured.current) return;
    stopping.current = true;
    setPhase('saving');
    try {
      const duration = Math.max(durationMs.current, Math.round(recorder.currentTime * 1000));
      if (recorder.getStatus().canRecord) await recorder.stop();
      const uri = recorder.uri;
      if (!uri || duration <= 0) throw new Error('No usable recording was captured. Try recording again.');
      captured.current = { uri, duration };
      await save();
    } catch (error) {
      lease.current?.cancel(); lease.current = null; setPhase('idle');
      setNotice(error instanceof Error ? error.message : 'Recording stopped without usable audio.');
    } finally {
      stopping.current = false;
      AudioPlaybackCoordinator.setRecording(false);
      await configureNativeAudioSession(false).catch(() => setNotice('Audio session could not be restored. Try again.'));
    }
  }
  useEffect(() => { finishRef.current = finish; });

  async function start() {
    if (lease.current || playbackBusy.current || !active.current || AudioPlaybackCoordinator.isRecording()) return;
    const next = chat.beginVoiceCapture();
    if (!next) return;
    lease.current = next; preparing.current = true; cancelled.current = false;
    durationMs.current = 0;
    AudioPlaybackCoordinator.setRecording(true);
    setPhase('preparing'); setNotice('');
    try {
      player.pause();
      const permission = await requestNativeMicrophoneAccess();
      setDenied(!permission.granted);
      if (!permission.granted) throw new Error('Microphone access is off. Enable it in Settings to record. Text chat is still available.');
      if (cancelled.current || !active.current || AppState.currentState !== 'active') throw new Error('Recording cancelled. Tap Record voice when you return.');
      await configureNativeAudioSession(true);
      await recorder.prepareToRecordAsync();
      if (cancelled.current || !active.current || AppState.currentState !== 'active') throw new Error('Recording cancelled. Tap Record voice when you return.');
      recorder.record({ forDuration: 30 });
      setPhase('recording');
    } catch (error) {
      if (recorder.getStatus().canRecord) await recorder.stop().catch(() => undefined);
      next.cancel(); lease.current = null; setPhase('idle');
      AudioPlaybackCoordinator.setRecording(false);
      setNotice(error instanceof Error ? error.message : 'Could not start recording.');
      await configureNativeAudioSession(false).catch(() => undefined);
    } finally { preparing.current = false; }
  }
  useEffect(() => {
    if (phase === 'recording' && (!recorder.isRecording || recording.durationMillis >= 30000)) void finishRef.current();
  }, [phase, recorder, recording.isRecording, recording.durationMillis]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    cancelled.current = false;
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { AudioPlaybackCoordinator.setRecording(false); cancelled.current = true; chatRef.current.interruptVoiceRequest(); playerRef.current.pause(); void finishRef.current(); }
    });
    return () => {
      active.current = false; cancelled.current = true; chatRef.current.interruptVoiceRequest(); AudioPlaybackCoordinator.setRecording(false); subscription.remove(); playerRef.current.pause(); void finishRef.current();
    };
  }, []));

  async function play(id: string) {
    if (lease.current || playbackBusy.current || AudioPlaybackCoordinator.isRecording()) return;
    playbackBusy.current = true;
    try {
      player.pause();
      const audio = await resolveNativeSourceAudio(id);
      if (!audio?.uri) throw new Error('Saved recording is unavailable.');
      await configureNativeAudioSession(false);
      if (!active.current || AppState.currentState !== 'active') return;
      const allowed = AudioPlaybackCoordinator.startPlayback(id, () => {
        player.pause();
      });
      if (!allowed) return;
      player.replace({ uri: audio.uri }); player.play(); setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not play recording.'); }
    finally { playbackBusy.current = false; }
  }
  if (compact) {
    const isRecording = phase === 'recording';
    const buttonLabel = isRecording
      ? `Stop recording (${Math.floor(recording.durationMillis / 1000)} of 30 seconds)`
      : phase === 'idle' ? 'Record voice note' : 'Preparing or saving recording';
    return <View style={compactStyles.container}>
      <IconButton name={isRecording ? 'square' : 'mic'} accessibilityLabel={buttonLabel} disabled={disabled || (phase !== 'idle' && !isRecording)}
        tone={isRecording ? 'danger' : 'neutral'} onPress={() => { if (isRecording) void finish(); else if (phase === 'idle') void start(); }} />
      {(phase === 'recording' || phase === 'preparing' || phase === 'saving') &&
        <Text accessibilityLiveRegion="polite" style={compactStyles.status}>{phase === 'recording' ? `${Math.max(0, 30 - Math.floor(recording.durationMillis / 1000))}s` : phase === 'preparing' ? 'Preparing' : 'Saving'}</Text>}
      {phase === 'save-failed' && <ActionButton label="Retry save" disabled={disabled} onPress={() => { void save(); }} />}
      {denied && <ActionButton label="Microphone settings" tone="secondary" onPress={() => { void Linking.openSettings().catch(() => setNotice('Open your phone Settings and enable microphone access for StringPhone.')); }} />}
      {!!notice && <Text accessibilityLiveRegion="polite" style={compactStyles.notice}>{notice}</Text>}
    </View>;
  }
  return <View style={{ gap: 8 }}>
    {phase === 'recording' ? <ActionButton label={`Stop recording (${Math.floor(recording.durationMillis / 1000)}/30 seconds)`} onPress={() => { void finish(); }} />
      : phase === 'save-failed' ? <ActionButton label="Retry saving recording" onPress={() => { void save(); }} />
        : <ActionButton label={phase === 'idle' ? 'Record voice' : 'Preparing or saving recording...'} disabled={disabled || phase !== 'idle'} onPress={() => { void start(); }} />}
    {denied && <ActionButton label="Open microphone settings" tone="secondary" onPress={() => { void Linking.openSettings().catch(() => setNotice('Open your phone Settings and enable microphone access for StringPhone.')); }} />}
    {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
    <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
      {messageIds.map((id, index) => <ActionButton key={id} label={`Play saved recording ${index + 1}`} disabled={disabled || phase !== 'idle'} tone="secondary" onPress={() => { void play(id); }} />)}
    </ScrollView>
    {playback.playing && <ActionButton label="Stop playback" tone="secondary" onPress={() => player.pause()} />}
  </View>;
}

const compactStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  status: { color: palette.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  notice: { position: 'absolute', bottom: 48, right: 0, maxWidth: 260, color: palette.textMuted, fontSize: 12 },
});
