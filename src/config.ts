import Constants from 'expo-constants';
import business from './legal/business.json';

/**
 * Business details live in src/legal/business.json so the in-app legal screens and
 * the hostable HTML versions (npm run legal) always say the same thing.
 * Fill in legalEntity, supportEmail and privacyPolicyUrl before publishing.
 */
export const APP_CONFIG = {
  ...business,
  version: Constants.expoConfig?.version ?? '1.0.0',
};

/**
 * Optional backend proxy (see /proxy). Keeps API keys off the device and enables
 * photo recognition (Gemini) and the official Kroger API for US users. Without it
 * the app still works using the open, keyless data sources.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');
// Not a secret (anything in the app can be extracted) — just stops casual abuse of the proxy.
export const API_APP_KEY = process.env.EXPO_PUBLIC_API_APP_KEY || '';

// Open Food Facts asks every app to identify itself with a descriptive User-Agent.
export const USER_AGENT = `Frugal/${APP_CONFIG.version} (${APP_CONFIG.supportEmail})`;
