import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Text, { Highlight, Logo } from '../components/Text';
import Card from '../components/Card';
import Button3D from '../components/Button3D';
import { Chip, GradeChip } from '../components/Badges';
import { ProductImage, SearchBar, SectionHeader } from '../components/Common';
import { LocationPicker, Sheet } from '../components/Sheets';
import { TAB_BAR_SPACE } from '../components/TabBar';
import { fonts, useTheme } from '../theme';
import { useApp } from '../state/AppState';

const CATEGORIES: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; tone: 'sun' | 'success' | 'sky' | 'primary' }[] = [
  { label: 'Milk', icon: 'cup', tone: 'sky' },
  { label: 'Eggs', icon: 'egg', tone: 'sun' },
  { label: 'Bread', icon: 'bread-slice', tone: 'primary' },
  { label: 'Apples', icon: 'food-apple', tone: 'success' },
  { label: 'Coffee', icon: 'coffee', tone: 'primary' },
  { label: 'Cheese', icon: 'cheese', tone: 'sun' },
  { label: 'Rice', icon: 'rice', tone: 'sky' },
  { label: 'Chicken', icon: 'food-drumstick', tone: 'primary' },
  { label: 'Pasta', icon: 'pasta', tone: 'success' },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState('');
  const [locOpen, setLocOpen] = useState(false);

  const search = (q: string) => {
    const t = q.trim();
    if (!t) return;
    dispatch({ type: 'recentSearch', query: t });
    navigation.navigate('Search', { query: t });
  };

  const soft = { sun: colors.sunSoft, success: colors.successSoft, sky: colors.skySoft, primary: colors.primarySoft };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: TAB_BAR_SPACE + insets.bottom }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <View>
          <Text variant="small" muted>
            {greeting()}
          </Text>
          <Pressable
            onPress={() => setLocOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
            accessibilityRole="button"
            accessibilityLabel="Change location"
          >
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text variant="bodyStrong" numberOfLines={1} style={{ maxWidth: 220 }}>
              {state.location?.label ?? 'Set your location'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.text} />
          </Pressable>
        </View>
        <Logo size={34} withName={false} />
      </View>

      <Text variant="eyebrow">Compare & save</Text>
      <Text variant="hero" style={{ marginTop: 6 }}>
        What are we
      </Text>
      <View style={{ marginBottom: 20 }}>
        <Highlight>buying today?</Highlight>
      </View>

      <SearchBar value={query} onChangeText={setQuery} onSubmit={() => search(query)} />

      <Card
        bg={colors.primary}
        style={{ marginTop: 20 }}
        contentStyle={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16 }}
        onPress={() => navigation.navigate('Tabs', { screen: 'Scan' } as never)}
        accessibilityLabel="Scan a barcode"
      >
        <View style={{ flex: 1 }}>
          <Text variant="h2" color="#FFFFFF">
            Scan a barcode
          </Text>
          <Text variant="small" color="rgba(255,255,255,0.92)" style={{ marginTop: 2 }}>
            Instant nutrition + prices near you
          </Text>
        </View>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="barcode-outline" size={34} color="#FFFFFF" />
        </View>
      </Card>

      <View style={{ marginTop: 28 }}>
        <SectionHeader title="Quick picks" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map((c) => (
            <Chip key={c.label} label={c.label} foodIcon={c.icon} tone={soft[c.tone]} onPress={() => search(c.label)} />
          ))}
        </View>
      </View>

      {state.recentSearches.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <SectionHeader title="Recent searches" action="Clear" onAction={() => dispatch({ type: 'clearHistory' })} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {state.recentSearches.map((s) => (
              <Chip key={s} label={s} icon="time-outline" onPress={() => search(s)} />
            ))}
          </View>
        </View>
      )}

      {state.recentProducts.length > 0 && (
        <View style={{ marginTop: 28 }}>
          <SectionHeader title="Recently viewed" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
            {state.recentProducts.map((p) => (
              <Card
                key={p.code}
                style={{ width: 150, paddingVertical: 6 }}
                contentStyle={{ padding: 12, gap: 8 }}
                onPress={() => navigation.navigate('Product', { code: p.code, preview: p })}
                accessibilityLabel={p.name}
              >
                <ProductImage uri={p.imageUrl} size={120} style={{ alignSelf: 'center', borderWidth: 0 }} />
                <Text variant="small" numberOfLines={2} style={{ fontFamily: fonts.semibold, minHeight: 38 }}>
                  {p.name}
                </Text>
                {p.nutriscore && <GradeChip grade={p.nutriscore} compact />}
              </Card>
            ))}
          </ScrollView>
        </View>
      )}

      {!state.location && (
        <Card style={{ marginTop: 28 }} bg={colors.skySoft} contentStyle={{ padding: 18, gap: 12 }}>
          <Text variant="h3">See prices & stores near you</Text>
          <Text variant="small" muted>
            Add your city or postal code to see what things cost around you.
          </Text>
          <Button3D title="Set location" icon="location" tone="sky" size="sm" onPress={() => setLocOpen(true)} style={{ alignSelf: 'flex-start' }} />
        </Card>
      )}

      <Sheet visible={locOpen} onClose={() => setLocOpen(false)} title="Your location">
        <LocationPicker onDone={() => setLocOpen(false)} />
      </Sheet>
    </ScrollView>
  );
}
