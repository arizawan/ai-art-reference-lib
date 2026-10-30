# Deploy — ai-ref-lib.arizawan.com

**One subdomain:** `https://ai-ref-lib.arizawan.com`

| Path | Source |
|------|--------|
| `/` UI | Cloudflare Pages project `ai-art-reference-lib` |
| `/portrait/*` `/pose/*` `/depth/*` `/costume/*` | Worker `ai-ref-lib-assets` → B2 bucket `ai-art-reference-lib` |

`GALLERY_ASSET_BASE` stays **empty** (same-origin). Localhost still uses local mounts.

## Commands

```bash
# UI (production custom domain tracks the main branch)
npm run galleries:build
# or: GALLERY_ASSET_BASE= npm run galleries:pages:prepare
npx wrangler pages deploy data/galleries --project-name=ai-art-reference-lib --branch main --commit-dirty=true

# Asset proxy (secrets once)
cd cloudflare/ai-ref-lib-assets
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler deploy

# Custom domain (Pages dashboard or API): ai-ref-lib.arizawan.com
# Cloudflare Access: protect ai-ref-lib.arizawan.com until public
```

## Speed + analytics

- Zone `arizawan.com`: Brotli, HTTP/2+3, Early Hints, 0-RTT, Polish **lossless** (enabled). Rocket Loader stays **off** (breaks React).
- Pages `_headers`: hashed `/assets/*` → `max-age=31536000, immutable`; `index.html` no long cache.
- Asset Worker: Cloudflare Cache API + long `Cache-Control` on images; short TTL + SWR on `cues.json`.
- Web Analytics: zone auto-install + explicit beacon token on `ai-ref-lib` HTML (same as arizawan.com RUM site).

B2 sync: `B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2`
