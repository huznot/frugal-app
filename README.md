# frugal

find the cheapest groceries near you. scan or search a product, see prices at stores around you, nutrition facts, and a map of nearby stores.

## what's in here

- `src/` the app (expo / react native)
- `proxy/` our small server on cloudflare. it gets prices, runs the ai, and holds the api keys so they never go in the app
- `scripts/` helper scripts (legal pages, store logos, store database)
- `docs/` the privacy policy, terms and licences pages

## run the app

```sh
npm install
npm run go
```

scan the qr code with your phone (expo go). the app talks to the live server, so you don't need to run anything else.

## the server

it's live at `https://frugal-proxy.frugalapp.workers.dev`.

to change it, edit `proxy/src`, then:

```sh
cd proxy
npm install
npx wrangler deploy
```

keys live in cloudflare, not in the code. to add or change one:

```sh
npx wrangler secret put BRIGHTDATA_API_KEY
```

keys it uses: `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE`, `SERPAPI_KEY`, `GEMINI_API_KEY`, `APP_KEY`. for local testing put them in `proxy/.dev.vars` (git ignores it) and run `npm run dev`.

## where the data comes from

- prices: google shopping through bright data (serpapi as backup)
- products and nutrition: open food facts
- barcodes: open library (books), open food facts, upcitemdb
- stores: overture maps, loaded into our own database
- store logos: wikidata
- ai (understanding searches, ranking, photo scan): cloudflare workers ai

## update the store database

run this every few months to pick up new or closed stores:

```sh
pip install duckdb
python scripts/build-stores-db.py CA
cd proxy
npx wrangler d1 execute frugal-stores --remote --file=data/stores-CA.sql
```

use `US` instead of `CA` to add the united states.

## legal pages

they're live at:

- https://frugal-legal.pages.dev/privacy-policy
- https://frugal-legal.pages.dev/terms
- https://frugal-legal.pages.dev/licenses

to change them, edit `src/legal/business.json` or `src/legal/documents.json`, then:

```sh
npm run legal
cd proxy
npx wrangler pages deploy ../docs --project-name frugal-legal --branch main
```

## handy commands

- `npm run go` start the app for expo go
- `npm run typecheck` check for type errors
- `npm run legal` rebuild the legal pages
- `npm run brands` refresh the store brand list
