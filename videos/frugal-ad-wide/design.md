# Frugal — design spec (brand truth for video)

Source of truth: `src/theme/index.tsx`, `src/components/*` in the app. Video applies these
values at video scale; never invent new brand colors.

## Personality
Clean, white, minimal, friendly. Chunky rounded display type, tactile "3D ledge" buttons,
shelf-label price tags. Color is used sparingly: brand red for actions and highlighted words.

## Color (light theme — the app default)
| Token | Hex | Use |
|---|---|---|
| bg / surface | `#FFFFFF` | canvas, cards |
| surfaceAlt | `#F6F6F6` | search bar, soft panels |
| text / ink | `#161616` | headings, body |
| textMuted | `#707070` | secondary text |
| border | `#ECECEC` | hairline card borders |
| primary | `#FF5050` | brand red (logo, actions, highlighted word) |
| primaryLedge | `#C93434` | 3D bottom edge of red buttons |
| primarySoft | `#FFE3E3` | highlighter stroke behind red words |
| success | `#16A870` | BEST VALUE, cheapest price, checkmarks |
| successSoft | `#DDF5EA` | tints |
| sun | `#FFC53D` | yellow price tag, scanner corners |
| sky | `#3F7BFF` | secondary accent |

## Type
- Display: **Fredoka** 700 / 600 / 500 — headings, prices, buttons (buttons uppercase, +0.8 tracking)
- Body: **Poppins** 400 / 500 / 600
- Eyebrow: Poppins 600, uppercase, wide tracking (2.2), brand red
- Signature: `Highlight` — the key word in brand red with a `primarySoft` bar behind its lower third

## Components to reuse in motion
- Button3D: flat face on a darker ledge (4px in app), radius 14; press pushes face down onto the ledge
- Card: white, radius 18, 1px `#ECECEC` border, soft shadow
- PriceTag: yellow `#FFC53D` tag, punched hole, rotated -2deg, Fredoka price
- Sticker: pill, uppercase Poppins 600, e.g. green "BEST VALUE"
- OfferRow: best offer gets a 2px green border and a green price
- TabBar: floating white bar, raised red 3D scan button in the middle
- GradeChip: grade letter in a colored circle

## Do / Don't
- Do keep the canvas white; red is the hero accent, green only means "cheapest / done".
- Do use real app layouts (scan viewfinder, offer rows, shopping list) as the visual proof.
- Don't use gradients on text, neon, or dark themes.
- Don't attribute invented prices to real store chains — use neutral sample store names.
