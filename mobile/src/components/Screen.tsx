import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ScreenProps = PropsWithChildren<{ title: string; description: string }>;

export function Screen({ title, description, children }: ScreenProps) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <Text style={styles.brand}>StringPhone</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8F7F2' },
  content: { flexGrow: 1, padding: 24, gap: 20 },
  brand: { color: '#285B48', fontSize: 18, fontWeight: '600' },
  title: { color: '#182A23', fontSize: 32, fontWeight: '700' },
  description: { color: '#48574F', fontSize: 18, lineHeight: 27 },
});
