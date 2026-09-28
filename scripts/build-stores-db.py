"""
Builds Frugal's own store database from Overture Maps Places (open data, CDLA-Permissive-2.0 /
ODbL for OpenStreetMap-derived records), so the Map tab never depends on overloaded public servers.

  pip install duckdb
  python scripts/build-stores-db.py CA        # writes proxy/data/stores-CA.sql
  npx wrangler d1 execute frugal-stores --remote --file=proxy/data/stores-CA.sql   (from proxy/)

Re-run every few months to pick up new/closed stores.
"""
import os
import sys
import time

import duckdb

RELEASE = os.environ.get("OVERTURE_RELEASE", "2026-09-23.1")
COUNTRY = (sys.argv[1] if len(sys.argv) > 1 else "CA").upper()
BBOX = {  # rough country bounding boxes; rows are also filtered by address country
    "CA": (-141.1, 41.6, -52.5, 70.0),
    "US": (-125.0, 24.4, -66.9, 49.5),
}[COUNTRY]

# Overture taxonomy → the app's store kinds
KINDS = {
    "grocery_store": "supermarket",
    "supermarket": "supermarket",
    "organic_grocery_store": "supermarket",
    "international_grocery_store": "supermarket",
    "warehouse_club_store": "wholesale",
    "wholesale_grocer": "wholesale",
    "convenience_store": "convenience",
    "food_and_beverage_store": "specialty",
    "specialty_foods_store": "specialty",
    "health_food_store": "specialty",
    "butcher_shop": "specialty",
    "fruits_and_vegetables_store": "specialty",
    "bakery": "specialty",
    "department_store": "supermarket",  # Walmart / Target / Giant Tiger carry groceries
}

out_dir = os.path.join(os.path.dirname(__file__), "..", "proxy", "data")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, f"stores-{COUNTRY}.sql")

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
base = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"
xmin, ymin, xmax, ymax = BBOX
cats = ",".join(f"'{c}'" for c in KINDS)

t = time.time()
rows = con.execute(
    f"""
    SELECT id,
           names.primary AS name,
           brand.names.primary AS brand,
           brand.wikidata AS wikidata,
           taxonomy.primary AS tax,
           (bbox.ymin + bbox.ymax) / 2 AS lat,
           (bbox.xmin + bbox.xmax) / 2 AS lon,
           addresses[1].freeform AS street,
           addresses[1].locality AS city,
           phones[1] AS phone,
           websites[1] AS website
    FROM read_parquet('{base}', hive_partitioning=1)
    WHERE bbox.xmin BETWEEN {xmin} AND {xmax}
      AND bbox.ymin BETWEEN {ymin} AND {ymax}
      AND taxonomy.primary IN ({cats})
      AND coalesce(addresses[1].country, '{COUNTRY}') = '{COUNTRY}'
      AND confidence >= 0.6
      AND coalesce(operating_status, 'open') = 'open'
      AND names.primary IS NOT NULL
      -- department stores only when they're a chain (Walmart, Giant Tiger…), not every boutique
      AND (taxonomy.primary <> 'department_store' OR brand.names.primary IS NOT NULL)
    """
).fetchall()
print(f"{COUNTRY}: {len(rows)} stores in {time.time() - t:.0f}s")


def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''")[:200] + "'"


with open(out_path, "w", encoding="utf-8") as f:
    f.write(f"DELETE FROM stores WHERE country = '{COUNTRY}';\n")
    batch = []
    for (id_, name, brand, wd, tax, lat, lon, street, city, phone, website) in rows:
        address = ", ".join(x for x in (street, city) if x) or None
        batch.append(
            f"({q(id_)},{q(name)},{q(brand)},{q(wd)},{q(KINDS.get(tax, 'specialty'))},{lat:.6f},{lon:.6f},{q(address)},{q(phone)},{q(website)},'{COUNTRY}')"
        )
        if len(batch) == 400:
            f.write("INSERT OR REPLACE INTO stores (id,name,brand,wikidata,kind,lat,lon,address,phone,website,country) VALUES " + ",".join(batch) + ";\n")
            batch = []
    if batch:
        f.write("INSERT OR REPLACE INTO stores (id,name,brand,wikidata,kind,lat,lon,address,phone,website,country) VALUES " + ",".join(batch) + ";\n")
print("wrote", out_path)
