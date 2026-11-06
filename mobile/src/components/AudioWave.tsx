import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

const BARS = [
  { height: 14, duration: 450 },
  { height: 26, duration: 520 },
  { height: 17, duration: 380 },
  { height: 34, duration: 600 },
  { height: 22, duration: 480 },
  { height: 28, duration: 540 },
  { height: 16, duration: 420 },
] as const;

export function AudioWave({
  active,
  color = '#FB7185',
  style,
}: {
  active: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [anims] = useState(() => BARS.map(() => new Animated.Value(0.35)));

  useEffect(() => {
    if (!active) {
      for (const anim of anims) {
        anim.stopAnimation();
        anim.setValue(0.2);
      }
      return;
    }

    const loops = anims.map((anim, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 65),
          Animated.timing(anim, {
            toValue: 1,
            duration: BARS[index].duration,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.35,
            duration: BARS[index].duration,
            useNativeDriver: true,
          }),
        ]),
      ),
    );

    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [active, anims]);

  if (!active) return null;

  return (
    <View style={[styles.container, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BARS.map((bar, index) => (
        <Animated.View
          key={bar.height}
          style={[
            styles.bar,
            {
              height: bar.height,
              backgroundColor: color,
              opacity: anims[index],
              transform: [{ scaleY: anims[index] }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  bar: {
    width: 5,
    borderRadius: 999,
  },
});
