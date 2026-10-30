# Gallery regen (homelab ComfyUI)

Rebuild pose → costume → portrait refs as **new** images via Qwen 2.1 EDIT-REF. Does not overwrite Gia source files.

Default ComfyUI: Tailscale `http://100.96.51.107:8188` (`COMFY_URL`). Owner jobs win: runner waits for an empty queue.

```bash
# plan (no GPU)
npm run galleries:regen -- plan --stage pose --gender female --limit 5

# run (resumable — skips existing outs)
COMFY_URL=http://100.96.51.107:8188 npm run galleries:regen -- run --stage pose --gender female --preset quick --max-side 832 --limit 1

# specific cues
npm run galleries:regen -- run --stage pose --ids full_sexy_P001_front,full_sexy_P002_front --gender both

# costume (figure = image1 hourglass; outfit cue = image2)
npm run galleries:regen -- run --stage costume --ids SPR-0001 --preset best

# mix males (needs female cues; see MIX_IMG_DIR in docs/HANDOVER.md)
MIX_IMG_DIR=/Users/riz/Work/TheaTechSolutions/fairpose/public/styles \
  npm run galleries:regen-mix-male -- run --limit 5
```

| Path | Role |
|------|------|
| `refs/` | Wood figures, fashion mannequin, Mika/Ren face plates |
| `refs/mix-expression-female/` | Partial copy of female expression cues used for mix (incomplete) |
| `prompts.json` | Stage prompts |
| `characters.json` | Mika Vay / Ren Okada |
| `out/{stage}/` | Generated images |
| `state.json` | Pose/costume/portrait resume log |
| `mix-male-state.json` | Mix male resume log |

Presets: **quick** = 8 steps; **best** = 12 steps. Clay dropped — do not revive clay prompts for production packs.
