import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export function openDirections(lat: number, lon: number, label: string) {
  const name = encodeURIComponent(label);
  const url =
    Platform.OS === 'ios'
      ? `maps:?daddr=${lat},${lon}&q=${name}`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  Linking.openURL(url).catch(() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`));
}

export const openWeb = (url: string) => WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
