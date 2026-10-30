**Comfy (your current setup — measured)**

| Job | Measured | Per image | Full catalog |
|---|---|---|---|
| Pose · quick·8 · maxSide 832 | 6 runs, **avg 36s** (32–45) | ~36s | **1439 cues ≈ 14.5 h** (1 gender) · **×2 ≈ 29 h** |
| Costume · best·12 · 1024 | 2 runs, **avg 105s** (73–136) | ~1.2–2.3 min | **1407 cues ≈ 41 h** |

Sequential on one warm GPU (same as mix ~40s/img). No $ to KIE; only wall-clock + your box.

**Realistic pack if you match what we sampled**
- Pose F+M wood + costume fashion mannequin: **~70 h** one queue (~3 days continuous).
- Pose female-only + costume: **~56 h**.
- Pose at best·12 instead of quick: roughly **3–4×** pose time (best clay samples were 87–174s).

---

**KIE $ (closest public list — not the same as local Qwen21-EDIT-REF)**

| Model | List price | Pose 1439 | Pose×2 2878 | Costume 1407 | Pose×2 + costume |
|---|---|---|---|---|---|
| **Seedream 4.5** (Fairpose catalog) | **$0.0325**/img (6.5 cr) | ~$47 | ~$94 | ~$46 | **~$139** |
| **Qwen image-edit** | **$0.025/MP** → ~$0.02 @768×1024 · $0.025 @1MP | ~$28–36 | ~$56–72 | ~$35–45 | **~$90–115** |
| Grok Image 2 | $0.02/img | ~$29 | ~$58 | ~$28 | ~$86 |
| Nano Banana edit | $0.02/img | ~$29 | ~$58 | ~$28 | ~$86 |

1 credit ≈ $0.005. Failed tasks not charged (KIE’s rule).

**Caveat:** local pipeline is Comfy **Qwen21-EDIT-REF** with your image1/image2 order. KIE’s “Qwen image-edit” is the nearest line item, not a proven drop-in for mannequin lock. Seedream is what Fairpose already prices for identity runs — safer $ estimate if you’d run gallery via the app’s KIE path instead of Comfy.

**Bottom line:** full pose+costume on Comfy ≈ **2–3 days** sequential; on KIE Seedream ≈ **$140** for F+M pose + costume, or ~**$90–115** if Qwen-edit MP billing holds at ~1MP.
