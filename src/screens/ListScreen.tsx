import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Text from '../components/Text';
import Card from '../components/Card';
import Button3D from '../components/Button3D';
import { PriceTag, StoreBadge } from '../components/Badges';
import { EmptyState, ProductImage, Segmented } from '../components/Common';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { formatPrice, timeAgo } from '../components/format';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { ListItem, MyPrice, useApp } from '../state/AppState';

export default function ListScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { state, dispatch, haptic } = useApp();
  const [tab, setTab] = useState<'list' | 'prices'>('list');
  const [text, setText] = useState('');

  // Best known price per item: the store listing it was added from, or the cheapest price
  // the user logged (matched by barcode, else by name) — whichever is lower.
  const bestFor = useMemo(() => {
    const map = new Map<string, { price: number; currency: string; storeName: string }>();
    for (const item of state.list) {
      if (item.price != null) map.set(item.id, { price: item.price, currency: item.currency ?? 'CAD', storeName: item.store ?? '' });
      const matches = state.myPrices.filter((p) =>
        item.code ? p.code === item.code : p.productName.toLowerCase() === item.name.toLowerCase(),
      );
      if (matches.length) {
        const logged = matches.reduce((a, b) => (b.price < a.price ? b : a));
        const current = map.get(item.id);
        if (!current || logged.price < current.price) map.set(item.id, logged);
      }
    }
    return map;
  }, [state.list, state.myPrices]);

  const open = state.list.filter((i) => !i.checked);
  const priced = open.filter((i) => bestFor.has(i.id));
  const total = priced.reduce((sum, i) => sum + bestFor.get(i.id)!.price * i.qty, 0);
  const currency = priced[0] ? bestFor.get(priced[0].id)!.currency : undefined;

  const add = () => {
    const name = text.trim();
    if (!name) return;
    dispatch({ type: 'listAdd', item: { name } });
    haptic('light');
    setText('');
  };

  const sorted = [...state.list].sort((a, b) => Number(a.checked) - Number(b.checked));

  const renderItem = ({ item }: { item: ListItem }) => {
    const best = bestFor.get(item.id);
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 12,
          marginBottom: 10,
          borderRadius: radius.lg,
          borderWidth: BORDER,
          borderColor: colors.border,
          backgroundColor: item.checked ? colors.surfaceAlt : colors.surface,
          opacity: item.checked ? 0.7 : 1,
        }}
      >
        <Pressable
          onPress={() => {
            haptic(item.checked ? 'light' : 'success');
            dispatch({ type: 'listToggle', id: item.id });
          }}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.checked }}
          accessibilityLabel={item.name}
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            borderWidth: BORDER,
            borderColor: colors.border,
            backgroundColor: item.checked ? colors.success : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {item.checked && <Ionicons name="checkmark" size={20} color="#FFFFFF" />}
        </Pressable>
        <Pressable
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          disabled={!item.code}
          onPress={() => item.code && navigation.navigate('Product', { code: item.code })}
        >
          {item.imageUrl && <ProductImage uri={item.imageUrl} size={42} />}
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={2} style={{ textDecorationLine: item.checked ? 'line-through' : 'none' }}>
              {item.name}
            </Text>
            {best && (
              <Text variant="small" muted numberOfLines={1}>
                {formatPrice(best.price, best.currency)} at {best.storeName}
              </Text>
            )}
          </View>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: BORDER, borderColor: colors.border, borderRadius: radius.pill }}>
          <Pressable
            onPress={() => (item.qty === 1 ? dispatch({ type: 'listRemove', id: item.id }) : dispatch({ type: 'listQty', id: item.id, delta: -1 }))}
            style={{ padding: 6 }}
            accessibilityLabel={item.qty === 1 ? 'Remove item' : 'Decrease quantity'}
          >
            <Ionicons name={item.qty === 1 ? 'trash-outline' : 'remove'} size={16} color={colors.text} />
          </Pressable>
          <Text style={{ fontFamily: fonts.display, minWidth: 18, textAlign: 'center' }}>{item.qty}</Text>
          <Pressable onPress={() => dispatch({ type: 'listQty', id: item.id, delta: 1 })} style={{ padding: 6 }} accessibilityLabel="Increase quantity">
            <Ionicons name="add" size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderPrice = ({ item }: { item: MyPrice }) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        marginBottom: 10,
        borderRadius: radius.lg,
        borderWidth: BORDER,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <StoreBadge name={item.storeName} size={38} />
      <Pressable style={{ flex: 1 }} disabled={!item.code} onPress={() => item.code && navigation.navigate('Product', { code: item.code })}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.productName}
        </Text>
        <Text variant="small" muted numberOfLines={1}>
          {item.storeName} · {timeAgo(item.date)}
        </Text>
      </Pressable>
      <Text variant="price" style={{ fontSize: 18 }}>
        {formatPrice(item.price, item.currency)}
      </Text>
      <Pressable onPress={() => dispatch({ type: 'priceRemove', id: item.id })} hitSlop={10} accessibilityLabel="Delete price">
        <Ionicons name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 12 }}>
      <View style={{ paddingHorizontal: 20, gap: 14, marginBottom: 12 }}>
        <Text variant="h1">{tab === 'list' ? 'Shopping list' : 'Price book'}</Text>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'list', label: `List (${open.length})` },
            { value: 'prices', label: `Price book (${state.myPrices.length})` },
          ]}
        />
        {tab === 'list' && (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <TextInput
                value={text}
                onChangeText={setText}
                onSubmitEditing={add}
                placeholder="Add an item…"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                blurOnSubmit={false}
                style={{
                  height: 50,
                  borderRadius: radius.md,
                  paddingHorizontal: 14,
                  backgroundColor: colors.surfaceAlt,
                  color: colors.text,
                  fontFamily: fonts.semibold,
                  fontSize: 16,
                }}
                accessibilityLabel="New list item"
              />
            </View>
            <Button3D icon="add" onPress={add} disabled={!text.trim()} accessibilityLabel="Add item" />
          </View>
        )}
      </View>

      {tab === 'list' ? (
        <FlatList
          data={sorted}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom + (open.length ? 90 : 0) }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="cart-outline"
              title="Your cart is feeling light"
              message="Add items here, or tap “Add to list” on any product."
              tone={colors.successSoft}
            />
          }
          ListFooterComponent={
            state.list.some((i) => i.checked) ? (
              <Pressable onPress={() => dispatch({ type: 'listClearChecked' })} style={{ alignSelf: 'center', padding: 10 }}>
                <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.primary }}>
                  Clear checked items
                </Text>
              </Pressable>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={state.myPrices}
          keyExtractor={(p) => p.id}
          renderItem={renderPrice}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
          ListEmptyComponent={
            <EmptyState
              icon="pricetags-outline"
              title="No prices logged yet"
              message="Spot a price in store? Open the product and tap “Log price”. Your price book stays on your phone."
            />
          }
        />
      )}

      {tab === 'list' && open.length > 0 && (
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + TAB_BAR_SPACE - 6 }}>
          <Card bg={colors.sunSoft} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 16, gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" muted>
                Estimated total
              </Text>
              <Text variant="small" muted>
                {priced.length} of {open.length} items priced
              </Text>
            </View>
            <PriceTag price={priced.length ? formatPrice(total, currency) : '—'} />
          </Card>
        </View>
      )}
    </View>
  );
}
