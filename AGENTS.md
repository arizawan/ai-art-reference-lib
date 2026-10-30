# Agent notes — ai-art-reference-lib

Read `docs/HANDOVER.md` first. Status snapshot: `docs/session-status.json`.

- Package / repo / MCP server name: **`ai-art-reference-lib`**.
- Do not overwrite Gia trees under `data/*-gallery/`; regen writes only under `data/gallery-regen/out/`.
- Large images are **gitignored**; live on Backblaze B2 (`b2:ai-art-reference-lib`). Keep local copies for validate/offline.
- Comfy: default `http://100.96.51.107:8188`; always wait for idle queue.
- Validate before claiming the mirror is intact: `npm run galleries:validate`.
- Hosting (public): https://ai-ref-lib.arizawan.com — Pages UI + B2 via Worker; see `docs/deploy-cloudflare-pages-b2.md`.
- Deploy UI with `--branch main` after `npm run galleries:build`.
- Full-size download: UI modal **Download full size** (`?download=1`) or MCP `get_asset_url` `kind=original`.
- UI loading: immediate tab switch + module cache/prefetch; spinners on tab, badge, skeleton grid, lazy tiles, modal.
