import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleProp, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LEDGE, Tone, fonts, radius, toneColors, useTheme } from '../theme';
import { useApp } from '../state/AppState';

type Props = {
  title?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const SIZES = {
  sm: { h: 38, px: 16, font: 13, icon: 16 },
  md: { h: 50, px: 20, font: 15, icon: 19 },
  lg: { h: 58, px: 24, font: 17, icon: 21 },
};

/**
 * Minimal 3D button: flat colour face on a slightly darker bottom edge.
 * Pressing pushes the face down onto the edge, like a real key.
 */
export default function Button3D({
  title, icon, iconRight, tone = 'primary', size = 'md', onPress, disabled, loading, style, accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const { haptic } = useApp();
  const press = useRef(new Animated.Value(0)).current;
  const s = SIZES[size];
  const t = toneColors(colors, tone);
  const iconOnly = !title;

  const animate = (to: number) =>
    Animated.spring(press, { toValue: to, useNativeDriver: true, speed: 60, bounciness: to ? 0 : 6 }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      onPressIn={() => {
        haptic('light');
        animate(1);
      }}
      onPressOut={() => animate(0)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[{ height: s.h + LEDGE, opacity: disabled ? 0.45 : 1 }, iconOnly && { width: s.h }, style]}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: LEDGE, height: s.h, borderRadius: radius.md, backgroundColor: t.ledge }} />
      <Animated.View
        style={{
          height: s.h,
          paddingHorizontal: iconOnly ? 0 : s.px,
          borderRadius: radius.md,
          backgroundColor: t.face,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          transform: [{ translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, LEDGE] }) }],
        }}
      >
        {loading ? (
          <ActivityIndicator color={t.text} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={s.icon} color={t.text} />}
            {title && (
              <Text
                numberOfLines={1}
                style={{ color: t.text, fontFamily: fonts.display, fontSize: s.font, letterSpacing: 0.8, textTransform: 'uppercase' }}
              >
                {title}
              </Text>
            )}
            {iconRight && <Ionicons name={iconRight} size={s.icon} color={t.text} />}
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}
