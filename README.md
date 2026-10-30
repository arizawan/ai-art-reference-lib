# AI art reference lib

Browse and download **full-size** Gia open reference images (portrait / pose / depth / costume).

| | |
|--|--|
| **Live site** | https://ai-ref-lib.arizawan.com |
| **Repo** | https://github.com/arizawan/ai-art-reference-lib |
| **Host** | [arizawan](https://arizawan.com) · GitHub [@arizawan](https://github.com/arizawan) |
| **Upstream refs** | [Gia / ギア](https://x.com/giaaibusi) (credit requested) |

## Site UX

- Tabs switch immediately; libraries are cached and prefetched in the background.
- Loading feedback: spinner on the active tab, count badge, skeleton grid (12 cards), and a spinner on each lazy image until it loads.
- Detail dialog: **Download full size** (`?download=1`) or open full size in a new tab.
- Top strip: MCP how-to, credits (Gia / arizawan / GitHub).

## Download options

Same affordances as the original Gia / あぎ galleries (per-image full-size PNG), plus this mirror’s CDN and optional bulk packs.

### 1. This site (recommended)

| Option | How |
|--------|-----|
| **Download full size** | Open a card → detail dialog → **Download full size** (`?download=1` attachment) |
| **Open full size** | Same dialog → open original in a new tab, then save from the browser |
| **Direct URL** | Once you know the path from a cue (see shapes below) |

```text
https://ai-ref-lib.arizawan.com/portrait/img/full/<id>.png?download=1
https://ai-ref-lib.arizawan.com/pose/img/<id>.png?download=1
https://ai-ref-lib.arizawan.com/depth/img/<id>.png?download=1
https://ai-ref-lib.arizawan.com/costume/png/<id>.png?download=1
```

`?download=1` sets `Content-Disposition: attachment` on the asset Worker.

### 2. Official source galleries (upstream)

Per-image **Download full size (PNG)** in each upstream lightbox (same pattern as this mirror):

| Library | Count | Official site | Creator |
|---------|------:|---------------|---------|
| Portrait | 1499 | https://ai-portrait-gallery.pages.dev/ | [あぎ / @agi_aibusi](https://x.com/agi_aibusi) (CC0) |
| Pose | 1439 | https://ai-pose-gallery.pages.dev/ | [Gia / ギア @giaaibusi](https://x.com/giaaibusi) |
| Depth | 1439 | https://ai-pose-depth-gallery.pages.dev/ | Gia (POSE-DB-02; IDs match pose) |
| Costume | 1407 | https://ai-costume-gallery.pages.dev/ | Gia |

Upstream UIs do **not** ship a “download all” zip; they are browse + one-file download.

### 3. Bulk packs (community Hugging Face)

Third-party Hub mirrors of the pose / costume trees (not hosted by this repo). Prefer these when you need the whole set offline:

| Library | Hugging Face dataset | Notes |
|---------|----------------------|-------|
| Pose | [Gusitir/pose-db-01](https://huggingface.co/datasets/Gusitir/pose-db-01) | ~692 MB · img + thumbs + index |
| Costume | [Gusitir/costume-db-01](https://huggingface.co/datasets/Gusitir/costume-db-01) | Outfit-only refs |

Portrait (~4.5 GB full PNG) and depth are not on those Hub packs; use this site, the official galleries, or a local B2 sync (below).

Respect Gia’s notes on pose / depth / costume: free to use as AI reference; **do not redistribute or resell the image files**. Portrait is **CC0**. Credit creators when you republish a UI.

### 4. Agents / MCP

Cursor MCP server name: **`ai-art-reference-lib`** (see `.mcp.json`).

```text
search_cues → get_asset_url({ kind: "original", include_image?: true })
```

Public originals use `GALLERY_PUBLIC_BASE_URL=https://ai-ref-lib.arizawan.com`.

### 5. Full local mirror (maintainers)

Images are gitignored. Sync from Backblaze B2, then validate:

```bash
B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2
npm run galleries:validate
```

## Architecture

| Piece | Role |
|-------|------|
| `apps/web` | Vite + React + Tailwind + shadcn → build into `data/galleries/` |
| Cloudflare Pages | Static UI (`ai-art-reference-lib`, custom domain `ai-ref-lib.arizawan.com`) |
| Worker `ai-ref-lib-assets` | Proxies `/portrait|pose|depth|costume/*` from B2 `ai-art-reference-lib` |
| `scripts/mcp-galleries.mjs` | stdio MCP for cue search + asset URLs |

## Local

```bash
npm run galleries:validate   # SC-1…SC-7
npm run galleries:offline    # http://127.0.0.1:5188/
npm run galleries:build      # Vite UI → data/galleries
npm run galleries:mcp        # stdio MCP
```

Deploy production UI (after build):

```bash
npx wrangler pages deploy data/galleries --project-name=ai-art-reference-lib --branch main --commit-dirty=true
```

Handover: [`docs/HANDOVER.md`](docs/HANDOVER.md) · deploy: [`docs/deploy-cloudflare-pages-b2.md`](docs/deploy-cloudflare-pages-b2.md) · agents: [`AGENTS.md`](AGENTS.md)

## License / credit

- **Portrait:** CC0 (あぎ).
- **Pose / depth / costume:** Gia open public refs — commercial use as AI reference OK; credit requested; do not redistribute/resell the image files themselves.
- This mirror is for browsing and download; no warranty.
