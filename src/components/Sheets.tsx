import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from './Text';
import Button3D from './Button3D';
import { IconButton } from './Common';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { getLegalDoc, LegalDocKey } from '../legal';
import { APP_CONFIG } from '../config';
import { useApp } from '../state/AppState';
import { geocodePlace, getGpsLocation } from '../services/location';

export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={{
            backgroundColor: colors.bg,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderWidth: BORDER,
            borderColor: colors.border,
            borderBottomWidth: 0,
            paddingHorizontal: 20,
            paddingTop: 10,
            paddingBottom: insets.bottom + 20,
            maxHeight: '88%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text variant="h2" style={{ flex: 1 }}>
              {title}
            </Text>
            <IconButton icon="close" label="Close" onPress={onClose} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Full-screen reader for Privacy Policy / Terms / Licences. */
export function LegalModal({ doc, onClose }: { doc: LegalDocKey | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!doc) return null;
  const d = getLegalDoc(doc);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderBottomWidth: BORDER,
            borderColor: colors.border,
            gap: 12,
          }}
        >
          <Text variant="h2" style={{ flex: 1 }}>
            {d.title}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
          {doc !== 'licenses' && (
            <Text variant="label" muted style={{ marginBottom: 12 }}>
              Effective {APP_CONFIG.effectiveDate}
            </Text>
          )}
          <Text style={{ marginBottom: 18 }}>{d.intro}</Text>
          {d.sections.map((s) => (
            <View key={s.heading} style={{ marginBottom: 20 }}>
              <Text variant="h3" style={{ marginBottom: 6 }}>
                {s.heading}
              </Text>
              {s.body?.map((p, i) => (
                <Text key={i} muted style={{ marginBottom: 6 }}>
                  {p}
                </Text>
              ))}
              {s.bullets?.map((b, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: 6, paddingRight: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 }} />
                  <Text muted style={{ flex: 1 }}>
                    {b}
                  </Text>
                </View>
              ))}
              {s.after?.map((p, i) => (
                <Text key={i} muted style={{ marginTop: 4 }}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** GPS or typed city/postal code. Used by onboarding, Settings, Map and Product screens. */
export function LocationPicker({ onDone }: { onDone?: () => void }) {
  const { colors } = useTheme();
  const { dispatch, haptic } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'gps' | 'manual' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'gps' | 'manual') => {
    setBusy(kind);
    setError(null);
    try {
      const loc = kind === 'gps' ? await getGpsLocation() : await geocodePlace(text);
      dispatch({ type: 'location', location: loc });
      haptic('success');
      onDone?.();
    } catch (e: any) {
      haptic('warning');
      setError(
        e?.message === 'permission-denied'
          ? 'Location permission was declined. You can type your city or postal code instead.'
          : kind === 'manual'
            ? "Couldn't find that place. Try a postal/ZIP code or \"City, Province\"."
            : "Couldn't get your location. Check that location services are on.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Button3D title="Use my current location" icon="navigate" tone="sky" onPress={() => run('gps')} loading={busy === 'gps'} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, height: 2, backgroundColor: colors.hairline }} />
        <Text variant="label" muted>
          or
        </Text>
        <View style={{ flex: 1, height: 2, backgroundColor: colors.hairline }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Postal code or city"
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => text.trim() && run('manual')}
          returnKeyType="done"
          autoCapitalize="characters"
          style={{
            flex: 1,
            height: 50,
            borderRadius: radius.md,
            paddingHorizontal: 14,
            backgroundColor: colors.surfaceAlt,
            color: colors.text,
            fontFamily: fonts.semibold,
            fontSize: 16,
          }}
          accessibilityLabel="Postal code or city"
        />
        <Button3D title="Set" tone="neutral" onPress={() => run('manual')} disabled={!text.trim()} loading={busy === 'manual'} />
      </View>
      {error && (
        <Text variant="small" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
    </View>
  );
}
