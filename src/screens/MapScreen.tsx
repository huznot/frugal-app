import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from '../components/Text';
import Button3D from '../components/Button3D';
import { Chip, StoreBadge } from '../components/Badges';
import { EmptyState, Segmented } from '../components/Common';
import { LocationPicker } from '../components/Sheets';
import { STORE_FILTERS, StoreDetailCard, StoreList } from '../components/StoreViews';
import { TAB_BAR_SPACE } from '../components/TabBar';
import WebMap, { WebMapStore } from '../components/WebMap';
import { radius, softShadow, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { getNearbyStores } from '../services/stores';
import { hasLocationPermission } from '../services/location';
import { distanceKm } from '../services/geo';
import { openWeb } from '../services/links';
import { brandStyle } from '../services/brands';
import { resolveLogo, wikidataFor } from '../services/logos';
import { Store, StoreKind } from '../services/types';

// iPhone: Apple Maps (react-native-maps). Android: MapLibre in a WebView — Google's map is blank in
// Expo Go on Android since SDK 55, and this way the app never depends on a Google Maps key.
const USE_WEB_MAP = Platform.OS === 'android';

type Load = 'loading' | 'ready' | 'error';

export default function MapScreen() {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, haptic } = useApp();
  const loc = state.location;
  const map = useRef<MapView>(null);
  const [view, setView] = useState<'map' | 'list'>('map');
  const [center, setCenter] = useState(loc ? { lat: loc.lat, lon: loc.lon } : null);
  const [moved, setMoved] = useState<{ lat: number; lon: number } | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<StoreKind | 'all'>('all');
  const [selected, setSelected] = useState<Store | null>(null);
  const [tracks, setTracks] = useState(true);
  const [recenter, setRecenter] = useState(0);
  const [livePosition, setLivePosition] = useState(false); // permission granted → OS draws the live blue dot
  const [logos, setLogos] = useState<Record<string, string | null>>({});
  const radiusKm = Math.min(state.settings.radiusKm, 50);

  // Follow the user's saved location.
  useEffect(() => {
    if (!loc) return;
    setCenter({ lat: loc.lat, lon: loc.lon });
    setMoved(null);
    hasLocationPermission().then(setLivePosition).catch(() => setLivePosition(false));
  }, [loc]);

  // Load stores for the current area + radius. The previous stores stay on the map while the new
  // ones load, the newest request always wins, and any failure ends in a Retry button.
  const requestId = useRef(0);
  useEffect(() => {
    if (!center) return;
    const id = ++requestId.current;
    setLoad('loading');
    getNearbyStores(center.lat, center.lon, radiusKm)
      .then((s) => {
        if (id !== requestId.current) return;
        // Distances are always from the user, even when browsing another area.
        setStores(loc ? s.map((x) => ({ ...x, distanceKm: distanceKm(loc.lat, loc.lon, x.lat, x.lon) })) : s);
        setLoad('ready');
      })
      .catch(() => id === requestId.current && setLoad('error'));
  }, [center, radiusKm, loc, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const visible = useMemo(() => stores.filter((s) => filter === 'all' || s.kind === filter).slice(0, 250), [stores, filter]);

  // iOS custom markers must render (and load their logo) before we stop tracking changes.
  useEffect(() => {
    setTracks(true);
    const t = setTimeout(() => setTracks(false), 2500);
    return () => clearTimeout(t);
  }, [visible, selected, dark]);

  // Android map markers show real logos too: resolve them here and pass the URLs to the WebView.
  useEffect(() => {
    if (!USE_WEB_MAP) return;
    let alive = true;
    const missing = visible.filter((s) => !(s.id in logos));
    if (!missing.length) return;
    Promise.all(missing.map((s) => resolveLogo(wikidataFor(s.brand ?? s.name, s.wikidata)).then((url) => [s.id, url] as const))).then((pairs) => {
      if (alive) setLogos((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const webStores: WebMapStore[] = useMemo(
    () =>
      visible.map((s) => {
        const b = brandStyle(s.brand ?? s.name);
        return { id: s.id, lat: s.lat, lon: s.lon, name: s.name, logo: logos[s.id] ?? undefined, mono: b.mono, bg: b.bg, fg: b.fg };
      }),
    [visible, logos],
  );

  const onAreaMoved = (lat: number, lon: number) => {
    if (!center) return;
    const far = distanceKm(lat, lon, center.lat, center.lon) > Math.max(1, radiusKm * 0.4);
    setMoved(far ? { lat, lon } : null);
  };

  if (!loc || !center) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40, paddingHorizontal: 24 }}>
        <EmptyState icon="map" title="Find stores near you" message="Share your location or type a postal code to see grocery stores around you." tone={colors.skySoft} />
        <LocationPicker />
      </View>
    );
  }

  const initial: Region = { latitude: loc.lat, longitude: loc.lon, latitudeDelta: 0.06, longitudeDelta: 0.06 };

  const filters = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {STORE_FILTERS.map((f) => (
        <Chip
          key={f.value}
          label={f.label}
          icon={f.icon}
          active={filter === f.value}
          onPress={() => {
            haptic('light');
            setFilter(f.value);
            setSelected(null);
          }}
        />
      ))}
    </ScrollView>
  );

  const header = (
    <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View>
        <Text variant="eyebrow">Nearby</Text>
        <Text variant="h1">Stores</Text>
      </View>
      <View style={{ width: 150 }}>
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v);
            setSelected(null);
          }}
          options={[
            { value: 'map', label: 'Map' },
            { value: 'list', label: 'List' },
          ]}
        />
      </View>
    </View>
  );

  // Status line: never a spinner that can hang — loading shows over the current stores, errors retry.
  const status =
    load === 'loading' ? (
      <View style={[styles.pill, { backgroundColor: colors.surface }, softShadow]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text variant="small">{stores.length ? 'Updating stores…' : 'Finding stores…'}</Text>
      </View>
    ) : load === 'error' ? (
      <Button3D title="Couldn't load stores — retry" size="sm" tone="neutral" icon="refresh" onPress={retry} />
    ) : moved && view === 'map' ? (
      <Button3D
        title="Search this area"
        size="sm"
        tone="dark"
        icon="search"
        onPress={() => {
          setCenter(moved);
          setMoved(null);
          setSelected(null);
        }}
      />
    ) : null;

  if (view === 'list') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12, gap: 12 }}>
        {header}
        <View>{filters}</View>
        {status && <View style={{ alignItems: 'center' }}>{status}</View>}
        {load === 'ready' && !visible.length ? (
          <EmptyState icon="storefront-outline" title="No stores found" message="Try a bigger search radius in Settings." tone={colors.skySoft} />
        ) : (
          <StoreList stores={visible} onSelect={setSelected} bottomPad={TAB_BAR_SPACE + insets.bottom + (selected ? 220 : 20)} />
        )}
        {selected && (
          <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR_SPACE }}>
            <StoreDetailCard store={selected} />
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {USE_WEB_MAP ? (
        <WebMap
          center={center}
          user={{ lat: loc.lat, lon: loc.lon }}
          stores={webStores}
          selectedId={selected?.id}
          recenter={recenter}
          dark={dark}
          onSelect={(id) => {
            const s = visible.find((x) => x.id === id);
            if (s) {
              haptic('light');
              setSelected(s);
            }
          }}
          onMapPress={() => setSelected(null)}
          onMoved={onAreaMoved}
        />
      ) : (
        <MapView
          ref={map}
          style={StyleSheet.absoluteFill}
          initialRegion={initial}
          showsUserLocation={livePosition}
          showsMyLocationButton={false}
          showsPointsOfInterests={false}
          toolbarEnabled={false}
          userInterfaceStyle={dark ? 'dark' : 'light'}
          onPress={() => setSelected(null)}
          onRegionChangeComplete={(r) => onAreaMoved(r.latitude, r.longitude)}
        >
          {/* Your saved location (postal code / city), when there's no live GPS dot */}
          {!livePosition && (
            <Marker coordinate={{ latitude: loc.lat, longitude: loc.lon }} anchor={{ x: 0.5, y: 0.5 }} zIndex={20} tracksViewChanges={tracks}>
              <View style={styles.youHalo}>
                <View style={styles.youDot} />
              </View>
            </Marker>
          )}
          {visible.map((s) => {
            const active = selected?.id === s.id;
            return (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.lat, longitude: s.lon }}
                tracksViewChanges={tracks}
                onPress={(e) => {
                  e.stopPropagation();
                  haptic('light');
                  setSelected(s);
                }}
                zIndex={active ? 10 : 1}
                anchor={{ x: 0.5, y: 1 }}
              >
                <View style={{ alignItems: 'center' }}>
                  <View style={{ padding: 2, borderRadius: 14, backgroundColor: active ? colors.primary : '#FFFFFF', ...softShadow }}>
                    <StoreBadge name={s.brand ?? s.name} wikidata={s.wikidata} size={active ? 42 : 32} />
                  </View>
                  <View style={[styles.pinTail, { borderTopColor: active ? colors.primary : '#FFFFFF' }]} />
                </View>
              </Marker>
            );
          })}
        </MapView>
      )}

      {/* Header over the map */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + 12, paddingBottom: 12, backgroundColor: colors.bg + 'F2', gap: 12 }}>
        {header}
        {filters}
      </View>

      <View style={{ position: 'absolute', top: insets.top + 150, left: 0, right: 0, alignItems: 'center' }} pointerEvents="box-none">
        {status}
      </View>

      <View style={{ position: 'absolute', right: 16, bottom: insets.bottom + TAB_BAR_SPACE + (selected ? 200 : 10) }}>
        <Button3D
          icon="locate"
          tone="neutral"
          accessibilityLabel="Center on my location"
          onPress={() => {
            if (USE_WEB_MAP) setRecenter((r) => r + 1);
            else map.current?.animateToRegion(initial, 400);
            setCenter({ lat: loc.lat, lon: loc.lon });
            setMoved(null);
          }}
        />
      </View>

      <Text
        variant="small"
        style={{ position: 'absolute', left: 12, bottom: insets.bottom + TAB_BAR_SPACE - 18, fontSize: 10, color: colors.textMuted }}
        onPress={() => openWeb('https://docs.overturemaps.org/attribution/')}
      >
        Stores: Overture Maps, © OpenStreetMap contributors
      </Text>

      {selected && (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + TAB_BAR_SPACE }}>
          <StoreDetailCard store={selected} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pinTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  youHalo: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(63,123,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  youDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#3F7BFF', borderWidth: 3, borderColor: '#FFFFFF' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, height: 36, borderRadius: radius.pill },
});
