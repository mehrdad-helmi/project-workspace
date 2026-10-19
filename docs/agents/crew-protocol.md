# Redhat Crew operational brief

Atlas coordinates; Backend Engineer and Frontend Engineer implement whole slices; Quality Reviewer independently checks every functional feature. Logikal, Database, and UI/UX consultants run only when needed. Atlas can handle small work; trivial docs/cosmetic work needs no separate reviewer. Only Atlas spawns, at most three specialists. Reuse engineers for fixes. One writer per file and one Git writer per repository.

## Ground before acting

Every member explicitly reads the affected repository's AGENTS.md and nearer instructions, follows its relevant documentation router, and inspects actual contracts/code. Workspace context does not automatically load sibling instructions. Backend starts with docs/ai/index.md, docs/ai/project-map.md, and docs/ai-prompts.md. Read topic docs/skills selectively; reuse current reads, refresh on relevant changes. Project rules and approved exceptions govern generic skills.

Atlas persists the [assignment contract](../../.agents/skills/redhat-crew/references/worker-brief.md) before delegation: original objective/criteria, exact important initial instructions, decisions/corrections/exceptions, repo/branch/HEAD, ownership, dependencies, docs/examples/contracts, permitted checks, Git responsibility, checkpoint, expected handoff. Send essential subsequent user corrections to affected workers and reviewer. Use fresh context only when sufficient; inherit history when nuance would be lost. Never omit required knowledge to save tokens.

Before edits, each worker records source-linked grounding in its checkpoint: placement/patterns, architecture/state/contracts, reused components/services, constraints/exceptions, checks. Send Atlas the note and wait for Atlas's internal acceptance. Read-only investigation may continue. Reviewers ground before review; consultants before research/proposals. Unresolved conflicts or missing domain rules block affected work, not useful investigation. Atlas's check creates no new user approval requirement.

## Implement and review

Preserve accepted flows, entities, schemas, architecture, and current authorized exceptions. Document significant approved concepts/decisions in existing owning docs alongside implementation; no parallel decision archive or trivial-change docs. Calculation work follows current ownership and explicit documented exceptions; new ownership changes and unapproved Planicore work return to Mehrdad. Logikal evidence never overrides Planicam decisions.

Frontend: inspect existing shared controls and relevant PrimeNG guidance. Reuse/add thin Planicam wrapper first, minimally extend second, custom only for a concrete unmet requirement. Record component mapping/gap before edits. Preserve shared/ui vendor boundary, Signal Forms, state flow, tokens and accessibility. Native elements with appropriate PrimeNG directives inside approved wrappers are valid.

Reviewer independently receives original constraints/approved plan/docs, inspects actual diff and allowed behavior checks, and blocks instruction, architecture, unjustified-control, or documentation violations even if builds pass. No production fixes by reviewer. Flow: grounded → implementing → ready for review → changes requested/corrected → review passed → Atlas integration accepted. Failed checks need reproduction/expected/actual/evidence; unexecuted checks remain unverified.

## Operations router

Keep compact [checkpoints](../../.agents/skills/redhat-crew/references/task-checkpoint.md). Read detailed procedures only when doing the operation:

- [Git workflow](../../.agents/skills/redhat-crew/references/operations.md#git-workflow): baseline/branches, task-only engineer milestones, Atlas final changesets; preserve dirty work/staging. No unauthorized remote/release/history actions.
- [Recovery](../../.agents/skills/redhat-crew/references/operations.md#recovery-reconciliation): actual Git/files/reachable agents before edits; no overlapping replacement writers or duplicate operations.
- [Approved-plan save](../../.agents/skills/redhat-crew/references/operations.md#approved-plan-save), [completion report](../../.agents/skills/redhat-crew/references/operations.md#completion-report-save), [cleanup](../../.agents/skills/redhat-crew/references/operations.md#finalization-and-cleanup): Atlas only, once per top-level assignment. All other Command Center content/actions excluded.

Use configured model/effort; unavailable settings are reported, never silently substituted. One reasoned Astra/high escalation per blocked item; unsuccessful escalation returns to Mehrdad. Preserve recovery state on limits; never promise resets.
