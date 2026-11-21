import { useEffect, useState } from 'react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, Slot, usePathname } from 'expo-router';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { interpolateTemplate } from '../../../shared/uiStrings';
import {
  clearActiveConversationVoiceClones,
  getActiveConversationVoiceCloneStatus,
  getActiveMyLanguage,
  getActiveTtsVoice,
  getActiveTtsVoiceMode,
  getNativeTextChat,
  setNativeTtsVoice,
  setNativeTtsVoiceMode,
  subscribeMyLanguage,
  subscribeTtsVoice,
  subscribeTtsVoiceMode,
} from '../chat/native';
import { compactLabelStyle } from '../chat/presentation';
import { useUiStrings } from '../chat/useUiStrings';
import type { TtsVoiceMode } from '../storage/history';
import { palette } from '../theme';

const MODES = [
  { route: '/', labelKey: 'modeChat', icon: 'message-square' },
  { route: '/single', labelKey: 'modeSingle', icon: 'user' },
  { route: '/conversation', labelKey: 'modeConversation', icon: 'users' },
  { route: '/live', labelKey: 'modeLive', icon: 'ear-outline' },
  { route: '/phrasebook', labelKey: 'modePhrasebook', icon: 'bookmark' },
] as const;

const VOICE_OPTIONS = [
  { id: 'marin' as const, labelKey: 'female' as const },
  { id: 'onyx' as const, labelKey: 'male' as const },
];

const VOICE_MODE_OPTIONS: readonly { id: TtsVoiceMode; labelKey: 'aiTtsVoice' | 'voiceClone' }[] = [
  { id: 'ai_tts', labelKey: 'aiTtsVoice' },
  { id: 'voice_clone', labelKey: 'voiceClone' },
];

