# IMOF Asset Mirror

Mirrored from `https://www.imofedu.com` on 2026-09-15 for offline / self-hosted use. © IMOF.

- Serving: Vite `public/` → `/assets/imof/...` (absolute path, no `import`). `vite build` copies verbatim to `dist/assets/imof/`.
- Legacy `../olympiads/*.png` (11 files) is **frozen** — existing `src/pages/Landing.jsx` (`ICON='/assets/olympiads'`) keeps working. Identical copies also live under `imof/icons/` so `imof/` is a complete standalone mirror.
- Total: 42 files (~45MB — hero + brand + testimonials are large by source).

| Folder | Content | Files |
|---|---|---|
| `brand/` | logo, transparent logo, OG cover | 3 |
| `hero/` | home slider S1–S4 | 4 |
| `icons/` | 11 olympiad category PNGs (mirror of `olympiads/`) | 11 |
| `gifs/` | animated service icons | 9 |
| `stats/` | statistics strip icons | 6 |
| `partners/` | partner logos Par01–Par06 | 6 |
| `testimonials/` | student photos + avatar | 3 |

Usage: `import { IMOF_ASSETS } from '../../lib/imofAssets.js'` then `<img src={IMOF_ASSETS.brand.logo} … />`.

To re-sync: `Invoke-WebRequest -Uri "https://www.imofedu.com/<source>" -OutFile "public/assets/imof/<local>"`. See `manifest.json` for source→local map.
