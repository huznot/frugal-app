import React, { useRef } from 'react';
import { Animated, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { BORDER, radius, softShadow, useTheme } from '../theme';
import { useApp } from '../state/AppState';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  bg?: string;
  style?: StyleProp<ViewStyle>; // outer (layout: margins, width, flex)
  contentStyle?: StyleProp<ViewStyle>; // inner (padding, flexDirection)
  flat?: boolean; // tinted cards skip the border + shadow
  accessibilityLabel?: string;
};

/** Minimal card: white surface, hairline border, soft shadow. Pressable cards scale down slightly. */
export default function Card({ children, onPress, onLongPress, bg, style, contentStyle, flat, accessibilityLabel }: Props) {
  const { colors, dark } = useTheme();
  const { haptic } = useApp();
  const press = useRef(new Animated.Value(0)).current;
  const animate = (to: number) => Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  const tinted = flat || (bg && bg !== colors.surface);

  const body = (
    <Animated.View
      style={[
        {
          backgroundColor: bg ?? colors.surface,
          borderRadius: radius.lg,
          borderWidth: tinted ? 0 : BORDER,
          borderColor: colors.border,
          overflow: 'hidden',
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
        },
        !tinted && !dark && softShadow,
        contentStyle,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (!onPress && !onLongPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        haptic('light');
        animate(1);
      }}
      onPressOut={() => animate(0)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </Pressable>
  );
}
