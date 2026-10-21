import { Pressable, StyleSheet, Text } from 'react-native';
import { palette } from '../theme';

type Props = { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger'; hint?: string; selected?: boolean };
export function ActionButton({ label, accessibilityLabel, onPress, disabled = false, tone = 'primary', hint, selected }: Props) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint}
    accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, tone === 'secondary' && styles.secondary, tone === 'danger' && styles.danger,
      tone === 'primary' && styles.primary, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.label, tone === 'primary' && styles.primaryLabel, tone === 'secondary' && styles.secondaryLabel,
      tone === 'danger' && styles.dangerLabel]}>{label}</Text>
  </Pressable>;
}
const styles = StyleSheet.create({
  button: { minHeight: 42, justifyContent: 'center', alignItems: 'center', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 15,
    borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceSoft },
  primary: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: palette.emerald },
  secondary: { backgroundColor: palette.surfaceSoft },
  danger: { borderColor: 'rgba(244,63,94,0.3)', backgroundColor: 'rgba(244,63,94,0.18)' },
  pressed: { backgroundColor: palette.surfacePressed },
  disabled: { opacity: 0.45 },
  label: { color: palette.textMuted, fontSize: 14, fontWeight: '600' },
  primaryLabel: { color: palette.background, fontWeight: '700' },
  secondaryLabel: { color: palette.textMuted },
  dangerLabel: { color: '#FDA4AF' },
});
