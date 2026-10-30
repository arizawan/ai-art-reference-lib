---
name: Static Gallery Object Hosting
description: Free/near-free public hosting for multi-GB static image galleries (git code + object storage + CDN UI)
topics: cloudflare, r2, pages, static hosting, large binaries
created: 2026-10-30
updated: 2026-10-30
scratchpad: .specs/scratchpad/31432e73.md
---

# Static Gallery Object Hosting

## Overview

Multi-GB gallery repos must not live in git blobs. Split **code/manifests** (git + Pages) from **media** (R2 or B2). Cloudflare Pages + R2 matches existing Gia `*.pages.dev` pattern.

## Recommended stack

| Layer | Service |
|-------|---------|
| UI + manifests | Cloudflare Pages (free, unlimited bandwidth) |
| ~7 GB assets | Cloudflare R2 public bucket (10 GB-month free tier) |
| DNS/HTTPS | Cloudflare zone (free SSL) |

## Key limits (cite docs)

- Pages: 20k files/site, 25 MiB/asset, 500 builds/mo ([limits](https://developers.cloudflare.com/pages/platform/limits/))
- R2: 10 GB-month free, egress $0 ([pricing](https://developers.cloudflare.com/r2/pricing/))
- GitHub Pages: 1 GB published site — unsuitable for 7 GB
- Git LFS: 10 GiB storage — tight for 7 GB + no Pages integration

## CI sketch

`galleries:validate` → sync `data/*` to R2 (hash/manifest diff) → deploy `data/galleries` UI to Pages with `ASSET_BASE_URL`.

## Sources

| Source | Verified |
|--------|----------|
| developers.cloudflare.com/pages/platform/limits | 2026-09 |
| developers.cloudflare.com/r2/pricing | 2026-10 |
| docs.github.com/pages limits | 2025 |
| huggingface.co/docs/hub/storage-limits | 2025 |
