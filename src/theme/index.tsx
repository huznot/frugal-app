import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'light' | 'dark';

// Clean, white, minimal. Colour is used sparingly: brand red (from the logo) for
// actions and highlighted words; soft tints for backgrounds of small accents.
// Every accent has a darker "ledge" twin used for the 3D bottom edge of buttons.
const light = {
  bg: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceAlt: '#F6F6F6',
  ink: '#161616', // solid dark fills (active chips, segmented control)
  onInk: '#FFFFFF',
  text: '#161616',
  textMuted: '#707070',
  border: '#ECECEC',
  hairline: '#F1F1F1',
  primary: '#FF5050',
  primaryLedge: '#C93434',
  primarySoft: '#FFE3E3',
  onPrimary: '#FFFFFF',
  success: '#16A870',
  successLedge: '#0E7A51',
  successSoft: '#DDF5EA',
  sun: '#FFC53D',
  sunLedge: '#D39A14',
  sunSoft: '#FFF4D6',
  sky: '#3F7BFF',
  skyLedge: '#2956C7',
  skySoft: '#E5EDFF',
  neutral: '#F3F3F3',
  neutralLedge: '#D6D6D6',
  danger: '#D93025',
  overlay: 'rgba(0, 0, 0, 0.4)',
  shadow: '#000000',
};

const dark: typeof light = {
  bg: '#121212',
  surface: '#1C1C1C',
  surfaceAlt: '#262626',
  ink: '#F4F4F4',
  onInk: '#121212',
  text: '#F4F4F4',
  textMuted: '#A0A0A0',
  border: '#2C2C2C',
  hairline: '#242424',
  primary: '#FF5F5F',
  primaryLedge: '#B53A3A',
  primarySoft: '#3A1D1D',
  onPrimary: '#FFFFFF',
  success: '#27C084',
  successLedge: '#157A53',
  successSoft: '#163126',
  sun: '#FFC94D',
  sunLedge: '#B98410',
  sunSoft: '#352C15',
  sky: '#5A8EFF',
  skyLedge: '#3659B8',
  skySoft: '#1B2440',
  neutral: '#2A2A2A',
  neutralLedge: '#0A0A0A',
  danger: '#FF6B6B',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

export type Colors = typeof light;
export type Tone = 'primary' | 'success' | 'sun' | 'sky' | 'neutral' | 'dark';

export const toneColors = (c: Colors, tone: Tone) => {
  switch (tone) {
    case 'success':
      return { face: c.success, ledge: c.successLedge, text: '#FFFFFF' };
    case 'sun':
      return { face: c.sun, ledge: c.sunLedge, text: '#161616' };
    case 'sky':
      return { face: c.sky, ledge: c.skyLedge, text: '#FFFFFF' };
    case 'neutral':
      return { face: c.neutral, ledge: c.neutralLedge, text: c.text };
    case 'dark':
      return { face: c.ink, ledge: c.textMuted, text: c.onInk };
    default:
      return { face: c.primary, ledge: c.primaryLedge, text: c.onPrimary };
  }
};

export const fonts = {
  // Display: chunky rounded headings, buttons and prices
  display: 'Fredoka_700Bold',
  displayBold: 'Fredoka_600SemiBold',
  displayMedium: 'Fredoka_500Medium',
  // Body
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 26, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const BORDER = 1;
export const LEDGE = 4; // depth of the 3D bottom edge on buttons

/** Soft, low elevation shadow for cards (iOS shadow + Android elevation). */
export const softShadow = {
  shadowColor: '#000000',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

export type Theme = { colors: Colors; dark: boolean };

const ThemeContext = createContext<Theme>({ colors: light, dark: false });

export function ThemeProvider({ mode, children }: { mode: ThemeMode; children: React.ReactNode }) {
  const system = useColorScheme();
  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return (
    <ThemeContext.Provider value={{ colors: isDark ? dark : light, dark: isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
