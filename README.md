# frugal (react native + expo)

> a camera-first price finder. snap a product, we ask gemini what it is, then search shopping results and map distances.

![Frugal Logo](assets/adaptive_icon.png)

## contents
- what this repo does
- quick start
- env vars you need
- getting api keys
- running the app
- troubleshooting

## about
- made for my ptec (pembina trails early college) mentorship project
## what this repo does
- capture a photo, describe it with gemini, query shopping results, and (optionally) measure distance to stores.
- built with expo sdk 54, react native 0.81, typescript.
- location + camera permissions are required for full functionality.

## quick start
1) install deps
   ```sh
   npm install
   ```
2) copy env template
   ```sh
   cp .env.example .env
   ```
3) fill in api keys (see below).
4) run
   ```sh
   npm start
   ```
   - press `a` for android emulator/device, `i` for ios simulator (mac), or scan the qr code with expo go.

## env vars you need
put these in `.env` (see `.env.example`):
```
EXPO_PUBLIC_SEARCH_API_KEY=...
EXPO_PUBLIC_GEMINI_API_KEY=...
EXPO_PUBLIC_ORS_API_KEY=...
EXPO_PUBLIC_GEMINI_MODEL=gemini-2.5-flash
```
- `EXPO_PUBLIC_...` vars are bundled into the client. if you need to keep keys truly secret, proxy through a backend instead of calling apis directly from the app.

## getting api keys
- searchapi.io (google shopping):
  - create an account at https://www.searchapi.io/.
  - grab your api key from the dashboard and set `EXPO_PUBLIC_SEARCH_API_KEY`.

- google generative language (gemini):
  - in google cloud console, enable **generative language api** for your project.
  - create an api key (apis & services -> credentials).
  - list available models for your key:
    ```sh
    curl "https://generativelanguage.googleapis.com/v1/models?key=$EXPO_PUBLIC_GEMINI_API_KEY"
    ```
  - pick a `name` value (e.g., `models/gemini-2.5-flash`, `models/gemini-1.5-pro`).
  - set `EXPO_PUBLIC_GEMINI_MODEL` to the name without the `models/` prefix (example: `gemini-2.5-flash`).

- openrouteservice (distance + geocoding):
  - sign up at https://openrouteservice.org/dev/ and create a token.
  - set `EXPO_PUBLIC_ORS_API_KEY` to that token.

## running the app
- start expo: `npm start`
- for android: `npm run android` (or press `a` in the expo cli)
- for ios (mac): `npm run ios` (or press `i`)
- for web: `npm run web` (note: camera/device apis may be limited in browser)

## troubleshooting
- 404 from gemini: make sure the generative language api is enabled and `EXPO_PUBLIC_GEMINI_MODEL` matches a model your key can use (see curl command above).
- distance shows “distance unavailable”: check `EXPO_PUBLIC_ORS_API_KEY` and that location permission was granted.
- search results empty: verify `EXPO_PUBLIC_SEARCH_API_KEY`, and remember the app filters to a set of target stores.
- env changes not picked up: stop expo and restart so it reloads `.env`.

## repo hygiene
- `.env` is git-ignored; commit `.env.example` only.
- keys in `.env` are for local/dev; rotate them if they were ever committed before.***
