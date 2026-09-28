import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleProp, TextInput, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Text from './Text';
import Button3D from './Button3D';
import { BORDER, fonts, radius, useTheme } from '../theme';

export function SearchBar({
  value, onChangeText, onSubmit, placeholder = 'Search milk, eggs, coffee…', autoFocus, onFocus, editable = true,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  editable?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 56,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceAlt,
        paddingLeft: 16,
        paddingRight: 6,
        gap: 10,
      }}
    >
        <Ionicons name="search" size={20} color={colors.text} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoFocus={autoFocus}
          autoCorrect={false}
          style={{ flex: 1, minWidth: 0, fontFamily: fonts.medium, fontSize: 16, color: colors.text, height: '100%' }}
          accessibilityLabel="Search products"
        />
        {value.length > 0 && (
          <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={20} color={colors.textMuted} />
          </Pressable>
        )}
        <Button3D icon="arrow-forward" size="sm" onPress={onSubmit} accessibilityLabel="Search" />
    </View>
  );
}

export function EmptyState({
  icon, title, message, action, onAction, tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  action?: string;
  onAction?: () => void;
  tone?: string;
}) {
  const { colors } = useTheme();
  tone = tone ?? colors.primarySoft;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 28,
          backgroundColor: tone,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 6,
        }}
      >
        <Ionicons name={icon} size={38} color={colors.text} />
      </View>
      <Text variant="h2" center>
        {title}
      </Text>
      {message && (
        <Text muted center style={{ maxWidth: 300 }}>
          {message}
        </Text>
      )}
      {action && onAction && <Button3D title={action} onPress={onAction} style={{ marginTop: 8 }} />}
    </View>
  );
}

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ backgroundColor: colors.surfaceAlt, borderRadius: 10, opacity: pulse }, style]} />;
}

export function ProductImage({ uri, size = 64, style }: { uri?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 14,
          backgroundColor: '#FFFFFF',
          borderWidth: BORDER,
          borderColor: colors.border,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: '88%', height: '88%' }} contentFit="contain" transition={150} />
      ) : (
        <Ionicons name="basket-outline" size={size * 0.45} color="#8A847A" />
      )}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text variant="h2">{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.primary }}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function Segmented<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: radius.pill,
        backgroundColor: colors.surfaceAlt,
        padding: 4,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              height: 34,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.surface : 'transparent',
              ...(active ? { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null),
            }}
          >
            <Text variant="small" style={{ fontFamily: fonts.bold, color: active ? colors.text : colors.textMuted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function IconButton({
  icon, onPress, label, color, bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
  color?: string;
  bg?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: bg ?? colors.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Ionicons name={icon} size={20} color={color ?? colors.text} />
    </Pressable>
  );
}
