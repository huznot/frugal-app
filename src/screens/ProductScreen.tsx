import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Text from '../components/Text';
import Card from '../components/Card';
import Button3D from '../components/Button3D';
import LogPriceSheet from '../components/LogPriceSheet';
import { GradeChip, PriceTag, StoreBadge, Sticker } from '../components/Badges';
import { OfferRow, OfferSheet, OfferSkeleton } from '../components/Offers';
import { IconButton, ProductImage, Segmented, Skeleton } from '../components/Common';
import { LocationPicker, Sheet } from '../components/Sheets';
import { formatPrice, isStale, timeAgo } from '../components/format';
import { BORDER, fonts, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { BarcodeIdentity, getProduct, lookupBarcode, offAddProductUrl, offProductUrl } from '../services/openFoodFacts';
import { getPrices, PriceResult } from '../services/priceSearch';
import { searchOffers, shoppingEnabled } from '../services/shopping';
import { formatDistance } from '../services/geo';
import { openDirections, openWeb } from '../services/links';
import { Nutrition, Offer, PriceObservation, Product } from '../services/types';
import { StackProps } from '../navigation';

export default function ProductScreen({ navigation, route }: StackProps<'Product'>) {
  const { code, preview } = route.params;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { state, dispatch, haptic } = useApp();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [error, setError] = useState(false);
  const [prices, setPrices] = useState<PriceResult | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const [showElsewhere, setShowElsewhere] = useState(false);
  const [added, setAdded] = useState(false);

  // Product details — preview (from search/scan) renders instantly while this loads.
  useEffect(() => {
    let alive = true;
    setError(false);
    getProduct(code)
      .then((p) => {
        if (!alive) return;
        setProduct(p);
        if (p) {
          dispatch({
            type: 'recentProduct',
            product: { code: p.code, name: p.name, brand: p.brand, quantity: p.quantity, imageUrl: p.imageUrl, nutriscore: p.nutriscore },
          });
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [code, dispatch]);

  // Prices start loading in parallel with product details (we only need the barcode).
  // What the barcode is (book / food / anything), from barcode databases. Opened from search
  // results we already know the product, so this only runs for scans.
  const [identity, setIdentity] = useState<BarcodeIdentity | null | undefined>(preview ? null : undefined);
  useEffect(() => {
    if (preview) return;
    let alive = true;
    lookupBarcode(code)
      .then((id) => alive && setIdentity(id))
      .catch(() => alive && setIdentity(null));
    return () => {
      alive = false;
    };
  }, [code, preview]);

  const name = identity?.name ?? product?.name ?? preview?.name ?? '';
  const brand = identity?.brand ?? product?.brand ?? preview?.brand;
  // Food if the nutrition database knows it or the barcode database says so.
  const isFood = identity ? identity.isFood : product !== null;
  useEffect(() => {
    let alive = true;
    setPrices(null);
    getPrices({ code, name, brand }, state.myPrices, state.location, state.settings.radiusKm)
      .then((r) => alive && setPrices(r))
      .catch(() => alive && setPrices({ nearby: [], elsewhere: [], failed: true }));
    return () => {
      alive = false;
    };
    // name/brand deliberately excluded: they only refine the optional Kroger lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state.myPrices, state.location, state.settings.radiusKm]);

  // Store prices for this exact product. Unknown barcodes are searched by the barcode itself,
  // which Google Shopping usually recognises.
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [offersFailed, setOffersFailed] = useState(false);
  const [openOffer, setOpenOffer] = useState<Offer | null>(null);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const quantity = product?.quantity ?? preview?.quantity ?? identity?.size;
  // Search stores by the real product name (brand + name + size). Never by the raw barcode number.
  const identityReady = preview || identity !== undefined;
  const offerQuery =
    identityReady && name
      ? [brand && !name.toLowerCase().includes(brand.toLowerCase()) ? brand : '', name, isFood ? quantity : ''].filter(Boolean).join(' ')
      : '';
  useEffect(() => {
    if (!shoppingEnabled || !offerQuery) return;
    let alive = true;
    setOffers(null);
    setOffersFailed(false);
    const radius = Math.max(state.settings.radiusKm, 10);
    (async () => {
      let res = await searchOffers(offerQuery, state.location, radius);
      if (!alive) return;
      setOffers(res.offers);
      // Pick up the server's AI-refined ranking (best value for this product) when it lands.
      for (const delay of [2500, 3000, 4000, 5000, 6000, 8000]) {
        if (res.judged || !alive) break;
        await new Promise((r) => setTimeout(r, delay));
        res = await searchOffers(offerQuery, state.location, radius, true);
        if (alive) setOffers(res.offers);
      }
    })().catch(() => {
        if (!alive) return;
        setOffers([]);
        setOffersFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [offerQuery, state.location, state.settings.radiusKm]);

  const addToList = () => {
    const best = offers?.find((o) => o.best) ?? offers?.[0];
    dispatch({
      type: 'listAdd',
      item: {
        name: (product === null ? offers?.[0]?.title : name) || `Barcode ${code}`,
        code,
        imageUrl: product?.imageUrl ?? preview?.imageUrl ?? offers?.[0]?.thumbnail,
        price: best?.price,
        currency: best?.currency,
        store: best?.seller,
      },
    });
    haptic('success');
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };

  const share = () =>
    Share.share({ message: `${displayName}${prices?.cheapest ? ` — ${formatPrice(prices.cheapest.price, prices.cheapest.currency)} at ${prices.cheapest.storeName}` : ''}\n${offProductUrl(code)}` });

  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 8 }}>
      <IconButton icon="arrow-back" label="Back" onPress={() => navigation.goBack()} />
      <IconButton icon="share-outline" label="Share" onPress={share} />
    </View>
  );

  const unknown = product === null && !preview && !identity;
  const displayName = name || (unknown && identity === null ? `Barcode ${code}` : '');
  const image = product?.imageUrl ?? preview?.imageUrl ?? (unknown ? offers?.[0]?.thumbnail : undefined);
  const nutriscore = product?.nutriscore ?? preview?.nutriscore;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginTop: 4, marginBottom: 18 }}>
          <ProductImage uri={image} size={200} style={{ borderRadius: 28, borderWidth: 0 }} />
        </View>
        <Text variant="h1">{displayName || <Text variant="h1" muted>Loading…</Text>}</Text>
        <Text muted style={{ marginTop: 4 }}>
          {[brand, product?.quantity ?? preview?.quantity].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {identity && !identity.isFood && identity.category && (
            <View style={{ borderRadius: radius.pill, paddingHorizontal: 10, height: 28, justifyContent: 'center', backgroundColor: colors.surfaceAlt }}>
              <Text variant="small" style={{ fontFamily: fonts.semibold }}>
                {identity.category.split('>').pop()!.trim()}
              </Text>
            </View>
          )}
          {nutriscore && <GradeChip grade={nutriscore} />}
          {product?.nova && <NovaChip group={product.nova} />}
          {product?.labels.slice(0, 3).map((l) => (
            <View key={l} style={{ borderRadius: radius.pill, paddingHorizontal: 10, height: 28, justifyContent: 'center', backgroundColor: colors.successSoft }}>
              <Text variant="small" style={{ fontFamily: fonts.semibold, textTransform: 'capitalize', color: colors.successLedge }}>
                {l}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <Button3D
            title={added ? 'Added!' : 'Add to list'}
            tone={added ? 'success' : 'primary'}
            onPress={addToList}
            style={{ flex: 1 }}
          />
          <Button3D title="Log price" tone="sun" onPress={() => setLogOpen(true)} style={{ flex: 1 }} />
        </View>

        {/* Store prices */}
        <Text variant="h2" style={{ marginTop: 30, marginBottom: 12 }}>
          Prices at stores
        </Text>
        {!state.location && (
          <Pressable onPress={() => setLocOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
              Set your location to see which stores are closest
            </Text>
          </Pressable>
        )}
        {!shoppingEnabled ? null : offers === null && identityReady && !offerQuery ? (
          <Card contentStyle={{ padding: 16, gap: 10 }}>
            <Text variant="h3">We couldn't identify this barcode</Text>
            <Text variant="small" muted>
              It isn't in the product databases we use. Try snapping a photo of the product instead.
            </Text>
            <Button3D title="Snap a photo" icon="camera" size="sm" onPress={() => navigation.navigate('Tabs', { screen: 'Scan' } as never)} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : offers === null ? (
          <OfferSkeleton />
        ) : offers.length === 0 ? (
          <Text variant="small" muted>
            {offersFailed ? "Couldn't load store prices — check your connection." : 'No store listings found for this product.'}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {(showAllOffers ? offers : offers.slice(0, 6)).map((o) => (
              <OfferRow key={o.id} offer={o} onPress={() => setOpenOffer(o)} />
            ))}
            {offers.length > 6 && (
              <Pressable onPress={() => setShowAllOffers((v) => !v)} style={{ alignSelf: 'center', padding: 8 }}>
                <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
                  {showAllOffers ? 'Show fewer' : `Show all ${offers.length} prices`}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Prices the user logged + shopper-reported prices for this exact barcode */}
        {prices && (prices.nearby.length > 0 || prices.elsewhere.length > 0) && (
          <>
            <Text variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>
              Your & shopper-reported prices
            </Text>
            <View style={{ gap: 10 }}>
              {prices.cheapest && <BestPriceCard p={prices.cheapest} />}
              {prices.nearby.slice(1).map((p) => (
                <PriceRow key={p.id} p={p} />
              ))}
            </View>
            {prices.elsewhere.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Pressable onPress={() => setShowElsewhere((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
                  <Ionicons name={showElsewhere ? 'chevron-up' : 'chevron-down'} size={16} color={colors.primary} />
                  <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
                    {showElsewhere ? 'Hide' : 'Show'} {prices.elsewhere.length} further away
                  </Text>
                </Pressable>
                {showElsewhere && (
                  <View style={{ gap: 10 }}>
                    {prices.elsewhere.map((p) => (
                      <PriceRow key={p.id} p={p} />
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* Nutrition — food & drink only */}
        {!isFood ? null : product === undefined && !error ? (
          <View style={{ marginTop: 30, gap: 10 }}>
            <Skeleton style={{ height: 28, width: 160 }} />
            <Skeleton style={{ height: 180, borderRadius: radius.lg }} />
          </View>
        ) : product ? (
          <NutritionSection product={product} />
        ) : product === null ? (
          <Card style={{ marginTop: 30 }} contentStyle={{ padding: 16, gap: 10 }}>
            <Text variant="h3">No nutrition facts yet</Text>
            <Text variant="small" muted>
              This barcode isn't in Open Food Facts yet. Adding it takes a minute and helps everyone.
            </Text>
            <Button3D title="Add it" icon="add" tone="neutral" size="sm" onPress={() => openWeb(offAddProductUrl(code))} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : error ? (
          <Text muted style={{ marginTop: 30 }}>
            Couldn't load nutrition info. Check your connection.
          </Text>
        ) : null}

        {isFood && (
          <>
            <Text variant="small" muted style={{ marginTop: 28, lineHeight: 19 }}>
              Product data from Open Food Facts, a collaborative database — it may be incomplete or out of date. Always check the label, especially for allergens.
            </Text>
            <Pressable onPress={() => openWeb(offProductUrl(code))} style={{ marginTop: 8 }}>
              <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.primary }}>
                See something wrong? Fix it on Open Food Facts →
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <LogPriceSheet visible={logOpen} onClose={() => setLogOpen(false)} product={{ code, name: displayName || `Barcode ${code}` }} />
      <OfferSheet offer={openOffer} onClose={() => setOpenOffer(null)} isFood={isFood} />
      <Sheet visible={locOpen} onClose={() => setLocOpen(false)} title="Your location">
        <LocationPicker onDone={() => setLocOpen(false)} />
      </Sheet>
    </View>
  );
}

const SOURCE_LABEL = { openprices: 'Open Prices', kroger: 'Kroger', mine: 'You' } as const;

function BestPriceCard({ p }: { p: PriceObservation }) {
  const { colors } = useTheme();
  const { state } = useApp();
  return (
    <Card bg={colors.successSoft} contentStyle={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Sticker label="CHEAPEST NEARBY" bg={colors.success} />
        <PriceTag price={formatPrice(p.price, p.currency)} caption={p.per === 'kg' ? 'per kg' : p.isPromo ? 'on sale' : undefined} big />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <StoreBadge name={p.storeName} size={44} />
        <View style={{ flex: 1 }}>
          <Text variant="h3" numberOfLines={1}>
            {p.storeName}
          </Text>
          <Text variant="small" muted numberOfLines={1}>
            {[formatDistance(p.distanceKm, state.settings.units), timeAgo(p.date), SOURCE_LABEL[p.source]].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {p.lat != null && p.lon != null && (
          <Button3D icon="navigate" tone="sky" size="sm" onPress={() => openDirections(p.lat!, p.lon!, p.storeName)} accessibilityLabel="Directions" />
        )}
      </View>
      {isStale(p.date) && (
        <Text variant="small" style={{ color: colors.textMuted }}>
          Heads up: this price was reported a while ago.
        </Text>
      )}
    </Card>
  );
}

function PriceRow({ p }: { p: PriceObservation }) {
  const { colors } = useTheme();
  const { state, dispatch } = useApp();
  const canNavigate = p.lat != null && p.lon != null;
  return (
    <Pressable
      onPress={() => canNavigate && openDirections(p.lat!, p.lon!, p.storeName)}
      onLongPress={() => p.source === 'mine' && dispatch({ type: 'priceRemove', id: p.id })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 12,
        borderRadius: radius.md,
        borderWidth: BORDER,
        borderColor: colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
      })}
    >
      <StoreBadge name={p.storeName} size={36} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {p.storeName}
        </Text>
        <Text variant="small" muted numberOfLines={1}>
          {[formatDistance(p.distanceKm, state.settings.units), timeAgo(p.date), SOURCE_LABEL[p.source]].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text variant="price" style={{ fontSize: 18 }}>
          {formatPrice(p.price, p.currency)}
        </Text>
        {p.isPromo && <Text variant="small" style={{ color: colors.success, fontFamily: fonts.bold }}>sale</Text>}
      </View>
    </Pressable>
  );
}

function NovaChip({ group }: { group: number }) {
  const { colors } = useTheme();
  const bg = ['#16A870', '#FFC53D', '#FF8A3D', '#E63E11'][group - 1] ?? colors.textMuted;
  const label = ['Unprocessed', 'Culinary ingredient', 'Processed', 'Ultra-processed'][group - 1] ?? `NOVA ${group}`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingLeft: 3, paddingRight: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 13, color: '#FFFFFF' }}>{group}</Text>
      </View>
      <Text variant="small" style={{ fontFamily: fonts.semibold }}>
        {label}
      </Text>
    </View>
  );
}

// UK FSA front-of-pack thresholds per 100 g — a well-known, simple "traffic light" guide.
const LEVELS: Partial<Record<keyof Nutrition, [number, number]>> = {
  fat: [3, 17.5],
  saturatedFat: [1.5, 5],
  sugars: [5, 22.5],
  salt: [0.3, 1.5],
};

const ROWS: { key: keyof Nutrition; label: string; unit: string; indent?: boolean }[] = [
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'saturatedFat', label: 'Saturated', unit: 'g', indent: true },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'sugars', label: 'Sugars', unit: 'g', indent: true },
  { key: 'fiber', label: 'Fibre', unit: 'g' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'salt', label: 'Salt', unit: 'g' },
];

function NutritionSection({ product }: { product: Product }) {
  const { colors } = useTheme();
  const [basis, setBasis] = useState<'100g' | 'serving'>('100g');
  const [showIngredients, setShowIngredients] = useState(false);
  const n = basis === 'serving' && product.nutritionServing ? product.nutritionServing : product.nutrition100g;
  const hasData = useMemo(() => Object.values(product.nutrition100g).some((v) => v != null), [product]);

  const level = (key: keyof Nutrition, v?: number) => {
    const t = LEVELS[key];
    if (!t || v == null || basis !== '100g') return undefined;
    return v <= t[0] ? { c: colors.success, l: 'Low' } : v > t[1] ? { c: colors.primary, l: 'High' } : { c: colors.sun, l: 'Med' };
  };

  return (
    <View style={{ marginTop: 30 }}>
      <Text variant="h2" style={{ marginBottom: 12 }}>
        Nutrition
      </Text>
      {!hasData ? (
        <Text muted>No nutrition facts for this product yet.</Text>
      ) : (
        <Card contentStyle={{ padding: 16, gap: 14 }}>
          {product.nutritionServing && (
            <Segmented
              value={basis}
              onChange={setBasis}
              options={[
                { value: '100g', label: 'Per 100 g/ml' },
                { value: 'serving', label: `Per serving${product.servingSize ? ` (${product.servingSize})` : ''}` },
              ]}
            />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 48, lineHeight: 50, color: colors.text }}>
              {n.energyKcal != null ? Math.round(n.energyKcal) : '—'}
            </Text>
            <Text variant="bodyStrong" muted style={{ marginBottom: 8 }}>
              kcal
            </Text>
          </View>
          {ROWS.map((r) => {
            const v = n[r.key];
            if (v == null) return null;
            const lv = level(r.key, v);
            // grams per 100 g is literally the share of the product by weight
            const pct = Math.min(100, v);
            return (
              <View key={r.key} style={{ gap: 6, paddingLeft: r.indent ? 14 : 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text variant={r.indent ? 'small' : 'bodyStrong'} muted={r.indent}>
                    {r.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {lv && (
                      <View style={{ backgroundColor: lv.c, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 }}>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 10, color: lv.c === colors.sun ? '#161616' : '#FFFFFF' }}>{lv.l}</Text>
                      </View>
                    )}
                    <Text variant="bodyStrong">
                      {v < 10 ? v.toFixed(1) : Math.round(v)} {r.unit}
                    </Text>
                  </View>
                </View>
                {!r.indent && r.key !== 'salt' && basis === '100g' && (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(2, pct)}%`, height: '100%', backgroundColor: lv?.c ?? colors.sky, borderRadius: 4 }} />
                  </View>
                )}
              </View>
            );
          })}
        </Card>
      )}

      {(product.allergens.length > 0 || product.traces.length > 0) && (
        <Card bg={colors.sunSoft} style={{ marginTop: 16 }} contentStyle={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="warning" size={20} color={colors.text} />
            <Text variant="h3">Allergens</Text>
          </View>
          {product.allergens.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {product.allergens.map((a) => (
                <View key={a} style={{ borderWidth: BORDER, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.surface }}>
                  <Text variant="small" style={{ fontFamily: fonts.bold, textTransform: 'capitalize' }}>
                    {a}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {product.traces.length > 0 && (
            <Text variant="small" muted style={{ textTransform: 'none' }}>
              May contain: {product.traces.join(', ')}
            </Text>
          )}
          <Text variant="small" muted>
            Crowdsourced data — always read the package if you have an allergy.
          </Text>
        </Card>
      )}

      {product.ingredients && (
        <Pressable onPress={() => setShowIngredients((s) => !s)} style={{ marginTop: 16 }}>
          <Card contentStyle={{ padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="h3">Ingredients</Text>
              <Ionicons name={showIngredients ? 'chevron-up' : 'chevron-down'} size={18} color={colors.text} />
            </View>
            <Text variant="small" muted numberOfLines={showIngredients ? undefined : 2}>
              {product.ingredients}
            </Text>
          </Card>
        </Pressable>
      )}
    </View>
  );
}
