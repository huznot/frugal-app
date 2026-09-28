import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Text from './Text';
import Button3D from './Button3D';
import { StoreBadge } from './Badges';
import { Sheet } from './Sheets';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { getNearbyStores } from '../services/stores';
import { currencyFor } from '../services/openPrices';
import { formatDistance } from '../services/geo';
import { Store } from '../services/types';

/** Lets people record a price they see in-store — their personal "price book". */
export default function LogPriceSheet({
  visible, onClose, product,
}: {
  visible: boolean;
  onClose: () => void;
  product: { code?: string; name: string };
}) {
  const { colors } = useTheme();
  const { state, dispatch, haptic, newId } = useApp();
  const [price, setPrice] = useState('');
  const [promo, setPromo] = useState(false);
  const [filter, setFilter] = useState('');
  const [stores, setStores] = useState<Store[] | null>(null);
  const [selected, setSelected] = useState<Store | null>(null);
  const loc = state.location;

  useEffect(() => {
    if (!visible) return;
    setPrice('');
    setPromo(false);
    setSelected(null);
    setFilter('');
    if (!loc) return setStores([]);
    setStores(null);
    getNearbyStores(loc.lat, loc.lon, state.settings.radiusKm)
      .then(setStores)
      .catch(() => setStores([]));
  }, [visible, loc, state.settings.radiusKm]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (stores ?? []).filter((s) => !f || s.name.toLowerCase().includes(f)).slice(0, 25);
  }, [stores, filter]);

  const value = parseFloat(price.replace(',', '.'));
  const storeName = selected?.name ?? filter.trim();
  const valid = isFinite(value) && value > 0 && value < 100000 && storeName.length > 0;

  const save = () => {
    if (!valid) return;
    dispatch({
      type: 'priceAdd',
      price: {
        id: `me-${newId()}`,
        source: 'mine',
        code: product.code,
        productName: product.name,
        price: Math.round(value * 100) / 100,
        currency: currencyFor(loc?.countryCode) || 'CAD',
        storeName,
        storeAddress: selected?.address,
        lat: selected?.lat,
        lon: selected?.lon,
        date: new Date().toISOString(),
        isPromo: promo,
      },
    });
    haptic('success');
    onClose();
  };

  const input = {
    height: 50,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceAlt,
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 16,
  } as const;

  return (
    <Sheet visible={visible} onClose={onClose} title="Log a price">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
        <Text variant="small" muted numberOfLines={2}>
          {product.name}
        </Text>
        <TextInput
            value={price}
            onChangeText={(t) => setPrice(t.replace(/[^0-9.,]/g, ''))}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={[input, { height: 58, fontFamily: fonts.display, fontSize: 26 }]}
            accessibilityLabel="Price"
          />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="bodyStrong">On sale / promo price</Text>
          <Switch value={promo} onValueChange={setPromo} trackColor={{ true: colors.success }} />
        </View>

        <Text variant="label" muted>
          Where?
        </Text>
        <TextInput
          value={selected ? selected.name : filter}
          onChangeText={(t) => {
            setSelected(null);
            setFilter(t);
          }}
          placeholder={loc ? 'Search nearby stores or type a name' : 'Store name'}
          placeholderTextColor={colors.textMuted}
          style={input}
          accessibilityLabel="Store"
        />
        {stores === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          !selected &&
          shown.length > 0 && (
            <View style={{ borderWidth: BORDER, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' }}>
              {shown.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    haptic('light');
                    setSelected(s);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 10,
                    backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
                    borderTopWidth: i ? 1 : 0,
                    borderColor: colors.hairline,
                  })}
                >
                  <StoreBadge name={s.brand ?? s.name} wikidata={s.wikidata} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {s.name}
                    </Text>
                    {s.address && (
                      <Text variant="small" muted numberOfLines={1}>
                        {s.address}
                      </Text>
                    )}
                  </View>
                  <Text variant="small" muted>
                    {formatDistance(s.distanceKm, state.settings.units)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )
        )}
        {selected && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text variant="small" muted style={{ flex: 1 }}>
              {selected.address ?? 'Store selected'}
            </Text>
          </View>
        )}
        <Button3D title="Save price" icon="pricetag" tone="success" onPress={save} disabled={!valid} />
        <Text variant="small" muted center>
          Saved only on this phone, in your price book.
        </Text>
      </ScrollView>
    </Sheet>
  );
}
