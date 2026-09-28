import React from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Text from './Text';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { Image } from 'expo-image';
import { brandStyle } from '../services/brands';
import { useStoreLogo } from '../services/logos';

/**
 * Store icon: the chain's real logo (Wikidata / Wikimedia Commons) on a white tile.
 * Independent stores, or chains without a logo on record, get a monogram in brand colours.
 */
export function StoreBadge({
  name, wikidata, size = 40, style,
}: {
  name: string;
  wikidata?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const logo = useStoreLogo(name, wikidata);
  const [wide, setWide] = React.useState(false);
  const b = brandStyle(name);
  if (logo) {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size * 0.3,
            backgroundColor: '#FFFFFF',
            borderWidth: BORDER,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            padding: size * (wide ? 0.05 : 0.12), // wordmark logos need every pixel
          },
          style,
        ]}
        accessibilityLabel={`${name} logo`}
      >
        {/* shown until the logo image has downloaded */}
        <Text style={{ position: 'absolute', fontFamily: fonts.display, color: b.bg, fontSize: size * 0.34 }}>{b.mono}</Text>
        <Image
          source={{ uri: logo }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          transition={120}
          cachePolicy="disk"
          onLoad={(e) => setWide(e.source.width / Math.max(1, e.source.height) > 1.8)}
        />
      </View>
    );
  }
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: b.bg, alignItems: 'center', justifyContent: 'center' },
        style,
      ]}
    >
      <Text style={{ fontFamily: fonts.display, color: b.fg, fontSize: size * (b.mono.length > 2 ? 0.3 : 0.4) }}>{b.mono}</Text>
    </View>
  );
}

const GRADE: Record<string, { bg: string; fg: string }> = {
  a: { bg: '#038141', fg: '#FFFFFF' },
  b: { bg: '#85BB2F', fg: '#FFFFFF' },
  c: { bg: '#FECB02', fg: '#161616' },
  d: { bg: '#EE8100', fg: '#FFFFFF' },
  e: { bg: '#E63E11', fg: '#FFFFFF' },
};

/** Plain grade chip (deliberately not a copy of the official Nutri-Score logo, which is a protected mark). */
export function GradeChip({ grade, label = 'Nutri-Score', compact }: { grade: string; label?: string; compact?: boolean }) {
  const { colors } = useTheme();
  const c = GRADE[grade] ?? { bg: colors.surfaceAlt, fg: colors.text };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingLeft: compact ? 3 : 10,
        paddingRight: 3,
        height: 28,
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        alignSelf: 'flex-start',
      }}
      accessibilityLabel={`${label} ${grade.toUpperCase()}`}
    >
      {!compact && (
        <Text variant="small" style={{ fontFamily: fonts.semibold }}>
          {label}
        </Text>
      )}
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, color: c.fg, fontSize: 13 }}>{grade.toUpperCase()}</Text>
      </View>
    </View>
  );
}

export function Chip({
  label, icon, foodIcon, active, onPress, tone, style,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  foodIcon?: keyof typeof MaterialCommunityIcons.glyphMap; // richer food glyphs (bread, cheese…)
  active?: boolean;
  onPress?: () => void;
  tone?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = active ? colors.ink : tone ?? colors.surface;
  const fg = active ? colors.onInk : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: !!active }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          height: 38,
          borderRadius: radius.pill,
          borderWidth: tone || active ? 0 : BORDER,
          borderColor: colors.border,
          backgroundColor: bg,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={15} color={fg} />}
      {foodIcon && <MaterialCommunityIcons name={foodIcon} size={16} color={fg} />}
      <Text variant="small" style={{ color: fg, fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Shelf-label price tag: yellow tag with a punched hole. */
export function PriceTag({ price, caption, big }: { price: string; caption?: string; big?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.sun,
        borderRadius: 10,
        paddingVertical: big ? 7 : 3,
        paddingLeft: big ? 24 : 18,
        paddingRight: big ? 14 : 10,
        transform: [{ rotate: '-2deg' }],
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: big ? 9 : 7,
          top: '50%',
          marginTop: -3.5,
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: colors.bg,
        }}
      />
      <Text style={{ fontFamily: fonts.display, color: '#161616', fontSize: big ? 26 : 16 }}>{price}</Text>
      {caption && (
        <Text style={{ fontFamily: fonts.semibold, color: '#161616', fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: -2 }}>
          {caption}
        </Text>
      )}
    </View>
  );
}

/** Small uppercase pill label, e.g. "CHEAPEST NEARBY". */
export function Sticker({ label, bg, fg = '#FFFFFF' }: { label: string; bg: string; fg?: string; rotate?: number }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: fonts.semibold, color: fg, fontSize: 10, letterSpacing: 1.2 }}>{label}</Text>
    </View>
  );
}
