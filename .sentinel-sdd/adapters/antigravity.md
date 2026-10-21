# antigravity adapter

Sentinel SDD is agent-neutral. Before work, load the Sentinel configuration, relevant spec documents, task registry, and latest evidence.

- Follow the selected mode: QUICK for isolated low-risk fixes, STANDARD for features, FULL for new products or major redesigns.
- Read task dependencies and blockers before implementation.
- Update only the source-of-truth artifact that changed.
- Run `sdd audit` before review. Use `sdd verify` to preview checks and `sdd verify --run` only for explicit local execution; evidence is persisted separately from the session handoff.
- Use one writer per workspace. Use isolated worktrees only when the host supports them.
