# Deploy — Cloudflare Pages + Backblaze B2

**Tool / repo:** `ai-art-reference-lib`  
**Domain:** `arizawan.com` (Cloudflare)  
**Status:** private — Cloudflare Access until you open it.

| Host | Serves |
|------|--------|
| `https://refs.arizawan.com` | Pages: UI under `data/galleries` |
| `https://refs-assets.arizawan.com` | B2 bucket `ai-art-reference-lib` via Cloudflare (orange cloud) |

Prefixes on B2: `portrait/`, `pose/`, `depth/`, `costume/` (each includes `cues.json` + images).

## 1. Backblaze B2

1. Create **private** bucket: `ai-art-reference-lib`.
2. Create application key (read/write for sync).
3. Configure rclone remote named `b2` (type `b2`).

```bash
# one-time: rclone config → name "b2", type Backblaze B2, paste key ID + app key
B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2 -- --dry-run
B2_RCLONE_REMOTE=b2:ai-art-reference-lib npm run galleries:sync:b2
```

## 2. Cloudflare in front of B2

1. Custom domain `refs-assets.arizawan.com` → B2 (Backblaze + Cloudflare docs).
2. Orange-cloud proxy; cache thumbs/images long; shorter cache on `cues.json`.
3. Until public: **Cloudflare Access** on `refs*` hostnames (email allowlist).

## 3. Cloudflare Pages (UI)

| Setting | Value |
|---------|--------|
| Build command | `npm run galleries:pages:prepare` |
| Build output directory | `data/galleries` |
| Root directory | repo root |

**Production env:**

```bash
GALLERY_ASSET_BASE=https://refs-assets.arizawan.com
```

Local offline ignores `config.json` on localhost.

## 4. Git

Private repo: `github.com/arizawan/ai-art-reference-lib`  
Do **not** commit image trees (see `.gitignore`). Validate locally before sync:

```bash
npm run galleries:validate
```

## 5. Attribution

Header credits Gia on X. Footer keeps license. Portrait CC0; pose/depth/costume open public Gia refs with credit.

## 6. MCP (next)

Local stdio MCP server name: **`ai-art-reference-lib`**. Not required for first B2 + Pages private cutover.
