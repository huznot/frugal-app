import React, { useState } from 'react';
import { Modal, View } from 'react-native';
import Text from './Text';
import Button3D from './Button3D';
import { LegalModal } from './Sheets';
import { BORDER, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { APP_CONFIG } from '../config';
import { LegalDocKey } from '../legal';

/** Shown to existing users when the Terms/Privacy Policy version is bumped. */
export default function ConsentGate() {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  if (state.acceptedLegalVersion >= APP_CONFIG.legalVersion) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.xl, borderWidth: BORDER, borderColor: colors.border, padding: 22, gap: 14 }}>
          <Text variant="h2">We've updated our terms</Text>
          <Text muted>Please review the updated Terms of Service and Privacy Policy to keep using {APP_CONFIG.appName}.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button3D title="Terms" tone="neutral" size="sm" onPress={() => setDoc('terms')} style={{ flex: 1 }} />
            <Button3D title="Privacy" tone="neutral" size="sm" onPress={() => setDoc('privacy')} style={{ flex: 1 }} />
          </View>
          <Button3D title="I agree" onPress={() => dispatch({ type: 'acceptLegal', legalVersion: APP_CONFIG.legalVersion })} />
        </View>
      </View>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </Modal>
  );
}
