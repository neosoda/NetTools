# AGENTS.md

Project-specific instructions for the **public NetTools repository**, followed by general behavioral guidelines to reduce common LLM coding mistakes.

These rules are mandatory for every AI coding agent working in this repository.

**Tradeoff:** these guidelines favor safety, maintainability, and minimal diffs over speed. For trivial tasks, use judgment without weakening repository safety rules.

---

# 0. Repository Identity and Safety Boundary

This worktree is the **PUBLIC edition of NetTools**.

Expected worktree: the checkout whose origin is the public repository below.
Cloud tasks may use `/workspace/NetTools`; contributor clones may use any path.

Expected base branch (contributions use dedicated branches):

```text
master
```

Expected public remote:

```text
origin -> https://github.com/neosoda/NetTools.git
```

Everything committed to this repository must be safe for immediate public disclosure.

The public repository is the upstream source for a separate private downstream edition.

Synchronization is strictly one-way:

```text
PUBLIC master
      |
      v
PRIVATE downstream edition
```

Public changes may be inherited by the private edition.

Private-specific changes must never flow back into this repository.

---

## 0.1 Public Repository Boundary

This repository MUST NOT contain information or code specific to a private deployment.

Forbidden content includes, but is not limited to:

- organization-specific audit logic;
- private infrastructure rules;
- internal IP addresses or hostnames;
- internal service names or topology;
- private VLAN/VRF mappings;
- private firmware or deployment policies;
- internal remediation procedures;
- private documentation;
- private test fixtures or configuration samples;
- source code copied from a private downstream edition when it contains deployment-specific behavior;
- credentials, passwords, SNMP secrets, private keys, tokens, API secrets, or encryption keys.

If information is known only because it exists in a private downstream edition, treat it as private by default.

Do not copy private implementation details into comments, tests, examples, fixtures, logs, screenshots, documentation, or commit messages.

---

## 0.2 What Belongs in Public NetTools

Generic functionality belongs here first.

Examples:

- generic SSH/SNMP improvements;
- generic Aruba, Cisco, HPE, Huawei, Fortinet, or Allied Telesis support;
- backup engine improvements;
- generic audit framework improvements;
- generic parsers and normalization logic;
- UI/UX improvements;
- SQLite/database fixes;
- concurrency and cancellation fixes;
- performance and reliability improvements;
- generic exports;
- logging improvements;
- scheduler improvements;
- vendor-neutral security improvements.

If a change benefits both Public NetTools and a private downstream edition, implement the generic part here first.

Do not create unnecessary private-only copies of generic fixes.

---

# 1. Mandatory Preflight

