import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Text from './Text';
import Button3D from './Button3D';
import { GradeChip, PriceTag, StoreBadge, Sticker } from './Badges';
import { ProductImage, Skeleton } from './Common';
import { Sheet } from './Sheets';
import { formatPrice } from './format';
import { fonts, radius, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { formatDistance } from '../services/geo';
import { openDirections, openWeb } from '../services/links';
import { findProductForTitle, getProduct } from '../services/openFoodFacts';
import { deviceCountry } from '../services/location';
import { Offer, Product } from '../services/types';

export const formatUnitPrice = (o: Offer) =>
  o.unitPrice != null && o.unitLabel ? `${o.sizeEstimated ? '~' : ''}${formatPrice(o.unitPrice, o.currency)}${o.unitLabel}${o.sizeEstimated ? ' est.' : ''}` : undefined;

/** "/100 mL" → "per 100 mL", "/ea" → "per item". */
const perWords = (unitLabel?: string) => (unitLabel === '/ea' ? 'per item' : unitLabel ? `per ${unitLabel.slice(1)}` : undefined);

/** Where you can buy it, in plain words: a store near you, or online (and why). */
export function availability(offer: Offer, units: 'km' | 'mi') {
  const km = offer.distanceKm != null ? ` · ${formatDistance(offer.distanceKm, units)}` : '';
  if (offer.nearbyStore) return { inStore: true, text: `${offer.inStockNearby ? 'In stock at a store nearby' : 'Store nearby'}${km}` };
  return { inStore: false, text: offer.storeChain ? 'Online · no store near you' : 'Online only · delivered' };
}

export type OfferFilter = 'all' | 'store' | 'online' | 'sale';

const FILTERS: { value: OfferFilter; label: string; icon: keyof typeof Ionicons.glyphMap; test: (o: Offer) => boolean }[] = [
  { value: 'all', label: 'All', icon: 'apps', test: () => true },
  { value: 'store', label: 'Stores near me', icon: 'storefront', test: (o) => o.nearbyStore },
  { value: 'online', label: 'Online', icon: 'globe-outline', test: (o) => !o.nearbyStore },
  { value: 'sale', label: 'On sale', icon: 'pricetag', test: (o) => o.oldPrice != null || !!o.tag },
];

export const filterOffers = (offers: Offer[], f: OfferFilter) => offers.filter(FILTERS.find((x) => x.value === f)!.test);

/** Quick filters over the results: stores near me, online, on sale. Empty filters are hidden. */
export function OfferFilters({ offers, value, onChange, style }: { offers: Offer[]; value: OfferFilter; onChange: (f: OfferFilter) => void; style?: object }) {
  const { colors } = useTheme();
  const { haptic } = useApp();
  if (offers.length < 2) return null;
  const shown = FILTERS.map((f) => ({ ...f, count: offers.filter(f.test).length })).filter((f) => f.value === 'all' || f.value === value || f.count > 0);
  if (shown.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 8 }, style]}>
      {shown.map((f) => {
        const on = value === f.value;
        return (
          <Pressable
            key={f.value}
            onPress={() => {
              haptic('light');
              onChange(on && f.value !== 'all' ? 'all' : f.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${f.label}, ${f.count} prices`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              height: 34,
              paddingHorizontal: 12,
              borderRadius: radius.pill,
              borderWidth: on ? 0 : 1,
              borderColor: colors.border,
              backgroundColor: on ? colors.ink : colors.surface,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            })}
          >
            <Ionicons name={f.icon} size={14} color={on ? colors.onInk : colors.text} />
            <Text variant="small" style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? colors.onInk : colors.text }}>
              {f.value === 'all' ? f.label : `${f.label} (${f.count})`}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** What the two markers mean, shown above results that carry them. */
export function ValueLegend({ offers, style }: { offers: Offer[]; style?: object }) {
  const { colors } = useTheme();
  const best = offers.find((o) => o.best);
  const cheapest = offers.find((o) => o.cheapest);
  if (!best && !cheapest) return null;
  const per = perWords(best?.unitLabel);
  return (
    <View style={[{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 10, gap: 6 }, style]}>
      {best && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sticker label="BEST VALUE" bg={colors.success} />
          <Text variant="small" muted style={{ flex: 1, fontSize: 12 }}>
            {per ? `Lowest price ${per}, the most for your money` : 'Lowest price for what you searched'}
          </Text>
        </View>
      )}
      {cheapest && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Sticker label="CHEAPEST" bg={colors.sky} />
          <Text variant="small" muted style={{ flex: 1, fontSize: 12 }}>
            Lowest total at checkout, whatever the pack size
          </Text>
        </View>
      )}
    </View>
  );
}

export function OfferRow({ offer, onPress }: { offer: Offer; onPress: () => void }) {
  const { colors } = useTheme();
  const { state } = useApp();
  const where = availability(offer, state.settings.units);
  const unit = formatUnitPrice(offer);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        offer.title,
        `${formatPrice(offer.price, offer.currency)} at ${offer.seller}`,
        unit,
        where.text,
        offer.best ? 'best value' : '',
        offer.cheapest ? 'cheapest' : '',
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: 12,
        padding: 12,
        borderRadius: radius.lg,
        borderWidth: offer.best || offer.cheapest ? 2 : 1,
        borderColor: offer.best ? colors.success : offer.cheapest ? colors.sky : colors.border,
        backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        transform: [{ scale: pressed ? 0.99 : 1 }],
      })}
    >
      <ProductImage uri={offer.thumbnail} size={68} />
      <View style={{ flex: 1, gap: 5 }}>
        <Text variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={2}>
          {offer.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <StoreBadge name={offer.seller} size={24} />
          <Text variant="small" muted numberOfLines={1} style={{ flexShrink: 1, fontFamily: fonts.semibold }}>
            {offer.seller}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name={where.inStore ? 'storefront' : 'globe-outline'} size={13} color={where.inStore ? colors.success : colors.sky} />
          <Text variant="small" numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: where.inStore ? colors.success : colors.sky, fontFamily: fonts.medium }}>
            {where.text}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 76 }}>
        <View style={{ alignItems: 'flex-end' }}>
          {/* Each marker's colour sits on the number it's about: the total for cheapest, the price
              per amount for best value. */}
          <Text variant="price" style={{ fontSize: 19, color: offer.cheapest ? colors.sky : colors.text }}>
            {formatPrice(offer.price, offer.currency)}
          </Text>
          {offer.oldPrice != null && (
            <Text variant="small" muted style={{ textDecorationLine: 'line-through', fontSize: 12 }}>
              {formatPrice(offer.oldPrice, offer.currency)}
            </Text>
          )}
          {unit && (
            <Text
              variant="small"
              muted={!offer.best}
              style={{ fontSize: offer.best ? 12 : 11, color: offer.best ? colors.success : undefined, fontFamily: offer.best ? fonts.semibold : undefined }}
            >
              {unit}
            </Text>
          )}
        </View>
        {offer.best || offer.cheapest ? (
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {offer.best && <Sticker label="BEST VALUE" bg={colors.success} />}
            {offer.cheapest && <Sticker label="CHEAPEST" bg={colors.sky} />}
          </View>
        ) : offer.tag ? (
          <Sticker label={offer.tag.toUpperCase()} bg={colors.primary} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function OfferSkeleton() {
  return (
    <View style={{ gap: 10 }}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Skeleton style={{ width: 68, height: 68, borderRadius: 14 }} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton style={{ height: 14, width: '85%' }} />
            <Skeleton style={{ height: 12, width: '50%' }} />
          </View>
          <Skeleton style={{ width: 56, height: 22 }} />
        </View>
      ))}
    </View>
  );
}

/** Details for one store listing, with nutrition facts for that exact product. */
export function OfferSheet({ offer, onClose, isFood = true }: { offer: Offer | null; onClose: () => void; isFood?: boolean }) {
  if (!offer) return null;
  return (
    <Sheet visible onClose={onClose} title={offer.seller}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <OfferDetails key={offer.id} offer={offer} onClose={onClose} isFood={isFood} />
      </ScrollView>
    </Sheet>
  );
}

function OfferDetails({ offer, onClose, isFood }: { offer: Offer; onClose: () => void; isFood: boolean }) {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { state, dispatch, haptic } = useApp();
  const [added, setAdded] = useState(false);
  const [facts, setFacts] = useState<Product | null | undefined>(undefined); // undefined = loading

  // Look up nutrition for this exact listing as soon as the sheet opens.
  useEffect(() => {
    if (!isFood) return; // nutrition only makes sense for food & drink
    let alive = true;
    findProductForTitle(offer.title, state.location?.countryCode ?? deviceCountry())
      .then((match) => (match ? getProduct(match.code) : null))
      .then((p) => alive && setFacts(p))
      .catch(() => alive && setFacts(null));
    return () => {
      alive = false;
    };
  }, [offer.title, state.location?.countryCode, isFood]);

  const unit = formatUnitPrice(offer);
  const n = facts?.nutrition100g;
  const stat = (label: string, v?: number, suffix = 'g') =>
    v == null ? null : (
      <View key={label} style={{ alignItems: 'center', flex: 1 }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.text }}>
          {v < 10 && suffix === 'g' ? v.toFixed(1) : Math.round(v)}
          <Text variant="small" muted>
            {suffix === 'g' ? ' g' : ''}
          </Text>
        </Text>
        <Text variant="small" muted style={{ fontSize: 11 }}>
          {label}
        </Text>
      </View>
    );

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <ProductImage uri={offer.thumbnail} size={84} />
        <View style={{ flex: 1, gap: 8 }}>
          <Text variant="bodyStrong" numberOfLines={3}>
            {offer.title}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <PriceTag price={formatPrice(offer.price, offer.currency)} big />
            {unit && (
              <Text variant="small" muted>
                {[offer.sizeLabel, unit].filter(Boolean).join(' · ')}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <StoreBadge name={offer.seller} size={36} />
        <Text variant="small" muted style={{ flex: 1 }}>
          {offer.inStockNearby
            ? `In stock at a ${offer.seller} near you${offer.distanceKm != null ? ` · ${formatDistance(offer.distanceKm, state.settings.units)}` : ''}`
            : offer.nearbyStore
              ? `Nearest ${offer.seller} is ${offer.distanceKm != null ? `${formatDistance(offer.distanceKm, state.settings.units)} away` : 'near you'}. In-store prices can differ.`
              : offer.storeChain
                ? `No ${offer.seller} store near you, so this is an online price (delivery or shipping).`
                : `Online only · sold and shipped by ${offer.seller}`}
          {offer.rating ? ` · ★ ${offer.rating}${offer.reviews ? ` (${offer.reviews})` : ''}` : ''}
        </Text>
      </View>

      {(offer.best || offer.cheapest) && (
        <View style={{ gap: 6 }}>
          {offer.best && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sticker label="BEST VALUE" bg={colors.success} />
              <Text variant="small" muted style={{ flex: 1, fontSize: 12 }}>
                {unit ? `Lowest price ${perWords(offer.unitLabel)} (${unit})` : 'Lowest price for what you searched'}
              </Text>
            </View>
          )}
          {offer.cheapest && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Sticker label="CHEAPEST" bg={colors.sky} />
              <Text variant="small" muted style={{ flex: 1, fontSize: 12 }}>
                Lowest total price ({formatPrice(offer.price, offer.currency)})
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Nutrition for this product (food & drink only) */}
      {isFood && (
      <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="eyebrow">Nutrition · per 100 g/mL</Text>
          {facts?.nutriscore && <GradeChip grade={facts.nutriscore} compact />}
        </View>
        {facts === undefined ? (
          <Skeleton style={{ height: 40 }} />
        ) : n && Object.values(n).some((v) => v != null) ? (
          <>
            <View style={{ flexDirection: 'row' }}>
              {stat('kcal', n.energyKcal, '')}
              {stat('protein', n.protein)}
              {stat('sugars', n.sugars)}
              {stat('fat', n.fat)}
            </View>
            {facts!.allergens.length > 0 && (
              <Text variant="small" muted>
                Contains: {facts!.allergens.join(', ')}
              </Text>
            )}
            <Pressable
              onPress={() => {
                onClose();
                navigation.navigate('Product', { code: facts!.code, preview: facts! });
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
                Full nutrition & ingredients
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </Pressable>
          </>
        ) : (
          <Text variant="small" muted>
            No nutrition facts on record for this product yet.
          </Text>
        )}
      </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {offer.lat != null && offer.lon != null && (
          <Button3D title="Directions" icon="navigate" tone="sky" style={{ flex: 1 }} onPress={() => openDirections(offer.lat!, offer.lon!, offer.seller)} />
        )}
        {offer.link && <Button3D title="View deal" icon="open-outline" tone="neutral" style={{ flex: 1 }} onPress={() => openWeb(offer.link!)} />}
      </View>
      <Button3D
        title={added ? 'Added!' : 'Add to list'}
        tone={added ? 'success' : 'primary'}
        onPress={() => {
          dispatch({
            type: 'listAdd',
            item: { name: offer.title, imageUrl: offer.thumbnail, price: offer.price, currency: offer.currency, store: offer.seller },
          });
          haptic('success');
          setAdded(true);
        }}
      />
      <Text variant="small" muted center style={{ fontSize: 11 }}>
        Listed price from Google Shopping. Prices can vary by store and change without notice.
      </Text>
    </View>
  );
}
