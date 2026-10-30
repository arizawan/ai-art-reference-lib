# Origin

| Field | Value |
|-------|-------|
| Split date | 2026-10-30 |
| Source repo | `/Users/riz/Work/TheaTechSolutions/fairpose` |
| Source branch | `chore/fairpose-com-cutover-prep` |
| Source commit (depth) | `eaa4c2ba` — `feat: mirror Gia pose-depth gallery offline` |
| Remote push | **Failed** — `remote: fatal: pack exceeds maximum allowed size (2.00 GiB)` |
| Why split | Galleries + regen outs ~7 GB; Fairpose app should not carry them; GitHub cannot take the branch as one pack |

Cursor session transcript (context dump, not required to run):  
`…/agent-transcripts/ee0b2e0e-16e2-4203-a8ac-6c302d9fdea1/`

Regen CLIs were **never committed** in Fairpose; they were reconstructed into `scripts/` from that transcript’s Write/StrReplace history when this project was created.