Before modifying anything, inspect the repository state:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short
git remote -v
```

Expected state:

```text
Worktree: public NetTools checkout (any local path)
Base:     master; contribution branch for changes
Remote:   origin
```

Validate the public repository identity before editing. For contributions, create a dedicated branch from the selected checkout; do not switch or reset existing user work. An explicitly requested contribution branch is permitted. Stop if the repository or remote identity is unexpected.

Do not silently switch branches or repositories to compensate for an unexpected state.

Only when explicitly updating a local `master` checkout with a clean working tree, use:

```bash
git pull --ff-only origin master
```

Never discard existing uncommitted user changes.

Never use `git reset --hard`, `git clean`, forced checkout, or equivalent destructive operations unless explicitly requested.

---

# 2. Classify the Change Before Coding

Before implementation, classify the requested work.

## Generic change

Implement on a dedicated contribution branch and open a pull request targeting `master`. Do not merge automatically.

Examples:

- SSH reconnect reliability;
- SNMP parsing;
- generic vendor detection;
- backup concurrency;
- common UI bugs;
- database fixes;
- generic audit engine behavior;
- generic exports or scheduling.

## Private/deployment-specific change

Do NOT implement it in this public repository.

Examples:

- organization-specific infrastructure validation;
- private service reachability checks;
- deployment-specific VLAN/VRF policy;
- private firmware policy;
- internal remediation instructions;
- private business rules.

If the request is clearly private-specific, stop and indicate that it belongs in the private downstream worktree.

If classification is genuinely ambiguous and could affect public disclosure, ask before implementing.

---

# 3. Protection Against Information Leakage

Before every commit and every push to `master`, inspect:

```bash
git status
git diff
git diff --cached
```

Review the complete diff, not only the files intentionally modified.

Pay particular attention to:

- source code;
- tests;
- fixtures;
- example configurations;
- README and documentation;
- JSON/YAML files;
- logs;
- screenshots;
- generated files;
- comments;
- hard-coded addresses;
- debug output;
- commit messages.

Ask:

> Could every changed line safely appear on a public GitHub repository?

If the answer is not clearly yes, do not publish it.

---

# 4. Git Safety

Normal contribution target: a dedicated branch and a pull request to `master`.
Do not push directly to `master` or merge without an explicit maintainer request.

Before pushing, verify:

```bash
git branch --show-current
git remote -v
git status
```

Never use:

```bash
git push --all
git push --mirror
```

Do not push unknown or private branches to `origin`.

Do not merge private downstream branches into `master`.

Do not cherry-pick deployment-specific commits into `master`.

Do not force-push `master` unless explicitly requested and the consequences are fully understood.

---

# 5. Secrets

Never commit secrets, even temporarily.

This includes:

- passwords;
- SSH private keys;
- SNMP authentication/privacy secrets;
- API tokens;
- access tokens;
- application credentials;
- encryption keys;
- session cookies;
- personal access tokens.

Runtime secrets must use the application's secure credential storage or an appropriate external secret mechanism.

A secret removed in a later commit is still present in Git history.

If a secret is accidentally introduced, stop and report it before continuing.

---

# 6. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State assumptions when they materially affect the solution.
- If multiple interpretations exist, do not silently choose the risky one.
- If a simpler solution exists, say so.
- Push back on unnecessary complexity.
- If something important is unclear, stop and identify exactly what is missing.

Do not ask questions for trivial details that can be safely inferred from the repository.

---

# 7. Simplicity First

**Write the minimum code that correctly solves the requested problem.**

- No features beyond what was requested.
- No speculative abstractions.
- No configurability without a concrete requirement.
- No new framework when existing project infrastructure is sufficient.
- No duplicate implementation of existing functionality.
- Prefer existing project dependencies over adding new ones.
- If 200 lines can reasonably be 50, simplify.

Ask:

> Would a senior engineer consider this unnecessarily complicated?

If yes, simplify before delivery.

---

# 8. Surgical Changes

**Touch only what the task requires.**

When editing existing code:

- Do not refactor unrelated code.
- Do not reformat unrelated files.
- Do not rename unrelated symbols.
- Match existing project style.
- Do not "clean up" code merely because you noticed it.
- If unrelated dead code is discovered, mention it instead of deleting it.

When your own changes create unused code:

- remove imports made unused by your change;
- remove variables/functions made obsolete by your change;
- do not remove pre-existing unrelated dead code unless requested.

Every changed line should be traceable to the requested task or to a necessary test/fix supporting it.

---

# 9. Goal-Driven Execution

**Define success in verifiable terms and work until it is verified.**

Examples:

- "Fix the bug" -> reproduce it, implement the fix, verify the failure no longer occurs.
- "Add validation" -> test invalid input, implement validation, verify rejection.
- "Refactor X" -> establish baseline behavior, refactor, verify behavior remains unchanged.
- "Improve reliability" -> identify the failure mode and verify the corrected behavior.

For multi-step work, use a short execution plan:

```text
1. [Change] -> verify: [specific check]
2. [Change] -> verify: [specific check]
3. [Change] -> verify: [specific check]
```

Do not stop at "the code looks correct" when automated or practical verification is available.

---

# 10. Testing and Validation

Run the narrowest relevant tests first.

Then run the broader validation required by the affected area.

For backend changes, prefer targeted Go tests first, then broader package tests when relevant.

For frontend changes, run TypeScript validation and relevant tests/build checks.

For changes affecting Wails bindings, assets, or desktop integration, perform an integration build when practical.

Do not claim a change is verified if the relevant test or build was not actually run.

If validation cannot be completed, state exactly what remains unverified and why.

---

# 11. Commit Discipline

Keep commits focused.

A commit should represent one coherent change.

Do not mix:

- unrelated refactors;
- formatting-only changes;
- private/deployment-specific content;
- generated artifacts that are not required;
- debug leftovers.

Before committing:

```bash
git status
git diff
git diff --cached
```

Use clear commit messages describing what actually changed.

Before pushing, verify once more that the commit is safe for the public repository.

---

# 12. Definition of Done

A task is complete only when:

- the requested behavior is implemented;
- relevant tests or validations pass;
- unrelated code was not modified;
- the diff was reviewed;
- no private/deployment-specific information leaked into Public;
- no secrets were introduced;
- the repository is left in a coherent state;
- commits and pushes target the requested contribution branch; no automatic merge.

These guidelines are working if they produce smaller diffs, fewer regressions, less duplication, and safer separation between Public NetTools and private downstream editions.
