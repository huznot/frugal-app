CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  wikidata TEXT,
  kind TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  country TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS stores_lat_lon ON stores (lat, lon);
