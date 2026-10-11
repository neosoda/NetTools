---
name: sentinel-sdd
description: Apply Sentinel SDD repository-local specifications, tasks, integrity-checked verification, and safe handoffs.
---

# Sentinel SDD

## Start safely

1. Check for `.sentinel-sdd/config.json`. If it is absent, ask before initializing.
2. Read the relevant specification, canonical task registry, latest audit/evidence, and handoff.
3. Use QUICK for an isolated low-risk fix, STANDARD for a feature, and FULL for a migration or major redesign.

## Work through the lifecycle

1. Create the specification, then consult `sdd task next` and `sdd work guide`.
2. Keep one writer per checkout.
3. Mutate task state only through `sdd task`; run `sdd validate`, `sdd audit`, and `sdd verify --task <id> --run` as appropriate.
4. Use `sdd review --outcome proposed|changes_requested` for an agent review. Use `sdd approval record` only to record a human approval assertion; Sentinel will flag that local identity is unauthenticated.
5. Capture decisions, remaining work, blockers, and restrictions with `sdd context snapshot`.

## Safety and evidence

- Never manually edit Sentinel state when a CLI command exists.
- Only integrity-verified v2 evidence emitted by `sdd verify` satisfies a verification gate. Directly written JSON is legacy/imported history, never verified evidence.
- A passing check, agent review, or local approval assertion never proves authenticated human approval.
- Never push, deploy, delete data, expose secrets, run destructive migrations, or overwrite project agent files without explicit approval.
