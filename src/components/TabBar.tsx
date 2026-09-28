import React from 'react';
import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from './Text';
import { BORDER, LEDGE, fonts, useTheme } from '../theme';
import { useApp } from '../state/AppState';

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home: ['home', 'home-outline'],
  Map: ['map', 'map-outline'],
  List: ['checkbox', 'checkbox-outline'],
  Settings: ['settings', 'settings-outline'],
};

/** Floating white tab bar with a raised 3D scan button in the middle. */
export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const { colors, dark } = useTheme();
  const { haptic, state: app } = useApp();
  const insets = useSafeAreaInsets();
  const openItems = app.list.filter((i) => !i.checked).length;

  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: Math.max(insets.bottom, 10) + 4,
        flexDirection: 'row',
        alignItems: 'center',
        height: 66,
        borderRadius: 24,
        borderWidth: BORDER,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 6,
        shadowColor: '#000',
        shadowOpacity: dark ? 0 : 0.08,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            haptic('light');
            navigation.navigate(route.name);
          }
        };

        if (route.name === 'Scan') {
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel="Scan a product"
              style={{ flex: 1, alignItems: 'center' }}
            >
              {({ pressed }) => (
                <View style={{ width: 60, height: 60 + LEDGE, marginTop: -26 }}>
                  <View style={{ position: 'absolute', top: LEDGE, width: 60, height: 60, borderRadius: 20, backgroundColor: colors.primaryLedge }} />
                  <View
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 20,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      transform: [{ translateY: pressed ? LEDGE : 0 }],
                    }}
                  >
                    <Ionicons name="scan" size={28} color="#FFFFFF" />
                  </View>
                </View>
              )}
            </Pressable>
          );
        }

        const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={route.name}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}
          >
            <View>
              <Ionicons name={focused ? on : off} size={22} color={focused ? colors.primary : colors.textMuted} />
              {route.name === 'List' && openItems > 0 && (
                <View
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -10,
                    minWidth: 17,
                    height: 17,
                    borderRadius: 9,
                    paddingHorizontal: 4,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 10, color: '#FFFFFF' }}>{openItems}</Text>
                </View>
              )}
            </View>
            <Text style={{ fontFamily: focused ? fonts.semibold : fonts.medium, fontSize: 11, marginTop: 3, color: focused ? colors.primary : colors.textMuted }}>
              {route.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom padding screens need so content isn't hidden behind the floating bar. */
export const TAB_BAR_SPACE = 110;
