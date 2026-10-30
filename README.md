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

## Download full-size images

1. Open https://ai-ref-lib.arizawan.com
2. Pick a library tab (Portrait / Pose / Depth / Costume), filter or search
3. Click a card → detail dialog
4. Click **Download full size** — saves the original (PNG/WebP/JPEG) via same-origin CDN  
   Or use **full size in a new tab**, then save from the browser

Direct URL shape (after you know the path from a cue):

```text
https://ai-ref-lib.arizawan.com/portrait/img/full/<id>.png?download=1
https://ai-ref-lib.arizawan.com/pose/img/<id>.png?download=1
https://ai-ref-lib.arizawan.com/depth/img/<id>.png?download=1
https://ai-ref-lib.arizawan.com/costume/png/<id>.png?download=1
```

`?download=1` sets `Content-Disposition: attachment` on the asset Worker.

### Agents / MCP

Cursor MCP server name: **`ai-art-reference-lib`** (see `.mcp.json`).

```text
search_cues → get_asset_url({ kind: "original", include_image?: true })
```

Public originals use `GALLERY_PUBLIC_BASE_URL=https://ai-ref-lib.arizawan.com`.

## Architecture

| Piece | Role |
|-------|------|
| `apps/web` | Vite + React + Tailwind + shadcn → build into `data/galleries/` |
| Cloudflare Pages | Static UI (`ai-art-reference-lib`, custom domain `ai-ref-lib.arizawan.com`) |
| Worker `ai-ref-lib-assets` | Proxies `/portrait|pose|depth|costume/*` from B2 `ai-art-reference-lib` |
| `scripts/mcp-galleries.mjs` | stdio MCP for cue search + asset URLs |

Large images are **gitignored**; keep a local mirror for `galleries:validate` / offline serve. Sync: `B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2`.

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

Open reference images by Gia — CC0-style open refs; credit requested. This mirror is for browsing and download; no warranty.
