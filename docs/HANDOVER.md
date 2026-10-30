# Handover — ai-art-reference-lib

Split from the Fairpose app repo on **2026-10-30** so large Gia mirrors + Comfy regen work live in their own project.

Public product name / GitHub / MCP: **`ai-art-reference-lib`**.  
Live: https://ai-ref-lib.arizawan.com · Repo: https://github.com/arizawan/ai-art-reference-lib

Machine-readable snapshot: [`session-status.json`](./session-status.json).

## What this repo is

**Reference libraries** (browse / filter / download) with a public Cloudflare-hosted UI, plus a **homelab ComfyUI regen** pipeline that redraws cues as wood / fashion / identity plates without overwriting Gia sources.

| Library | Path | Count | Upstream |
|---------|------|------:|----------|
| Portrait | `data/portrait-gallery/` | 1499 | https://ai-portrait-gallery.pages.dev/ |
| Pose | `data/pose-gallery/` | 1439 | https://ai-pose-gallery.pages.dev/ |
| Costume | `data/costume-gallery/` | 1407 | https://ai-costume-gallery.pages.dev/ |
| Depth (POSE-DB-02) | `data/pose-depth-gallery/` | 1439 | https://ai-pose-depth-gallery.pages.dev/ |
| Unified UI | `data/galleries/` (from `apps/web`) | — | https://ai-ref-lib.arizawan.com |
| Regen outs | `data/gallery-regen/` | — | Comfy |

Depth cue IDs match pose (ID parity). Gallery **blobs** are gitignored; B2 remote `b2:ai-art-reference-lib`.

## Public hosting

| Piece | Detail |
|-------|--------|
| Pages | project `ai-art-reference-lib` → `ai-ref-lib.arizawan.com` |
| Assets | Worker `ai-ref-lib-assets` → B2; `?download=1` → attachment |
| UI | Vite/React/shadcn; tab cache + prefetch; spinners on tab/badge/skeleton grid/lazy tiles/modal |
| MCP | `npm run galleries:mcp` · Cursor server `ai-art-reference-lib` |
| Validate | `npm run galleries:validate` (SC-1…SC-7) before claiming mirror OK |
| Deploy UI | `galleries:build` then `wrangler pages deploy data/galleries … --branch main` |

Full deploy notes: [`deploy-cloudflare-pages-b2.md`](./deploy-cloudflare-pages-b2.md).

## Quick start

```bash
cd /Users/riz/Work/TheaTechSolutions/fairpose-offline-galleries
npm run galleries:validate   # must exit 0
npm run galleries:offline    # http://127.0.0.1:5188/
# tabs: Portrait | Pose | Depth | Costume | Wood ♀/♂ (regen)
```

Mounts (see `scripts/serve-offline-galleries.mjs`): `/` UI, `/portrait`, `/pose`, `/depth`, `/costume`, `/regen` → `data/gallery-regen/out`.

## Comfy regen

- Host default: Tailscale `http://100.96.51.107:8188` (`COMFY_URL`)
- Graph: **Qwen21-EDIT-REF**
- Presets: `quick` = 8 steps; `best` = 12 steps
- Pose default long-side preprocess **832**, encode resolution **768**; costume/portrait prefer `best` @ 1024 unless overridden
- Runner **waits for empty Comfy queue** so owner jobs win
- Resumable: skips existing files under `data/gallery-regen/out/` + `state.json`

```bash
COMFY_URL=http://100.96.51.107:8188 npm run galleries:regen -- plan --stage pose --gender female --limit 5
COMFY_URL=http://100.96.51.107:8188 npm run galleries:regen -- run --stage pose --gender female --preset quick --max-side 832 --limit 1
npm run galleries:regen -- status --stage pose
```

Mix male expressions (Ren Okada from female cues, **v2** figure=`image1` expression=`image2`):

```bash
# Female cue directory: Fairpose Mix/styles, or set MIX_IMG_DIR
MIX_IMG_DIR=/Users/riz/Work/TheaTechSolutions/fairpose/public/styles \
  npm run galleries:regen-mix-male -- plan
```

### Image order (do not swap casually)

| Stage | image1 (edit base) | image2 (ref) |
|-------|--------------------|--------------|
| Pose / portrait | cue | figure (wood / face plate) |
| Costume | figure (hourglass mannequin) | cue outfit |
| Mix male v2 | Ren face plate | female expression cue |

Prompts: `data/gallery-regen/prompts.json`. Characters: `characters.json` (Mika Vay ♀, Ren Okada ♂). Refs under `data/gallery-regen/refs/` (`female-wood.jpg`, `male-wood.jpg`, `fashion-mannequin-hourglass.png`, face PNGs). Clay look was **dropped** (`female-clay-3d.png` kept only as history).

### Session regen status (when split)

- `state.json`: **219** done (pose wood batch ~211 then **stopped** — wood judged junk; switched to depth mirror)
- `mix-male-state.json`: **48/48** done (scream/tongue OK; pucker/cry softer)
- Outs: `out/pose` ~213, `out/mix-male` 48, `out/samples` 219, costume 2, portrait 4

Sample review canvas (Cursor): `canvases/gallery-regen-samples.canvas.tsx`.

## Costs (session estimates)

See:

- [`costs-comfy-measured.md`](./costs-comfy-measured.md) — wall-clock on homelab
- [`costs-kie-ref-models.md`](./costs-kie-ref-models.md) — cheapest KIE models that take refs

Rough: pose quick ~36s/img → ~14.5 h one gender; F+M wood + costume fashion ~70 h one queue. KIE Klein Edit ~$0.008/img if quality holds (unproven vs local EDIT-REF).

## Origin / Fairpose cleanup

- Came from Fairpose branch `chore/fairpose-com-cutover-prep`, tip `eaa4c2ba` (depth commit).
- **Never pushed** to GitHub: pack > 2.00 GiB (~7 GB of gallery blobs).
- After the move, Fairpose has ~12k path deletions + gallery npm scripts removed — **not committed** there yet.
- Mix expression **source** webps still live mainly under Fairpose `public/styles/` / Mix library; this repo keeps PNG outs + partial female cue copies under `data/gallery-regen/refs/mix-expression-female/` (incomplete — prefer Fairpose paths via `MIX_IMG_DIR`).

## Scripts

| Script | Role |
|--------|------|
| `scripts/serve-offline-galleries.mjs` | Static server :5188 |
| `scripts/validate-offline-galleries.mjs` | SC-1…SC-7 + file presence |
| `scripts/mcp-galleries.mjs` | stdio MCP (`search_cues`, `get_asset_url`) |
| `scripts/scrape-pose-depth-gallery.mjs` | Re-mirror Gia depth |
| `scripts/regen-gallery-comfy.mjs` | Pose/costume/portrait Comfy regen |
| `scripts/regen-mix-missing-male.mjs` | Mix male expression fill |

## Logs

`logs/depth-scrape.log`, `logs/pose-both-quick.log` from the split session.

## Decisions to remember

1. Clay dropped — wood + fashion only for pose/costume samples.
2. Wood full-catalog regen **paused** as low value; depth gallery is the pose-ID reference pull instead.
3. Mix expression soft → v2 order + expression-lock prompt; do not revert to cue-as-image1 for males.
4. Encode webp with **cwebp** (not ffmpeg webp) for mix.
5. License copy in footer; header credits Gia on X + arizawan/GitHub host (`success-criteria.json` SC-2).
6. Do not overwrite `data/*-gallery/`; regen only under `data/gallery-regen/out/`.
7. Production Pages deploys use `--branch main` (preview branches are not the custom domain).
