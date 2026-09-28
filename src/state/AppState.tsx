import React, { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ThemeMode } from '../theme';
import { Units } from '../services/geo';
import { PriceObservation, ProductSummary, UserLocation } from '../services/types';

// Everything the user creates lives only on this device (no accounts, no cloud sync).
// That keeps the privacy story simple: "Delete all my data" really deletes everything.

export type ListItem = {
  id: string;
  name: string;
  code?: string;
  imageUrl?: string;
  qty: number;
  checked: boolean;
  addedAt: number;
  // price seen when added (from a store listing)
  price?: number;
  currency?: string;
  store?: string;
};

export type MyPrice = PriceObservation & { code?: string; productName: string };

export type State = {
  onboarded: boolean;
  acceptedLegalVersion: number;
  settings: {
    theme: ThemeMode;
    units: Units;
    radiusKm: number;
    haptics: boolean;
  };
  location?: UserLocation;
  list: ListItem[];
  myPrices: MyPrice[];
  recentSearches: string[];
  recentProducts: ProductSummary[];
};

const initialState: State = {
  onboarded: false,
  acceptedLegalVersion: 0,
  settings: { theme: 'light', units: 'km', radiusKm: 10, haptics: true },
  list: [],
  myPrices: [],
  recentSearches: [],
  recentProducts: [],
};

type Action =
  | { type: 'hydrate'; state: Partial<State> }
  | { type: 'completeOnboarding'; legalVersion: number }
  | { type: 'acceptLegal'; legalVersion: number }
  | { type: 'settings'; patch: Partial<State['settings']> }
  | { type: 'location'; location?: UserLocation }
  | { type: 'listAdd'; item: Omit<ListItem, 'id' | 'addedAt' | 'checked' | 'qty'> & { qty?: number } }
  | { type: 'listToggle'; id: string }
  | { type: 'listQty'; id: string; delta: number }
  | { type: 'listRemove'; id: string }
  | { type: 'listClearChecked' }
  | { type: 'priceAdd'; price: MyPrice }
  | { type: 'priceRemove'; id: string }
  | { type: 'recentSearch'; query: string }
  | { type: 'recentProduct'; product: ProductSummary }
  | { type: 'clearHistory' }
  | { type: 'resetAll' };

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'hydrate':
      return { ...state, ...a.state, settings: { ...state.settings, ...a.state.settings } };
    case 'completeOnboarding':
      return { ...state, onboarded: true, acceptedLegalVersion: a.legalVersion };
    case 'acceptLegal':
      return { ...state, acceptedLegalVersion: a.legalVersion };
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.patch } };
    case 'location':
      return { ...state, location: a.location };
    case 'listAdd': {
      const existing = state.list.find(
        (i) => (a.item.code && i.code === a.item.code) || i.name.toLowerCase() === a.item.name.toLowerCase(),
      );
      if (existing) {
        return { ...state, list: state.list.map((i) => (i === existing ? { ...i, qty: i.qty + 1, checked: false } : i)) };
      }
      const item: ListItem = { qty: 1, ...a.item, id: uid(), checked: false, addedAt: Date.now() };
      return { ...state, list: [item, ...state.list] };
    }
    case 'listToggle':
      return { ...state, list: state.list.map((i) => (i.id === a.id ? { ...i, checked: !i.checked } : i)) };
    case 'listQty':
      return {
        ...state,
        list: state.list.map((i) => (i.id === a.id ? { ...i, qty: Math.max(1, Math.min(99, i.qty + a.delta)) } : i)),
      };
    case 'listRemove':
      return { ...state, list: state.list.filter((i) => i.id !== a.id) };
    case 'listClearChecked':
      return { ...state, list: state.list.filter((i) => !i.checked) };
    case 'priceAdd':
      return { ...state, myPrices: [a.price, ...state.myPrices].slice(0, 1000) };
    case 'priceRemove':
      return { ...state, myPrices: state.myPrices.filter((p) => p.id !== a.id) };
    case 'recentSearch': {
      const q = a.query.trim();
      if (!q) return state;
      const rest = state.recentSearches.filter((s) => s.toLowerCase() !== q.toLowerCase());
      return { ...state, recentSearches: [q, ...rest].slice(0, 8) };
    }
    case 'recentProduct': {
      const rest = state.recentProducts.filter((p) => p.code !== a.product.code);
      return { ...state, recentProducts: [a.product, ...rest].slice(0, 12) };
    }
    case 'clearHistory':
      return { ...state, recentSearches: [], recentProducts: [] };
    case 'resetAll':
      return initialState;
  }
}

const KEY = 'frugal/state/v1';

type Ctx = {
  state: State;
  dispatch: React.Dispatch<Action>;
  haptic: (kind?: 'light' | 'medium' | 'success' | 'warning') => void;
  newId: () => string;
};

const AppStateContext = createContext<Ctx | null>(null);

export function AppStateProvider({ children, onReady }: { children: React.ReactNode; onReady?: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [hydrated, setHydrated] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) dispatch({ type: 'hydrate', state: JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => {
        setHydrated(true);
        onReady?.();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
    }, 300);
  }, [state, hydrated]);

  const haptic: Ctx['haptic'] = (kind = 'light') => {
    if (!state.settings.haptics) return;
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  if (!hydrated) return null;
  return <AppStateContext.Provider value={{ state, dispatch, haptic, newId: uid }}>{children}</AppStateContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useApp must be used inside AppStateProvider');
  return ctx;
}
