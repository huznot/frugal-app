// Store "icons" are monogram stickers in each chain's signature colour. We deliberately
// do NOT ship retailer logos: logos are trademarks and need the owner's permission.
// Names/colours used to identify a store are fine (nominative use). To use real logos,
// get written permission (or a licensed feed) and add them here.

type BrandStyle = { mono: string; bg: string; fg: string };

const BRANDS: [RegExp, BrandStyle][] = [
  [/walmart/i, { mono: 'W', bg: '#0071CE', fg: '#FFC220' }],
  [/superstore/i, { mono: 'SS', bg: '#E31837', fg: '#FFFFFF' }],
  [/no ?frills/i, { mono: 'NF', bg: '#FFD200', fg: '#1C1B1F' }],
  [/loblaw/i, { mono: 'L', bg: '#E2231A', fg: '#FFFFFF' }],
  [/costco/i, { mono: 'C', bg: '#005DAA', fg: '#E31837' }],
  [/safeway/i, { mono: 'S', bg: '#E21A23', fg: '#FFFFFF' }],
  [/sobeys/i, { mono: 'So', bg: '#1E7B3B', fg: '#FFFFFF' }],
  [/save[- ]?on/i, { mono: 'SO', bg: '#E4002B', fg: '#FFFFFF' }],
  [/freshco/i, { mono: 'F', bg: '#7AB829', fg: '#FFFFFF' }],
  [/co-?op/i, { mono: 'Co', bg: '#00843D', fg: '#FFFFFF' }],
  [/\biga\b/i, { mono: 'IGA', bg: '#D6001C', fg: '#FFFFFF' }],
  [/metro/i, { mono: 'M', bg: '#E30613', fg: '#FFFFFF' }],
  [/food basics/i, { mono: 'FB', bg: '#FFE600', fg: '#1C1B1F' }],
  [/giant tiger/i, { mono: 'GT', bg: '#000000', fg: '#FFD100' }],
  [/shoppers/i, { mono: 'SD', bg: '#D6001C', fg: '#FFFFFF' }],
  [/london drugs/i, { mono: 'LD', bg: '#004B8D', fg: '#FFFFFF' }],
  [/dollarama/i, { mono: '$', bg: '#00843D', fg: '#FFD100' }],
  [/7-?eleven/i, { mono: '7', bg: '#008163', fg: '#FF6F00' }],
  [/kroger/i, { mono: 'K', bg: '#0A5CA8', fg: '#FFFFFF' }],
  [/target/i, { mono: 'T', bg: '#CC0000', fg: '#FFFFFF' }],
  [/whole foods/i, { mono: 'WF', bg: '#00674B', fg: '#FFFFFF' }],
  [/trader joe/i, { mono: 'TJ', bg: '#BA0C2F', fg: '#FFFFFF' }],
  [/aldi/i, { mono: 'A', bg: '#00005F', fg: '#FF7800' }],
  [/lidl/i, { mono: 'Li', bg: '#0050AA', fg: '#FFF000' }],
  [/publix/i, { mono: 'P', bg: '#3D8F3D', fg: '#FFFFFF' }],
  [/h-?e-?b/i, { mono: 'H', bg: '#E31837', fg: '#FFFFFF' }],
  [/albertsons/i, { mono: 'Al', bg: '#00539F', fg: '#FFFFFF' }],
  [/tesco/i, { mono: 'T', bg: '#00539F', fg: '#EE1C2E' }],
  [/sainsbury/i, { mono: 'S', bg: '#F06C00', fg: '#FFFFFF' }],
];

const FALLBACK = ['#FF5A45', '#1DB37A', '#5B8CFF', '#FFC53D', '#A66CFF', '#FF8A3D', '#26B5C9'];

export function brandStyle(name: string): BrandStyle {
  for (const [re, style] of BRANDS) if (re.test(name)) return style;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const bg = FALLBACK[h % FALLBACK.length];
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean);
  const mono = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase();
  return { mono, bg, fg: bg === '#FFC53D' ? '#1C1B1F' : '#FFFFFF' };
}
