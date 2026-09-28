import React, { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import Text, { Logo } from '../components/Text';
import Card from '../components/Card';
import { Chip } from '../components/Badges';
import { Segmented } from '../components/Common';
import { LegalModal, LocationPicker, Sheet } from '../components/Sheets';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { fonts, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { APP_CONFIG } from '../config';
import { LegalDocKey } from '../legal';

const RADII = [2, 5, 10, 25, 50];

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'settings', patch });
  const unit = s.units === 'mi' ? 'mi' : 'km';
  const toUnit = (km: number) => (s.units === 'mi' ? Math.round(km * 0.621371) || 1 : km);

  const deleteAll = () =>
    Alert.alert(
      'Delete all your data?',
      'This erases your list, price book, history, location and settings from this phone. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => dispatch({ type: 'resetAll' }) },
      ],
    );

  const pkg = Constants.expoConfig?.android?.package;
  const rate = () =>
    Linking.openURL(`market://details?id=${pkg}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom + 10, gap: 22 }}
    >
      <Text variant="h1">Settings</Text>

      <Group title="Location">
        <Row icon="location" tone={colors.sky} title={state.location?.label ?? 'Not set'} subtitle={state.location ? (state.location.source === 'gps' ? 'From GPS' : 'Entered manually') : 'Needed for nearby prices & stores'} onPress={() => setLocOpen(true)} />
        <View style={{ padding: 14, gap: 10 }}>
          <Text variant="bodyStrong">Search radius</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {RADII.map((r) => (
              <Chip key={r} label={`${toUnit(r)} ${unit}`} active={s.radiusKm === r} onPress={() => set({ radiusKm: r })} />
            ))}
          </View>
        </View>
      </Group>

      <Group title="Preferences">
        <View style={{ padding: 14, gap: 10 }}>
          <Text variant="bodyStrong">Appearance</Text>
          <Segmented
            value={s.theme}
            onChange={(theme) => set({ theme })}
            options={[
              { value: 'system', label: 'Auto' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </View>
        <Divider />
        <View style={{ padding: 14, gap: 10 }}>
          <Text variant="bodyStrong">Distance units</Text>
          <Segmented
            value={s.units}
            onChange={(units) => set({ units })}
            options={[
              { value: 'km', label: 'Kilometres' },
              { value: 'mi', label: 'Miles' },
            ]}
          />
        </View>
        <Divider />
        <Row
          icon="phone-portrait"
          tone={colors.sunSoft}
          title="Haptic feedback"
          right={<Switch value={s.haptics} onValueChange={(haptics) => set({ haptics })} trackColor={{ true: colors.success }} />}
        />
      </Group>

      <Group title="Your data">
        <Row icon="time" tone={colors.surfaceAlt} title="Clear search history" onPress={() => dispatch({ type: 'clearHistory' })} />
        <Divider />
        <Row icon="trash" tone={colors.primarySoft} title="Delete all my data" subtitle="Everything is stored only on this phone" danger onPress={deleteAll} />
      </Group>

      <Group title="Legal">
        <Row icon="shield-checkmark" tone={colors.successSoft} title="Privacy Policy" onPress={() => setDoc('privacy')} />
        <Divider />
        <Row icon="document-text" tone={colors.skySoft} title="Terms of Service" onPress={() => setDoc('terms')} />
        <Divider />
        <Row icon="library" tone={colors.sunSoft} title="Data sources & licences" onPress={() => setDoc('licenses')} />
      </Group>

      <Group title="Support">
        <Row icon="mail" tone={colors.skySoft} title="Contact support" subtitle={APP_CONFIG.supportEmail} onPress={() => Linking.openURL(`mailto:${APP_CONFIG.supportEmail}?subject=${encodeURIComponent('Frugal feedback')}`)} />
        <Divider />
        <Row icon="star" tone={colors.sunSoft} title="Rate Frugal" onPress={rate} />
      </Group>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Logo size={28} />
        <Text variant="small" muted>
          Version {APP_CONFIG.version} · Not affiliated with any retailer
        </Text>
      </View>

      <LegalModal doc={doc} onClose={() => setDoc(null)} />
      <Sheet visible={locOpen} onClose={() => setLocOpen(false)} title="Your location">
        <LocationPicker onDone={() => setLocOpen(false)} />
      </Sheet>
    </ScrollView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text variant="label" muted style={{ marginLeft: 4 }}>
        {title}
      </Text>
      <Card>{children}</Card>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1.5, backgroundColor: colors.hairline, marginLeft: 62 }} />;
}

function Row({
  icon, tone, title, subtitle, onPress, right, danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: tone, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={danger ? colors.danger : undefined} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="small" muted numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />)}
    </Pressable>
  );
}
