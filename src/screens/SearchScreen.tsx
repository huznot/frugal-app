import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, SectionList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Text from '../components/Text';
import Card from '../components/Card';
import { GradeChip, PriceTag, StoreBadge } from '../components/Badges';
import { EmptyState, IconButton, ProductImage, SearchBar, Segmented, Skeleton } from '../components/Common';
import { OfferRow, OfferSheet, OfferSkeleton } from '../components/Offers';
import { formatPrice } from '../components/format';
import { fonts, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { searchProducts } from '../services/openFoodFacts';
import { searchOffers, shoppingEnabled } from '../services/shopping';
import { deviceCountry } from '../services/location';
import { formatDistance } from '../services/geo';
import { Offer, ProductSummary } from '../services/types';
import { StackProps } from '../navigation';

type Status = 'loading' | 'ready' | 'error' | 'more';

// The server refines its ranking with AI a few seconds after the first answer.
const REFINE_DELAYS = [2500, 3000, 4000, 5000, 6000, 8000]; // ~28 s: slow providers + AI refinement

export default function SearchScreen({ navigation, route }: StackProps<'Search'>) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch } = useApp();
  const [input, setInput] = useState(route.params.query);
  const [query, setQuery] = useState(route.params.query);
  const [tab, setTab] = useState<'prices' | 'products'>(shoppingEnabled ? 'prices' : 'products');

  // Store prices (Google Shopping via our server, ranked by AI + value)
  const [offers, setOffers] = useState<Offer[]>([]);
  const [meaning, setMeaning] = useState<string | undefined>();
  const [judged, setJudged] = useState(false);
  const [isFood, setIsFood] = useState(true);
  const [offerStatus, setOfferStatus] = useState<Status>('loading');
  const [openOffer, setOpenOffer] = useState<Offer | null>(null);
  const [stores, setStores] = useState<Set<string>>(new Set());

  // Products + nutrition (Open Food Facts)
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const requestId = useRef(0);
  const offerRequestId = useRef(0);
  const country = state.location?.countryCode ?? deviceCountry();

  const loadProducts = useCallback(
    async (q: string, p: number) => {
      const id = ++requestId.current; // ignore responses from superseded searches
      setStatus(p === 1 ? 'loading' : 'more');
      try {
        const res = await searchProducts(q, country, p);
        if (id !== requestId.current) return;
        setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items.filter((i) => !prev.some((x) => x.code === i.code))]));
        setPage(res.page);
        setPageCount(res.pageCount);
        setStatus('ready');
      } catch {
        if (id === requestId.current) setStatus('error');
      }
    },
    [country],
  );

  const loadOffers = useCallback(
    async (q: string) => {
      if (!shoppingEnabled) return;
      const id = ++offerRequestId.current;
      setOfferStatus('loading');
      setStores(new Set());
      const radius = Math.max(state.settings.radiusKm, 10);
      try {
        let res = await searchOffers(q, state.location, radius);
        if (id !== offerRequestId.current) return;
        setOffers(res.offers);
        setMeaning(res.meaning);
        setJudged(res.judged);
        setIsFood(res.isFood !== false);
        setOfferStatus('ready');
        // Pick up the AI-refined ranking (what you meant + best value) as soon as it's ready.
        for (const delay of REFINE_DELAYS) {
          if (res.judged) break;
          await new Promise((r) => setTimeout(r, delay));
          if (id !== offerRequestId.current) return;
          res = await searchOffers(q, state.location, radius, true);
          if (id !== offerRequestId.current) return;
          setOffers(res.offers);
          setMeaning(res.meaning);
          setJudged(res.judged);
          setIsFood(res.isFood !== false);
        }
      } catch {
        if (id === offerRequestId.current) setOfferStatus('error');
      }
    },
    [state.location, state.settings.radiusKm],
  );

  // Both searches start at the same time; each tab renders as soon as its data lands.
  useEffect(() => {
    loadProducts(query, 1);
    loadOffers(query);
  }, [query, loadProducts, loadOffers]);

  const submit = () => {
    const t = input.trim();
    if (!t) return;
    dispatch({ type: 'recentSearch', query: t });
    setQuery(t);
  };

  // Stores in the results, nearest first (unknown distance last, then A–Z).
  const storeChips = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of offers) {
      const d = o.distanceKm ?? Infinity;
      m.set(o.seller, Math.min(m.get(o.seller) ?? Infinity, d));
    }
    return [...m.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([name, km]) => ({ name, km }));
  }, [offers]);

  const toggleStore = (name: string) =>
    setStores((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  const visibleOffers = stores.size ? offers.filter((o) => stores.has(o.seller)) : offers;
  const sections = useMemo(() => {
    if (!judged) return [{ key: 'all', title: '', data: visibleOffers }];
    const main = visibleOffers.filter((o) => o.match === 'exact');
    const other = visibleOffers.filter((o) => o.match !== 'exact');
    return [
      { key: 'main', title: '', data: main },
      { key: 'other', title: other.length ? 'Other kinds' : '', data: other },
    ].filter((s) => s.data.length);
  }, [visibleOffers, judged]);

  const myBest = (code: string) => {
    const mine = state.myPrices.filter((p) => p.code === code);
    if (!mine.length) return undefined;
    return mine.reduce((a, b) => (b.price < a.price ? b : a));
  };

  const renderProduct = ({ item }: { item: ProductSummary }) => {
    const mine = myBest(item.code);
    return (
      <Card
        style={{ marginBottom: 12 }}
        contentStyle={{ flexDirection: 'row', padding: 12, gap: 14, alignItems: 'center' }}
        onPress={() => navigation.navigate('Product', { code: item.code, preview: item })}
        accessibilityLabel={item.name}
      >
        <ProductImage uri={item.imageUrl} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {item.name}
          </Text>
          <Text variant="small" muted numberOfLines={1}>
            {[item.brand, item.quantity].filter(Boolean).join(' · ') || ' '}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            {item.nutriscore && <GradeChip grade={item.nutriscore} compact />}
            {mine && <PriceTag price={formatPrice(mine.price, mine.currency)} caption="your price" />}
          </View>
        </View>
      </Card>
    );
  };

  const storeBar =
    storeChips.length > 1 ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Pressable
          onPress={() => setStores(new Set())}
          style={{
            height: 40,
            paddingHorizontal: 14,
            borderRadius: radius.pill,
            justifyContent: 'center',
            backgroundColor: stores.size ? colors.surfaceAlt : colors.ink,
          }}
        >
          <Text variant="small" style={{ fontFamily: fonts.semibold, color: stores.size ? colors.text : colors.onInk }}>
            All stores
          </Text>
        </Pressable>
        {storeChips.map(({ name, km }) => {
          const on = stores.has(name);
          return (
            <Pressable
              key={name}
              onPress={() => toggleStore(name)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                height: 40,
                paddingLeft: 5,
                paddingRight: 12,
                borderRadius: radius.pill,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.primary : colors.border,
                backgroundColor: on ? colors.primarySoft : colors.surface,
              }}
            >
              <StoreBadge name={name} size={28} style={{ borderRadius: 14 }} />
              <View>
                <Text variant="small" style={{ fontFamily: fonts.semibold, fontSize: 12 }} numberOfLines={1}>
                  {name}
                </Text>
                {isFinite(km) && (
                  <Text variant="small" muted style={{ fontSize: 10, lineHeight: 12 }}>
                    {formatDistance(km, state.settings.units)}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  const pricesTab =
    offerStatus === 'loading' ? (
      <View style={{ padding: 16 }}>
        <OfferSkeleton />
      </View>
    ) : offerStatus === 'error' ? (
      <EmptyState icon="cloud-offline" title="Couldn't load prices" message="Check your connection and try again." action="Retry" onAction={() => loadOffers(query)} />
    ) : (
      <SectionList
        sections={sections}
        keyExtractor={(o) => o.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          <View style={{ marginHorizontal: -16 }}>
            {storeBar}
            {offers.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
                <Text variant="label" muted style={{ flex: 1 }} numberOfLines={1}>
                  {meaning ? `Showing: ${meaning}` : `${visibleOffers.length} prices`}
                </Text>
                {!judged && (
                  <>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text variant="small" muted style={{ fontSize: 11 }}>
                      Finding best value…
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text variant="h3" style={{ marginTop: 18, marginBottom: 8 }}>
              {section.title}
            </Text>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => <OfferRow offer={item} onPress={() => setOpenOffer(item)} />}
        ListEmptyComponent={
          <EmptyState
            icon="pricetags-outline"
            title="No prices found"
            message="Try a shorter search, like a brand and product name."
            action="See products instead"
            onAction={() => setTab('products')}
          />
        }
      />
    );

  const productsTab =
    status === 'loading' ? (
      <View style={{ padding: 16, gap: 14 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Skeleton style={{ width: 72, height: 72, borderRadius: 14 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ height: 16, width: '85%' }} />
              <Skeleton style={{ height: 12, width: '50%' }} />
            </View>
          </View>
        ))}
      </View>
    ) : status === 'error' && items.length === 0 ? (
      <EmptyState icon="cloud-offline" title="Couldn't reach the shelves" message="Check your connection and try again." action="Retry" onAction={() => loadProducts(query, 1)} />
    ) : (
      <FlatList
        data={items}
        keyExtractor={(i) => i.code}
        renderItem={renderProduct}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="Nothing on this shelf"
            message="Try a simpler term like “oat milk” or a brand name — or scan the product instead."
            action="Scan instead"
            onAction={() => navigation.navigate('Tabs', { screen: 'Scan' } as never)}
          />
        }
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (status === 'ready' && page < pageCount && page < 10) loadProducts(query, page + 1);
        }}
        ListFooterComponent={
          status === 'more' ? (
            <ActivityIndicator color={colors.primary} style={{ margin: 16 }} />
          ) : items.length > 0 ? (
            <Text variant="small" muted center style={{ marginVertical: 12, fontFamily: fonts.medium }}>
              Product data © Open Food Facts contributors
            </Text>
          ) : null
        }
      />
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
        <IconButton icon="arrow-back" label="Back" onPress={() => navigation.goBack()} />
        <View style={{ flex: 1 }}>
          <SearchBar value={input} onChangeText={setInput} onSubmit={submit} />
        </View>
      </View>
      {shoppingEnabled && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'prices', label: offerStatus === 'ready' ? `Prices (${offers.length})` : 'Prices' },
              { value: 'products', label: 'Nutrition' },
            ]}
          />
        </View>
      )}
      <View style={{ flex: 1 }}>{tab === 'prices' ? pricesTab : productsTab}</View>
      <OfferSheet offer={openOffer} onClose={() => setOpenOffer(null)} isFood={isFood} />
    </View>
  );
}
