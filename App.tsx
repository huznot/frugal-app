import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Poppins_400Regular, Poppins_500Medium, Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';

import { AppStateProvider, useApp } from './src/state/AppState';
import { ThemeProvider, useTheme } from './src/theme';
import { RootStackParamList, TabParamList } from './src/navigation';
import TabBar from './src/components/TabBar';
import ConsentGate from './src/components/ConsentGate';
import { getNearbyStores } from './src/services/stores';

import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import MapScreen from './src/screens/MapScreen';
import ScanScreen from './src/screens/ScanScreen';
import ListScreen from './src/screens/ListScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SearchScreen from './src/screens/SearchScreen';
import ProductScreen from './src/screens/ProductScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Map" component={MapScreen} />
      <Tab.Screen name="Scan" component={ScanScreen} />
      <Tab.Screen name="List" component={ListScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { state } = useApp();
  const { colors, dark } = useTheme();

  // Warm the store cache as soon as we know where the user is, so the map,
  // price distances and "log a price" store list open instantly later.
  useEffect(() => {
    if (state.location) getNearbyStores(state.location.lat, state.location.lon, state.settings.radiusKm).catch(() => {});
  }, [state.location, state.settings.radiusKm]);

  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, background: colors.bg, card: colors.bg, text: colors.text, primary: colors.primary, border: colors.ink },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {!state.onboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ animation: 'fade' }} />
        ) : (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ animation: 'fade' }} />
            <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="Product" component={ProductScreen} options={{ animation: 'slide_from_bottom' }} />
          </>
        )}
      </Stack.Navigator>
      {state.onboarded && <ConsentGate />}
    </NavigationContainer>
  );
}

function Themed() {
  const { state } = useApp();
  return (
    <ThemeProvider mode={state.settings.theme}>
      <Root />
    </ThemeProvider>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [stateReady, setStateReady] = useState(false);
  const ready = fontsLoaded && stateReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <SafeAreaProvider>
      <AppStateProvider onReady={() => setStateReady(true)}>
        {fontsLoaded && (
          <View style={{ flex: 1 }}>
            <Themed />
          </View>
        )}
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
