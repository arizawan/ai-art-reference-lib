# AI art reference lib

Offline Gia mirrors (portrait / pose / costume / depth) + ComfyUI regen tooling. Public UI name: **AI art reference lib**. Package / GitHub / MCP: **`ai-art-reference-lib`**.

**Handover:** [`docs/HANDOVER.md`](docs/HANDOVER.md) · [`docs/session-status.json`](docs/session-status.json) · [`docs/ORIGIN.md`](docs/ORIGIN.md)

**Private deploy (not public yet):** UI on Cloudflare Pages under `arizawan.com`, assets on Backblaze B2 — [`docs/deploy-cloudflare-pages-b2.md`](docs/deploy-cloudflare-pages-b2.md)

```bash
npm run galleries:validate   # SC-1…SC-7
npm run galleries:offline    # http://127.0.0.1:5188/
npm run galleries:sync:b2    # upload mirrors to B2 (rclone remote `b2`)
```

| Path | Role |
|------|------|
| `data/galleries/` | Unified browse UI + `success-criteria.json` |
| `data/portrait-gallery/` | Face + styling (images → B2; `cues.json` in git) |
| `data/pose-gallery/` | Pose |
| `data/costume-gallery/` | Costume |
| `data/pose-depth-gallery/` | Depth / ID-parity with pose |
| `data/gallery-regen/` | Prompts, refs, state, Comfy outs (local / ignored) |
| `scripts/` | Serve, validate, scrape, regen, B2 sync |
| `docs/` | Handover, costs, origin, deploy |

**Git:** large image trees are gitignored. Keep local mirrors for `galleries:validate` / offline serve; sync to B2 for hosting.
