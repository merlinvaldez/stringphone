import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { router, Slot, usePathname } from 'expo-router';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette } from '../theme';

const MODES = [
  { route: '/', label: 'Chat', icon: 'message-square' },
  { route: '/single', label: 'Single', icon: 'user' },
  { route: '/conversation', label: 'Conversation', icon: 'users' },
  { route: '/phrasebook', label: 'Phrasebook', icon: 'bookmark' },
] as const;

export function AppShell() {
  const pathname = usePathname();
  const activeRoute = pathname === '/' ? '/' : `/${pathname.split('/')[1]}`;

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View accessibilityRole="image" accessibilityLabel="StringPhone" style={styles.brandBadge}>
            <Image
              source={require('../../assets/stringphone-logo.png')}
              resizeMode="contain"
              style={styles.brandMark}
            />
          </View>
          <View accessibilityRole="tablist" accessibilityLabel="StringPhone modes" style={styles.modeSwitcher}>
            {MODES.map(({ route, label, icon }) => {
              const selected = activeRoute === route;
              return (
                <Pressable
                  key={route}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected }}
                  onPress={() => { if (!selected) router.replace(route); }}
                  style={[styles.modeButton, selected && styles.modeButtonSelected]}
                >
                  <Feather name={icon} size={17} color={selected ? palette.text : palette.textSubtle} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
          <View style={styles.trailingSpace} />
        </View>
        <View style={styles.route}>
          <Slot />
        </View>
      </SafeAreaView>
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
  trailingSpace: { width: 40 },
  route: { flex: 1, minHeight: 0 },
});
