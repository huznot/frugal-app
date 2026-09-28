import React, { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Text, { Highlight, Logo } from '../components/Text';
import Button3D from '../components/Button3D';
import { GradeChip, PriceTag, StoreBadge } from '../components/Badges';
import { ProductImage } from '../components/Common';
import { LegalModal, LocationPicker } from '../components/Sheets';
import { fonts, radius, softShadow, useTheme } from '../theme';
import { useApp } from '../state/AppState';
import { APP_CONFIG } from '../config';
import { LegalDocKey } from '../legal';

type Slide = { key: string; eyebrow: string; title: string; highlight: string; body: string };

const SLIDES: Slide[] = [
  { key: 'scan', eyebrow: 'Welcome to Frugal', title: 'Scan it.', highlight: 'Save it.', body: 'Point your camera at any barcode. Frugal finds the product and the best price near you in a blink.' },
  { key: 'nutrition', eyebrow: 'Nutrition', title: "Know what's", highlight: 'inside', body: 'Calories, protein, sugar, allergens and health grades for millions of products.' },
  { key: 'location', eyebrow: 'Nearby', title: 'Stores around', highlight: 'the corner', body: "Tell us roughly where you shop to see nearby stores and prices. It's optional and stays on your phone." },
  { key: 'ready', eyebrow: 'All set', title: 'Ready to shop', highlight: 'smarter?', body: 'Build a list, log prices you spot, and stop overpaying for groceries.' },
];

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { state, dispatch, haptic } = useApp();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [doc, setDoc] = useState<LegalDocKey | null>(null);
  const last = index === SLIDES.length - 1;
  const illoHeight = Math.min(270, Math.max(150, height * 0.34 - 60)); // smaller on short phones so the whole slide fits

  // onMomentumScrollEnd doesn't fire for programmatic scrolls, so track the index here too.
  const goTo = (i: number) => {
    setIndex(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  };

  const finish = () => {
    haptic('success');
    dispatch({ type: 'completeOnboarding', legalVersion: APP_CONFIG.legalVersion });
  };

  const renderSlide = ({ item, index: i }: { item: Slide; index: number }) => {
    return (
      <ScrollView
        style={{ width }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: insets.top + 70, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ height: illoHeight }}>
          <Illustration kind={item.key} size={illoHeight} />
        </View>
        <Text variant="eyebrow" style={{ marginTop: 24 }}>
          {item.eyebrow}
        </Text>
        <Text variant="hero" style={{ marginTop: 8 }}>
          {item.title}
        </Text>
        <Highlight>{item.highlight}</Highlight>
        <Text muted style={{ marginTop: 12, fontSize: 15 }}>
          {item.body}
        </Text>

        {item.key === 'location' && (
          <View style={{ marginTop: 20 }}>
            {state.location ? (
              <View style={[styles.done, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {state.location.label}
                </Text>
                <Pressable onPress={() => dispatch({ type: 'location', location: undefined })} hitSlop={10}>
                  <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
                    Change
                  </Text>
                </Pressable>
              </View>
            ) : (
              <LocationPicker onDone={() => setTimeout(() => goTo(i + 1), 500)} />
            )}
          </View>
        )}

        {item.key === 'ready' && (
          <Pressable
            onPress={() => {
              haptic('light');
              setAgreed((a) => !a);
            }}
            style={[styles.agree, { backgroundColor: colors.surfaceAlt }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
          >
            <View style={[styles.box, { borderColor: agreed ? colors.primary : colors.textMuted, backgroundColor: agreed ? colors.primary : 'transparent' }]}>
              {agreed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
            </View>
            <Text variant="small" style={{ flex: 1 }}>
              I'm at least 13 and I agree to the{' '}
              <Text variant="small" style={[styles.link, { color: colors.primary }]} onPress={() => setDoc('terms')}>
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text variant="small" style={[styles.link, { color: colors.primary }]} onPress={() => setDoc('privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  };

  const onLocationSlide = SLIDES[index].key === 'location' && !state.location;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      />

      <View style={{ position: 'absolute', top: insets.top + 16, left: 24, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={30} />
        {!last && (
          <Pressable onPress={() => goTo(SLIDES.length - 1)} style={{ padding: 8 }} hitSlop={10} accessibilityRole="button">
            <Text variant="bodyStrong" muted>
              Skip
            </Text>
          </Pressable>
        )}
      </View>

      <View style={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center' }}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? colors.primary : colors.border }} />
          ))}
        </View>
        {last ? (
          <Button3D title="Get started" size="lg" onPress={finish} disabled={!agreed} />
        ) : (
          <Button3D
            title={onLocationSlide ? 'Maybe later' : 'Next'}
            size="lg"
            tone={onLocationSlide ? 'neutral' : 'primary'}
            onPress={() => goTo(index + 1)}
          />
        )}
      </View>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </View>
  );
}

/**
 * Each slide previews the real app: the same components the screens use, with real
 * store logos (Wikidata) and a real product photo (Open Food Facts).
 */
const SAMPLE_PRODUCT = 'https://images.openfoodfacts.org/images/products/006/870/010/0185/front_en.7.200.jpg';

function Illustration({ kind, size }: { kind: string; size: number }) {
  const { colors } = useTheme();
  const panel = (children: React.ReactNode) => (
    <View style={styles.illo}>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, transform: [{ scale: Math.min(1, size / 250) }] }, softShadow]}>{children}</View>
    </View>
  );

  if (kind === 'scan')
    return (
      <View style={styles.illo}>
        <View style={[styles.viewfinder, { height: size * 0.66, marginBottom: size * 0.2 }]}>
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <View
              key={c}
              style={{
                position: 'absolute',
                width: 26,
                height: 26,
                borderColor: colors.sun,
                top: c[0] === 't' ? 12 : undefined,
                bottom: c[0] === 'b' ? 12 : undefined,
                left: c[1] === 'l' ? 12 : undefined,
                right: c[1] === 'r' ? 12 : undefined,
                borderTopWidth: c[0] === 't' ? 4 : 0,
                borderBottomWidth: c[0] === 'b' ? 4 : 0,
                borderLeftWidth: c[1] === 'l' ? 4 : 0,
                borderRightWidth: c[1] === 'r' ? 4 : 0,
                borderRadius: 4,
              }}
            />
          ))}
          <ProductImage uri={SAMPLE_PRODUCT} size={size * 0.44} style={{ borderWidth: 0 }} />
          <View style={{ position: 'absolute', left: 30, right: 30, top: '55%', height: 2, backgroundColor: colors.primary, borderRadius: 1 }} />
        </View>
        <View style={[styles.toast, { backgroundColor: colors.surface, borderColor: colors.border }, softShadow]}>
          <StoreBadge name="Safeway" size={36} />
          <View style={{ flex: 1 }}>
            <Text variant="small" style={{ fontFamily: fonts.semibold }} numberOfLines={1}>
              2% Partly Skimmed Milk
            </Text>
            <Text variant="small" muted numberOfLines={1}>
              Cheapest nearby · 1.3 km
            </Text>
          </View>
          <PriceTag price="$4.29" />
        </View>
      </View>
    );

  if (kind === 'nutrition')
    return panel(
      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 38, lineHeight: 40, color: colors.text }}>53</Text>
            <Text variant="small" muted style={{ marginBottom: 5 }}>
              kcal / 100 ml
            </Text>
          </View>
          <GradeChip grade="b" compact />
        </View>
        {[
          { l: 'Fat', v: '1.9 g', w: 12, c: colors.success, t: 'Low' },
          { l: 'Sugars', v: '4.9 g', w: 22, c: colors.success, t: 'Low' },
          { l: 'Protein', v: '3.6 g', w: 18, c: colors.sky, t: '' },
        ].map((r) => (
          <View key={r.l} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="small" style={{ fontFamily: fonts.semibold }}>
                {r.l}
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                {!!r.t && (
                  <View style={{ backgroundColor: r.c, borderRadius: 99, paddingHorizontal: 7 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 9, color: '#FFFFFF' }}>{r.t}</Text>
                  </View>
                )}
                <Text variant="small" style={{ fontFamily: fonts.semibold }}>
                  {r.v}
                </Text>
              </View>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt }}>
              <View style={{ width: `${r.w}%`, height: '100%', borderRadius: 3, backgroundColor: r.c }} />
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <Ionicons name="warning" size={14} color={colors.sunLedge} />
          <Text variant="small" muted>
            Contains: milk
          </Text>
        </View>
      </View>,
    );

  if (kind === 'location')
    return panel(
      <View style={{ gap: 2 }}>
        {[
          { n: 'Walmart', a: 'Supercentre', d: '0.8 km' },
          { n: 'No Frills', a: 'Pembina Highway', d: '1.2 km' },
          { n: 'Save-On-Foods', a: 'Pembina Highway', d: '1.9 km' },
        ].map((st, i) => (
          <View key={st.n} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: colors.hairline }}>
            <StoreBadge name={st.n} size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="small" style={{ fontFamily: fonts.semibold }}>
                {st.n}
              </Text>
              <Text variant="small" muted numberOfLines={1}>
                {st.a}
              </Text>
            </View>
            <Text variant="small" style={{ fontFamily: fonts.semibold, color: colors.primary }}>
              {st.d}
            </Text>
          </View>
        ))}
      </View>,
    );

  return panel(
    <View style={{ gap: 2 }}>
      {[
        { n: 'Milk 2%, 4 L', p: '$5.79', done: true },
        { n: 'Large eggs, 12', p: '$4.49', done: true },
        { n: 'Bananas', p: '$1.54', done: false },
      ].map((it, i) => (
        <View key={it.n} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: colors.hairline }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: it.done ? colors.success : colors.textMuted,
              backgroundColor: it.done ? colors.success : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {it.done && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </View>
          <Text
            variant="small"
            style={{ flex: 1, fontFamily: fonts.semibold, textDecorationLine: it.done ? 'line-through' : 'none', color: it.done ? colors.textMuted : colors.text }}
          >
            {it.n}
          </Text>
          <Text variant="small" style={{ fontFamily: fonts.semibold }}>
            {it.p}
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderColor: colors.border }}>
        <Text variant="label" muted>
          Estimated total
        </Text>
        <PriceTag price="$11.82" />
      </View>
    </View>,
  );
}

const styles = StyleSheet.create({
  illo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { width: '100%', borderRadius: radius.xl, borderWidth: 1, padding: 18, overflow: 'hidden' },
  viewfinder: { width: '78%', borderRadius: radius.xl, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  toast: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, padding: 14 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22, borderRadius: radius.md, padding: 14 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: fonts.semibold, textDecorationLine: 'underline' },
});
