import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import { palette } from '../theme';

type IconName = ComponentProps<typeof Feather>['name'];

type Props = {
  name: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
  size?: number;
};

export function IconButton({
  name,
  accessibilityLabel,
  onPress,
  disabled = false,
  active = false,
  tone = 'neutral',
  size = 18,
}: Props) {
  const color = tone === 'primary' ? '#09090B' : tone === 'danger' ? '#FDA4AF' : palette.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        active && styles.active,
        tone === 'primary' && styles.primary,
        tone === 'danger' && styles.danger,
        (disabled || pressed) && (disabled ? styles.disabled : styles.pressed),
      ]}
    >
      <Feather name={name} size={size} color={color} strokeWidth={1.8} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceSoft,
  },
  active: { borderColor: 'rgba(255,255,255,0.16)', backgroundColor: palette.surfacePressed },
  primary: { borderColor: 'rgba(52,211,153,0.25)', backgroundColor: palette.emerald },
  danger: { borderColor: 'rgba(244,63,94,0.28)', backgroundColor: 'rgba(244,63,94,0.18)' },
  pressed: { backgroundColor: palette.surfacePressed },
  disabled: { opacity: 0.45 },
});
