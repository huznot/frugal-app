import React from 'react';
import { Image, Text as RNText, TextProps, TextStyle, View } from 'react-native';
import { fonts, useTheme } from '../theme';

type Variant = 'hero' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'label' | 'eyebrow' | 'price';

const VARIANTS: Record<Variant, TextStyle> = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27 },
  h3: { fontFamily: fonts.displayBold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, letterSpacing: 1.2, textTransform: 'uppercase' },
  eyebrow: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 2.2, textTransform: 'uppercase' },
  price: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26 },
};

type Props = TextProps & { variant?: Variant; muted?: boolean; color?: string; center?: boolean };

export default function Text({ variant = 'body', muted, color, center, style, ...rest }: Props) {
  const { colors } = useTheme();
  const defaultColor = variant === 'eyebrow' ? colors.primary : muted ? colors.textMuted : colors.text;
  return <RNText {...rest} style={[VARIANTS[variant], { color: color ?? defaultColor }, center && { textAlign: 'center' }, style]} />;
}

/** A word in brand red with a soft highlighter stroke behind its lower half. */
export function Highlight({ children, variant = 'hero' }: { children: string; variant?: Variant }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <View
        style={{
          position: 'absolute',
          left: -2,
          right: -4,
          bottom: '8%',
          height: '32%',
          borderRadius: 6,
          backgroundColor: colors.primarySoft,
        }}
      />
      <Text variant={variant} color={colors.primary}>
        {children}
      </Text>
    </View>
  );
}

/** The app's own logo (assets/icon.png) — keep branding consistent with the store listing. */
export function Logo({ size = 32, withName = true }: { size?: number; withName?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image
        source={require('../../assets/icon.png')}
        style={{ width: size * 1.25, height: size * 1.25, margin: -size * 0.1 }}
        accessibilityIgnoresInvertColors
        accessibilityLabel="Frugal logo"
      />
      {withName && <RNText style={{ fontFamily: fonts.display, fontSize: size * 0.72, color: colors.text }}>Frugal</RNText>}
    </View>
  );
}
