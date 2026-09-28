import type { ExpoConfig } from 'expo/config';

// Keys come from the environment (local .env or EAS environment variables) so nothing
// secret is committed. GOOGLE_MAPS_ANDROID_API_KEY is required for the Android map:
// create it in Google Cloud → "Maps SDK for Android" and restrict it to this package
// name + your Play signing certificate SHA-1. The Maps SDK for Android has no usage fee.
const BG = '#FFFFFF';

const config: ExpoConfig = {
  name: 'Frugal',
  slug: 'frugal-app-new',
  owner: 'huznot',
  version: '2.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic', // app defaults to light; users can pick Dark/Auto in Settings
  scheme: 'frugal',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.huznot.frugalappnew',
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: 'Frugal uses the camera to scan product barcodes and, if you choose, photograph products to identify them.',
      NSLocationWhenInUseUsageDescription: 'Frugal uses your location to show grocery stores and prices near you.',
    },
  },
  android: {
    package: 'com.huznot.frugalappnew',
    adaptiveIcon: { foregroundImage: './assets/adaptive_icon.png', backgroundColor: '#FF5050' },
    softwareKeyboardLayoutMode: 'pan',
    // Only what the app actually uses — Play reviews every declared permission.
    permissions: ['android.permission.CAMERA', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION'],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_AUDIO',
      'android.permission.SYSTEM_ALERT_WINDOW',
    ],
    config: {
      googleMaps: { apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY },
    },
  },
  web: { favicon: './assets/favicon.png' },
  plugins: [
    'expo-web-browser',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash_icon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: BG,
        dark: { image: './assets/splash_icon.png', backgroundColor: '#121212' },
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Frugal uses the camera to scan product barcodes and, if you choose, photograph products to identify them.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: 'Frugal uses your location to show grocery stores and prices near you.',
        isAndroidBackgroundLocationEnabled: false,
        isIosBackgroundLocationEnabled: false,
      },
    ],
  ],
  extra: {
    eas: { projectId: '67d50bec-de98-4882-aef0-93c97df50baa' },
  },
};

export default config;
