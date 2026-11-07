import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, Slot, usePathname } from 'expo-router';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getActiveTtsVoice, setNativeTtsVoice, subscribeTtsVoice } from '../chat/native';
import { palette } from '../theme';

const MODES = [
  { route: '/', label: 'Chat', icon: 'message-square' },
  { route: '/single', label: 'Single', icon: 'user' },
  { route: '/conversation', label: 'Conversation', icon: 'users' },
  { route: '/phrasebook', label: 'Phrasebook', icon: 'bookmark' },
] as const;

const VOICE_OPTIONS = [
  { id: 'marin' as const, label: 'Female' },
  { id: 'onyx' as const, label: 'Male' },
];

export function AppShell() {
  const pathname = usePathname();
  const activeRoute = pathname === '/' ? '/' : `/${pathname.split('/')[1]}`;
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<'marin' | 'onyx'>(getActiveTtsVoice);

  useEffect(() => subscribeTtsVoice(setTtsVoice), []);

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return home"
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
          <View accessibilityRole="tablist" accessibilityLabel="StringPhone modes" style={styles.modeSwitcher}>
            {MODES.map(({ route, label, icon }) => {
              const selected = activeRoute === route;
              return (
                <Pressable
                  key={route}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (!selected) router.replace(route);
                  }}
                  style={[styles.modeButton, selected && styles.modeButtonSelected]}
                >
                  <Feather name={icon} size={17} color={selected ? palette.text : palette.textSubtle} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="AI TTS voice settings"
            onPress={() => setVoiceMenuOpen(true)}
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
            <Text style={styles.menuHeading}>AI TTS voice</Text>
            <View style={styles.voiceGrid}>
              {VOICE_OPTIONS.map(option => {
                const selected = ttsVoice === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${option.label} AI TTS voice`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      void setNativeTtsVoice(option.id);
                      setVoiceMenuOpen(false);
                    }}
                    style={[styles.voiceOption, selected && styles.voiceOptionSelected]}
                  >
                    <Text style={[styles.voiceOptionText, selected && styles.voiceOptionTextSelected]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
    padding: 4,
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
    width: 39,
    height: 39,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
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
    minWidth: 208,
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
});
