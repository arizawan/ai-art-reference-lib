# Deploy — ai-ref-lib.arizawan.com

**One subdomain:** `https://ai-ref-lib.arizawan.com`

| Path | Source |
|------|--------|
| `/` UI | Cloudflare Pages project `ai-art-reference-lib` |
| `/portrait/*` `/pose/*` `/depth/*` `/costume/*` | Worker `ai-ref-lib-assets` → B2 bucket `ai-art-reference-lib` |

`GALLERY_ASSET_BASE` stays **empty** (same-origin). Localhost still uses local mounts.

## Commands

```bash
# UI
GALLERY_ASSET_BASE= npm run galleries:pages:prepare
npx wrangler pages deploy data/galleries --project-name=ai-art-reference-lib --commit-dirty=true

# Asset proxy (secrets once)
cd cloudflare/ai-ref-lib-assets
npx wrangler secret put B2_KEY_ID
npx wrangler secret put B2_APPLICATION_KEY
npx wrangler deploy

# Custom domain (Pages dashboard or API): ai-ref-lib.arizawan.com
# Cloudflare Access: protect ai-ref-lib.arizawan.com until public
```

B2 sync: `B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2`
