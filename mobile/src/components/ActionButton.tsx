import { Pressable, StyleSheet, Text } from 'react-native';

type Props = { label: string; onPress: () => void; disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger'; hint?: string; selected?: boolean };
export function ActionButton({ label, onPress, disabled = false, tone = 'primary', hint, selected }: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={[styles.button, tone === 'secondary' && styles.secondary, tone === 'danger' && styles.danger, disabled && styles.disabled]}>
    <Text style={[styles.label, tone === 'secondary' && styles.secondaryLabel]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#285B48', paddingVertical: 12, paddingHorizontal: 16 },
  secondary: { backgroundColor: '#E7EDE9' }, danger: { backgroundColor: '#9B2727' },
  disabled: { opacity: 0.5 }, label: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryLabel: { color: '#182A23' },
});