export function AppShell() {
  const pathname = usePathname();
  const activeRoute = pathname === '/' ? '/' : `/${pathname.split('/')[1]}`;
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [myLanguage, setMyLanguage] = useState(getActiveMyLanguage);
  const [ttsVoice, setTtsVoice] = useState<'marin' | 'onyx'>(getActiveTtsVoice);
  const [ttsVoiceMode, setTtsVoiceMode] = useState<TtsVoiceMode>(getActiveTtsVoiceMode);
  const [cloneStatus, setCloneStatus] = useState<{ conversationId: string | null; count: number }>({
    conversationId: null,
    count: 0,
  });
  const [clearingClones, setClearingClones] = useState(false);
  const [justClearedClones, setJustClearedClones] = useState(false);

  const strings = useUiStrings(myLanguage);

  useEffect(() => subscribeMyLanguage(setMyLanguage), []);
  useEffect(() => subscribeTtsVoice(setTtsVoice), []);
  useEffect(() => subscribeTtsVoiceMode(setTtsVoiceMode), []);
  useEffect(() => {
    void getNativeTextChat().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!voiceMenuOpen) return;
    let active = true;
    void getActiveConversationVoiceCloneStatus()
      .then(status => {
        if (active) setCloneStatus(status);
      })
      .catch(() => {
        if (active) setCloneStatus({ conversationId: null, count: 0 });
      });
    return () => {
      active = false;
    };
  }, [voiceMenuOpen]);

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.returnHome}
            onPress={() => {
              if (activeRoute !== '/') router.replace('/');
            }}
            style={styles.brandBadge}
          >
            <Image
              source={require('../../assets/stringphone-logo.png')}
              resizeMode="contain"
              style={styles.brandMark}
            />
          </Pressable>
          <View accessibilityRole="tablist" accessibilityLabel={strings.stringPhoneModes} style={styles.modeSwitcher}>
            {MODES.map(({ route, labelKey, icon }) => {
              const selected = activeRoute === route;
              const iconColor = selected ? palette.text : palette.textSubtle;
              return (
                <Pressable
                  key={route}
                  accessibilityRole="tab"
                  accessibilityLabel={strings[labelKey]}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!selected) router.replace(route);
                  }}
                  style={[styles.modeButton, selected && styles.modeButtonSelected]}
                >
                  {icon === 'ear-outline' ? (
                    <Ionicons name={icon} size={17} color={iconColor} />
                  ) : (
                    <Feather name={icon} size={17} color={iconColor} strokeWidth={2} />
                  )}
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.voiceSettings}
            onPress={() => {
              setJustClearedClones(false);
              setVoiceMenuOpen(true);
            }}
            style={styles.voiceMenuTrigger}
          >
            <Feather name="settings" size={16} color={palette.textMuted} strokeWidth={1.8} />
          </Pressable>
        </View>
        <View style={styles.route}>
          <Slot />
        </View>
      </SafeAreaView>

      <Modal
        visible={voiceMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVoiceMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setVoiceMenuOpen(false)}>
          <Pressable style={styles.menuPopover} onPress={event => event.stopPropagation()}>
            <Text style={[styles.menuHeading, compactLabelStyle(myLanguage)]}>{strings.speechVoice}</Text>
            <View style={styles.voiceGrid}>
              {VOICE_MODE_OPTIONS.map(option => {
                const selected = ttsVoiceMode === option.id;
                const label = strings[option.labelKey];
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setJustClearedClones(false);
                      void setNativeTtsVoiceMode(option.id);
                    }}
                    style={[styles.voiceOption, selected && styles.voiceOptionSelected]}
                  >
                    <Text style={[styles.voiceOptionText, selected && styles.voiceOptionTextSelected]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {ttsVoiceMode === 'ai_tts' ? (
              <View style={[styles.voiceGrid, styles.subGrid]}>
                {VOICE_OPTIONS.map(option => {
                  const selected = ttsVoice === option.id;
                  const label = strings[option.labelKey];
                  return (
                    <Pressable
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} ${strings.aiTtsVoice}`}
                      accessibilityState={{ selected }}
                      onPress={() => {
                        void setNativeTtsVoice(option.id);
                        setVoiceMenuOpen(false);
                      }}
                      style={[styles.voiceOption, selected && styles.voiceOptionSelected]}
                    >
                      <Text style={[styles.voiceOptionText, selected && styles.voiceOptionTextSelected]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={styles.clonePanel}>
                <Text style={styles.cloneStatusText}>
                  {justClearedClones
                    ? strings.clonedVoicesCleared
                    : !cloneStatus.conversationId
                      ? strings.openChatForClones
                      : cloneStatus.count > 0
                        ? cloneStatus.count === 1
                          ? strings.clonedVoiceCountOne
                          : interpolateTemplate(strings.clonedVoiceCountMany, { count: cloneStatus.count })
                        : strings.noClonedVoices}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.clearClonedVoices}
                  accessibilityState={{ disabled: clearingClones || !cloneStatus.conversationId || cloneStatus.count === 0 }}
                  disabled={clearingClones || !cloneStatus.conversationId || cloneStatus.count === 0}
                  onPress={async () => {
                    if (clearingClones || !cloneStatus.conversationId || cloneStatus.count === 0) return;
                    setClearingClones(true);
                    try {
                      await clearActiveConversationVoiceClones();
                      setCloneStatus(prev => ({ ...prev, count: 0 }));
                      setJustClearedClones(true);
                    } finally {
                      setClearingClones(false);
                    }
                  }}
                  style={[
                    styles.clearCloneButton,
                    (clearingClones || !cloneStatus.conversationId || cloneStatus.count === 0) && styles.clearCloneButtonDisabled,
                  ]}
                >
                  <Feather name="rotate-ccw" size={12} color={palette.text} />
                  <Text style={styles.clearCloneButtonText}>
                    {clearingClones ? strings.clearing : strings.clearClonedVoices}
                  </Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  header: {
    height: 60,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandBadge: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  brandMark: { width: 32, height: 32, tintColor: '#F4F4F5' },
  modeSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  modeButton: {
    width: 34,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  modeButtonSelected: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  voiceMenuTrigger: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  route: { flex: 1, minHeight: 0 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'flex-end',
    paddingTop: 64,
    paddingRight: 16,
  },
  menuPopover: {
    minWidth: 236,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(9,9,11,0.96)',
    padding: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  menuHeading: {
    color: palette.textSubtle,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  voiceGrid: {
    flexDirection: 'row',
    gap: 4,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 4,
  },
  subGrid: {
    marginTop: 8,
  },
  voiceOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  voiceOptionSelected: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  voiceOptionText: {
    color: palette.textSubtle,
    fontSize: 12,
    fontWeight: '600',
  },
  voiceOptionTextSelected: {
    color: '#FFFFFF',
  },
  clonePanel: {
    marginTop: 8,
    gap: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 8,
  },
  cloneStatusText: {
    color: palette.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  clearCloneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  clearCloneButtonDisabled: {
    opacity: 0.45,
  },
  clearCloneButtonText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
