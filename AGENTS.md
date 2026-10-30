# Agent notes — ai-art-reference-lib

Read `docs/HANDOVER.md` first. Status snapshot: `docs/session-status.json`.

- Package / repo / MCP server name: **`ai-art-reference-lib`**.
- Do not overwrite Gia trees under `data/*-gallery/`; regen writes only under `data/gallery-regen/out/`.
- Large images are **gitignored**; live on Backblaze B2 (`b2:ai-art-reference-lib`). Keep local copies for validate/offline.
- Comfy: default `http://100.96.51.107:8188`; always wait for idle queue.
- Validate before claiming the mirror is intact: `npm run galleries:validate`.
- Hosting (private for now): Cloudflare Pages UI + B2 assets under `arizawan.com` — see `docs/deploy-cloudflare-pages-b2.md`.
