import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Text from '../components/Text';
import { Chip } from '../components/Badges';
import { EmptyState } from '../components/Common';
import { LocationPicker } from '../components/Sheets';
import { STORE_FILTERS, StoreDetailCard } from '../components/StoreViews';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { radius, softShadow, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { getNearbyStores } from '../services/stores';
import { distanceKm } from '../services/geo';
import { brandStyle } from '../services/brands';
import { resolveLogo, wikidataFor } from '../services/logos';
import { Store, StoreKind } from '../services/types';

// Web build: react-native-maps has no web support, so we use MapLibre GL with OpenFreeMap
// vector tiles (free, no API key, commercial use allowed with OSM attribution).
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function markerElement(store: Store): HTMLElement {
  const el = document.createElement('div');
  const b = brandStyle(store.brand ?? store.name);
  el.style.cssText =
    'width:36px;height:36px;border-radius:12px;background:#fff;box-shadow:0 3px 10px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;cursor:pointer;overflow:hidden;padding:2px;box-sizing:border-box';
  el.innerHTML = `<div style="width:100%;height:100%;border-radius:10px;background:${b.bg};color:${b.fg};font:700 12px system-ui;display:flex;align-items:center;justify-content:center">${b.mono}</div>`;
  resolveLogo(wikidataFor(store.brand ?? store.name, store.wikidata)).then((url) => {
    if (url) el.innerHTML = `<img src="${url}" alt="" style="width:82%;height:82%;object-fit:contain"/>`;
  });
  return el;
}

export default function MapScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, haptic } = useApp();
  const loc = state.location;
  const container = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [filter, setFilter] = useState<StoreKind | 'all'>('all');
  const [selected, setSelected] = useState<Store | null>(null);

  useEffect(() => {
    if (!loc) return;
    getNearbyStores(loc.lat, loc.lon, Math.min(state.settings.radiusKm, 50))
      .then((s) => setStores(s.map((x) => ({ ...x, distanceKm: distanceKm(loc.lat, loc.lon, x.lat, x.lon) }))))
      .catch(() => setStores([]));
  }, [loc, state.settings.radiusKm]);

  useEffect(() => {
    if (!loc || !container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, style: STYLE, center: [loc.lon, loc.lat], zoom: 12.5, attributionControl: { compact: true } });
    map.on('click', () => setSelected(null));
    // "You are here" dot
    const you = document.createElement('div');
    you.style.cssText = 'width:18px;height:18px;border-radius:50%;background:#3F7BFF;border:3px solid #fff;box-shadow:0 0 0 8px rgba(63,123,255,.22)';
    new maplibregl.Marker({ element: you }).setLngLat([loc.lon, loc.lat]).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [loc]);

  const visible = useMemo(() => (stores ?? []).filter((s) => filter === 'all' || s.kind === filter).slice(0, 150), [stores, filter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    markers.current = visible.map((s) => {
      const el = markerElement(s);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        haptic('light');
        setSelected(s);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!loc) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: insets.top + 40 }}>
        <EmptyState icon="map" title="Find stores near you" tone={colors.skySoft} />
        <LocationPicker />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 12, paddingBottom: 12, backgroundColor: colors.bg + 'F2', gap: 12 }}>
        <View style={{ paddingHorizontal: 20 }}>
          <Text variant="eyebrow">Nearby</Text>
          <Text variant="h1">Stores</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {STORE_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} icon={f.icon} active={filter === f.value} onPress={() => setFilter(f.value)} />
          ))}
        </ScrollView>
      </View>
      {stores === null && (
        <View
          style={{
            position: 'absolute',
            top: insets.top + 140,
            alignSelf: 'center',
            flexDirection: 'row',
            gap: 8,
            backgroundColor: colors.surface,
            paddingHorizontal: 14,
            height: 36,
            alignItems: 'center',
            borderRadius: radius.pill,
            ...softShadow,
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text variant="small">Finding stores…</Text>
        </View>
      )}
      {selected && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR_SPACE }}>
          <StoreDetailCard store={selected} />
        </View>
      )}
    </View>
  );
}
