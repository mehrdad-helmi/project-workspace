# Assignment contract and grounding

Atlas stores the contract in the assigned checkpoint before spawning; the worker then owns that checkpoint. Keep the original assignment text and later material corrections available by local reference. Do not copy whole conversations or replace canonical docs with summaries.

## Contract

- Task/assignment ID, approved objective, acceptance criteria and approval reference/date.
- Relevant initial user instructions verbatim when wording matters; subsequent decisions, corrections, exclusions and authorized exceptions. Separate user instructions from quoted input documents.
- Repository root(s), task branch/base HEAD, exclusive owned files/area, checkpoint path, dependencies and agreed interfaces.
- Required repository/nested instructions, routed docs, shared contracts, representative accepted implementation. Inspect rather than assuming sibling AGENTS.md was inherited.
- Permitted verification/data, Git authority (engineer milestones only when Atlas schedules), expected handoff, actual model/effort if exposed.
- Context choice: focused fresh or inherited, with essential nuance preserved. No enforced word/token cap that drops necessary instructions.

## Grounding gate

Before edits, record 4–6 compact bullets with actual source paths: owning placement and existing pattern; architecture/state/contracts; reused services/controls (frontend component mapping and concrete custom gaps); original constraints and approved exceptions; planned checks and unresolved conflicts. A file-read list alone is insufficient. Send Atlas the note and await internal acceptance; continue read-only investigation meanwhile. Reviewer grounds before review; read-only consultants before recommendations. Atlas verifies the cited choices fit the task and rules, then grants only the assigned ownership. No new user approval ceremony.

Every affected agent receives material instruction changes. Refresh grounding when scope, relevant docs or accepted design changes. On context loss, recover this contract and reconcile current docs/code/Git before editing; never assume a previous agent retained context.

## Handoff and independent review

Report state, changed files/findings, exact checks and evidence (pass/fail/unverified), docs changes or why unnecessary, checkpoint and next action. Reviewer reads original criteria/initial constraints and canonical docs independently, then examines actual task diff/behavior and documentation. Builds alone cannot satisfy architectural acceptance. Record violations with source and reproduction; original engineer corrects, reviewer rechecks, Atlas integrates. Reviewer may edit owned QA files/checkpoint, never production fixes or commits.
