import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, StyleSheet, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Text from '../components/Text';
import Button3D from '../components/Button3D';
import { EmptyState, IconButton } from '../components/Common';
import { Sheet } from '../components/Sheets';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { identifyPhoto, PhotoError, proxyEnabled } from '../services/proxyApi';

/** GTIN check digit — rejects the occasional misread before we hit the network. */
export function isValidBarcode(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}


export default function ScanScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { haptic, dispatch } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  // One scanner: snap the product and AI identifies it; a barcode in view is read automatically.
  const photoMode = proxyEnabled;
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [frozen, setFrozen] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState('');
  const locked = useRef(false);
  const camera = useRef<CameraView>(null);
  const cameraReady = useRef(false);
  const sweep = useRef(new Animated.Value(0)).current;

  // Re-arm every time the tab comes back into focus.
  useEffect(() => {
    if (focused) {
      cameraReady.current = false;
      locked.current = false;
      setBusy(false);
      setFrozen(null);
      setMessage(null);
    } else {
      setTorch(false);
    }
  }, [focused]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(sweep, { toValue: 0, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const openProduct = useCallback(
    (code: string) => {
      haptic('success');
      navigation.navigate('Product', { code });
    },
    [haptic, navigation],
  );

  const onBarcode = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (locked.current || busy) return;
      const code = data.replace(/\D/g, '');
      if (!isValidBarcode(code)) return; // keep scanning — a clean read is usually a frame away
      locked.current = true;
      openProduct(code);
    },
    [busy, openProduct],
  );

  const takePhoto = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    setMessage(null);
    haptic('medium');
    try {
      // Fast capture: low quality + skip processing; the image is resized again before upload.
      let photo;
      try {
        // Low quality + a base64 copy: the photo is shrunk again before upload, and the base64
        // copy is the fallback if shrinking fails on this device.
        photo = await camera.current.takePictureAsync({ quality: 0.3, base64: true, shutterSound: false });
      } catch (first: any) {
        // Some Android phones refuse a capture that arrives before the camera has settled, or run
        // out of memory encoding a full-size base64 copy. Wait a beat and try once more without it.
        try {
          await new Promise((r) => setTimeout(r, cameraReady.current ? 300 : 1200));
          photo = await camera.current?.takePictureAsync({ quality: 0.3, shutterSound: false });
        } catch (e: any) {
          throw new PhotoError('capture', e?.message ?? first?.message ?? 'camera error');
        }
      }
      if (!photo?.uri) throw new PhotoError('capture', 'no photo');
      setFrozen(photo.uri);
      const result = await identifyPhoto(photo.uri, photo.base64);
      if (!result?.query) {
        haptic('warning');
        setMessage("Hmm, couldn't tell what that is. Try getting the front label in frame.");
        setFrozen(null);
        return;
      }
      dispatch({ type: 'recentSearch', query: result.query });
      haptic('success');
      navigation.navigate('Search', { query: result.query });
    } catch (e: any) {
      haptic('warning');
      // Say which step failed so a problem on a specific phone can be diagnosed.
      const step = e instanceof PhotoError ? e.step : 'unknown';
      const hint = step === 'upload' ? 'Check your connection and try again.' : 'Please try again.';
      console.warn('[Frugal] photo lookup failed:', e?.message ?? e);
      setMessage(`Photo lookup failed (${step}${e?.message ? `: ${String(e.message).slice(0, 60)}` : ''}). ${hint}`);
      setFrozen(null);
    } finally {
      setBusy(false);
    }
  };

  const manualValid = isValidBarcode(manual);
  const manualSheet = (
      <Sheet visible={manualOpen} onClose={() => setManualOpen(false)} title="Type the barcode">
        <View style={{ gap: 14 }}>
          <TextInput
            value={manual}
            onChangeText={(t) => setManual(t.replace(/\D/g, '').slice(0, 14))}
            keyboardType="number-pad"
            placeholder="e.g. 0068700100185"
            placeholderTextColor={colors.textMuted}
            autoFocus
            style={{
              height: 56,
              borderRadius: radius.md,
              paddingHorizontal: 14,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              fontFamily: fonts.display,
              fontSize: 22,
              letterSpacing: 2,
            }}
            accessibilityLabel="Barcode digits"
          />
          {manual.length >= 8 && !manualValid && (
            <Text variant="small" style={{ color: colors.danger }}>
              That doesn't look like a valid barcode — double-check the digits.
            </Text>
          )}
          <Button3D
            title="Look it up"
            icon="search"
            disabled={!manualValid}
            onPress={() => {
              setManualOpen(false);
              openProduct(manual);
              setManual('');
            }}
          />
        </View>
      </Sheet>
      );

  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;

  if (!permission.granted) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', paddingBottom: 80 }}>
        <EmptyState
          icon="camera"
          title="Camera time"
          message="Frugal uses your camera only while this screen is open, to read barcodes on your device."
          action={permission.canAskAgain ? 'Allow camera' : 'Open settings'}
          onAction={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        />
        <View style={{ paddingHorizontal: 40 }}>
          <Button3D title="Type a barcode instead" tone="neutral" icon="keypad" onPress={() => setManualOpen(true)} />
        </View>
        {manualSheet}
      </View>
    );
  }

  const FRAME = photoMode ? { w: 290, h: 290 } : { w: 280, h: 170 };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {focused && (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
          onBarcodeScanned={busy ? undefined : onBarcode}
          onCameraReady={() => (cameraReady.current = true)}
          onMountError={(e) => setMessage(`Camera couldn't start (${e.message}).`)}
        />
      )}
      {frozen && <Image source={{ uri: frozen }} style={StyleSheet.absoluteFill} contentFit="cover" />}

      {/* Top controls */}
      <View style={{ position: 'absolute', top: insets.top + 12, left: 16, right: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text variant="h2" color="#FFFFFF">
              {photoMode ? 'Scan a product' : 'Scan a barcode'}
            </Text>
          </View>
          <IconButton
            icon={torch ? 'flash' : 'flash-outline'}
            label={torch ? 'Turn off flashlight' : 'Turn on flashlight'}
            onPress={() => setTorch((t) => !t)}
            bg={torch ? colors.sun : undefined}
          />
        </View>
      </View>

      {/* Viewfinder */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 140 }}>
          <View style={{ width: FRAME.w, height: FRAME.h }}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
              <View
                key={c}
                style={[
                  styles.corner,
                  {
                    borderColor: colors.sun,
                    top: c[0] === 't' ? 0 : undefined,
                    bottom: c[0] === 'b' ? 0 : undefined,
                    left: c[1] === 'l' ? 0 : undefined,
                    right: c[1] === 'r' ? 0 : undefined,
                    borderTopWidth: c[0] === 't' ? 6 : 0,
                    borderBottomWidth: c[0] === 'b' ? 6 : 0,
                    borderLeftWidth: c[1] === 'l' ? 6 : 0,
                    borderRightWidth: c[1] === 'r' ? 6 : 0,
                    borderTopLeftRadius: c === 'tl' ? 22 : 0,
                    borderTopRightRadius: c === 'tr' ? 22 : 0,
                    borderBottomLeftRadius: c === 'bl' ? 22 : 0,
                    borderBottomRightRadius: c === 'br' ? 22 : 0,
                  },
                ]}
              />
            ))}
            {!busy && (
              <Animated.View
                style={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  height: 3,
                  borderRadius: 2,
                  backgroundColor: colors.primary,
                  transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [14, FRAME.h - 14] }) }],
                }}
              />
            )}
          </View>
        </View>
      </View>

      {/* Bottom actions (above the floating tab bar). The hint lives here too, so an error message
          can never end up hidden behind the buttons on a short screen. */}
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 110, alignItems: 'center', gap: 14 }}>
        <View
          style={{
            backgroundColor: message ? 'rgba(0,0,0,0.82)' : 'rgba(0,0,0,0.6)',
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: message ? radius.md : radius.pill,
          }}
        >
          <Text variant="bodyStrong" color="#FFFFFF" center>
            {busy
              ? 'Identifying…'
              : message ?? (photoMode ? 'Snap the front of the product, barcodes are read automatically' : 'Line up the barcode, it scans automatically')}
          </Text>
        </View>
        {photoMode &&
          (busy ? (
            <ActivityIndicator size="large" color={colors.sun} />
          ) : (
            <Button3D title="Snap & identify" icon="camera" size="lg" onPress={takePhoto} style={{ alignSelf: 'stretch' }} />
          ))}
        {!busy && <Button3D title="Type barcode" icon="keypad" tone="neutral" size="sm" onPress={() => setManualOpen(true)} />}
      </View>
      {manualSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', width: 44, height: 44 },
});
