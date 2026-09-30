export type Nutrition = {
  energyKcal?: number;
  fat?: number;
  saturatedFat?: number;
  carbs?: number;
  sugars?: number;
  fiber?: number;
  protein?: number;
  salt?: number;
};

export type ProductSummary = {
  code: string;
  name: string;
  brand?: string;
  quantity?: string;
  imageUrl?: string;
  nutriscore?: string;
};

export type Product = ProductSummary & {
  nova?: number;
  allergens: string[];
  traces: string[];
  labels: string[];
  ingredients?: string;
  servingSize?: string;
  nutrition100g: Nutrition;
  nutritionServing?: Nutrition;
};

export type PriceSource = 'openprices' | 'kroger' | 'mine';

export type PriceObservation = {
  id: string;
  source: PriceSource;
  price: number;
  currency: string;
  storeName: string;
  storeAddress?: string;
  lat?: number;
  lon?: number;
  date: string; // ISO
  isPromo?: boolean;
  regularPrice?: number;
  per?: 'unit' | 'kg';
  online?: boolean;
  distanceKm?: number;
};

export type StoreKind = 'supermarket' | 'convenience' | 'specialty' | 'wholesale';

export type Store = {
  id: string;
  name: string;
  brand?: string;
  wikidata?: string; // OSM brand:wikidata — used to fetch the real logo
  kind: StoreKind;
  lat: number;
  lon: number;
  address?: string;
  openingHours?: string;
  website?: string;
  phone?: string;
  distanceKm?: number;
};

export type UserLocation = {
  lat: number;
  lon: number;
  label: string;
  countryCode?: string;
  source: 'gps' | 'manual';
};

/** A store's listed price for a product (Google Shopping via our proxy). */
export type Offer = {
  id: string;
  title: string;
  price: number;
  currency: string;
  seller: string; // cleaned store name, e.g. "Walmart"
  thumbnail?: string;
  link?: string;
  rating?: number;
  reviews?: number;
  local: boolean; // a physical store chain (vs online-only marketplace)
  online: boolean; // sold online only — not a store chain at all
  nearbyStore: boolean; // a branch within your search radius (or Google says it's in stock nearby)
  inStockNearby: boolean; // Google reports this item in stock at a store near the user
  oldPrice?: number; // regular price when on sale
  tag?: string; // e.g. "6% OFF"
  distanceKm?: number; // to the nearest branch of that chain
  lat?: number;
  lon?: number;
  match?: 'exact' | 'variant' | 'related'; // AI: the product the shopper meant, another kind, or related
  sizeLabel?: string; // e.g. "2 L", "12 x 200 g"
  sizeEstimated?: boolean; // size not in the listing; AI estimate of the standard pack
  unitPrice?: number; // price per 100 mL / 100 g / item
  unitLabel?: string; // "/100 mL", "/100 g", "/ea"
  best?: boolean; // best value (lowest price per amount) for what the shopper meant
  cheapest?: boolean; // lowest price for what the shopper meant
};
