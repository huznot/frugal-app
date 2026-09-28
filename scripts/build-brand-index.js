// Builds src/services/brandIndex.json from the OpenStreetMap Name Suggestion Index (BSD-3).
// Maps normalized store names -> Wikidata IDs, so the app can look up each chain's
// official logo on Wikidata / Wikimedia Commons. Re-run occasionally: npm run brands
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
  'supermarket', 'convenience', 'department_store', 'wholesale', 'greengrocer', 'butcher', 'bakery', 'health_food', 'deli',
  'chemist', 'variety_store', 'general', 'books', 'electronics', 'mobile_phone', 'computer', 'hardware', 'doityourself',
  'pet', 'sports', 'outdoor', 'toys', 'stationery', 'furniture', 'houseware', 'clothes', 'shoes', 'cosmetics', 'alcohol',
  'beverages', 'garden_centre', 'video_games', 'gift', 'baby_goods', 'appliance', 'optician', 'craft', 'music',
  'amenity/pharmacy', // drugstores like Shoppers Drug Mart and London Drugs live under amenity=*
];
const COUNTRIES = ['ca', 'us', 'gb', 'ie', 'au', 'nz', '001'];

const norm = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

(async () => {
  const index = {};
  for (const cat of CATEGORIES) {
    const url = `https://raw.githubusercontent.com/osmlab/name-suggestion-index/main/data/brands/${cat.includes('/') ? cat : `shop/${cat}`}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('skip', cat, res.status);
      continue;
    }
    const { items } = await res.json();
    let n = 0;
    for (const item of items) {
      const qid = item.tags?.['brand:wikidata'];
      const include = item.locationSet?.include ?? [];
      const country = include.map(String).find((c) => COUNTRIES.includes(c.toLowerCase()));
      if (!qid || !country) continue;
      const names = new Set([item.tags.brand, item.tags.name, item.displayName.replace(/\s*\(.*\)$/, ''), ...(item.matchNames ?? [])].filter(Boolean).map(norm));
      for (const name of names) {
        if (name.length < 2) continue;
        const list = (index[name] ??= []);
        if (!list.some(([q]) => q === qid)) list.push([qid, country.toUpperCase()]);
      }
      n++;
    }
    console.log(cat, n);
  }
  const out = path.join(__dirname, '..', 'src', 'services', 'brandIndex.json');
  fs.writeFileSync(out, JSON.stringify(index));
  console.log('brands:', Object.keys(index).length, 'bytes:', fs.statSync(out).size);
})();
