import React from 'react';
import { FlatList, Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './Text';
import Card from './Card';
import Button3D from './Button3D';
import { StoreBadge } from './Badges';
import { useTheme, radius } from '../theme';
import { useApp } from '../state/AppState';
import { formatDistance } from '../services/geo';
import { openDirections, openWeb } from '../services/links';
import { Store, StoreKind } from '../services/types';

export const STORE_FILTERS: { value: StoreKind | 'all'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'All', icon: 'apps' },
  { value: 'supermarket', label: 'Supermarkets', icon: 'cart' },
  { value: 'convenience', label: 'Convenience', icon: 'storefront' },
  { value: 'specialty', label: 'Specialty', icon: 'nutrition' },
  { value: 'wholesale', label: 'Wholesale', icon: 'cube' },
];

const fixUrl = (u: string) => (/^https?:/.test(u) ? u : `https://${u}`);

/** Details + actions for one store (used on the map and in the list). */
export function StoreDetailCard({ store }: { store: Store }) {
  const { colors } = useTheme();
  const { state } = useApp();
  return (
    <Card contentStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <StoreBadge name={store.brand ?? store.name} wikidata={store.wikidata} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {store.name}
          </Text>
          <Text variant="small" muted numberOfLines={1}>
            {[formatDistance(store.distanceKm, state.settings.units), store.address].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      {store.openingHours && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
          <Ionicons name="time-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Text variant="small" muted style={{ flex: 1 }} numberOfLines={2}>
            {store.openingHours.replace(/;\s*/g, ' · ')}
          </Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button3D title="Directions" icon="navigate" size="sm" style={{ flex: 1 }} onPress={() => openDirections(store.lat, store.lon, store.name)} />
        {store.phone && (
          <Button3D icon="call" tone="neutral" size="sm" accessibilityLabel="Call store" onPress={() => Linking.openURL(`tel:${store.phone}`)} />
        )}
        {store.website && (
          <Button3D icon="globe-outline" tone="neutral" size="sm" accessibilityLabel="Store website" onPress={() => openWeb(fixUrl(store.website!))} />
        )}
      </View>
    </Card>
  );
}

/** Plain list of stores — the list view on the Map tab, and the fallback when no map is available. */
export function StoreList({
  stores, onSelect, header, bottomPad,
}: {
  stores: Store[];
  onSelect: (s: Store) => void;
  header?: React.ReactElement;
  bottomPad: number;
}) {
  const { colors } = useTheme();
  const { state } = useApp();
  return (
    <FlatList
      data={stores}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={header}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomPad }}
      renderItem={({ item }) => (
        <Pressable
          onPress={() => onSelect(item)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 12,
            marginBottom: 8,
            borderRadius: radius.lg,
            backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          })}
        >
          <StoreBadge name={item.brand ?? item.name} wikidata={item.wikidata} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="small" muted numberOfLines={1}>
              {[formatDistance(item.distanceKm, state.settings.units), item.address].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      )}
    />
  );
}
