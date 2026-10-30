# AI art reference lib — UI build output

Live: https://ai-ref-lib.arizawan.com · Source: https://github.com/arizawan/ai-art-reference-lib

One UI for portrait, pose, depth, and costume cues. Top strip credits Gia + arizawan/GitHub. Click a card → **Download full size** for the original (`?download=1`).

Repo handover: [`../../docs/HANDOVER.md`](../../docs/HANDOVER.md).

```bash
npm run galleries:validate   # data + UX success criteria (exit 1 on fail)
npm run galleries:offline    # http://127.0.0.1:5188/
```

| Path | Role |
|------|------|
| `index.html` | Unified browse / filter / download |
| `success-criteria.json` | Persona, baseline, SC-1…SC-7, expected counts |
| `../portrait-gallery/` | Face + styling cues + images |
| `../pose-gallery/` | Pose cues + images |
| `../pose-depth-gallery/` | Depth cues (ID-parity with pose) |
| `../costume-gallery/` | Costume cues + images |
| `../gallery-regen/out/` | Comfy wood/fashion/mix outs (`/regen` mount) |

Validator: `scripts/validate-offline-galleries.mjs`. Re-run until exit 0 before treating the mirror as intact.
