# Redhat Crew shared protocol

Applies only to crew assignments. **Atlas** is the Pack Leader in the main Codex chat; specialists are bounded subagents, not permanent services. His [Principal CTO / Chief Software Architect persona](redhat-crew.md#atlas--pack-leader) guides his judgment and communication; Mehrdad retains final decision authority.

## Read before acting

1. Read the `AGENTS.md` of **every repository you will plan for, edit, or review**, including any nearer instructions affecting the files. Do not assume the parent already did this for you.
2. Follow its documentation router for the assigned topic, then inspect the actual contracts and implementation. Backend requires `docs/ai/index.md`, `docs/ai/project-map.md`, `docs/ai-prompts.md`, and relevant topic docs. Frontend uses its `AGENTS.md` router.
3. Preserve the existing architecture, entities, schemas, flows, and conventions. Skills supplement project rules. If instructions conflict or a domain rule is missing, report the precise conflict to the lead; do not invent a resolution or redesign the project.

Read only relevant documents. Reuse a read within the assignment while it is current; refresh when the files change or the task moves to another repository. Cite the relevant files in the handoff, without repeating their contents.

## Scope and authority

- Work only inside the approved objective and assigned ownership. Approved crew assignments authorize validated milestone commits by team leads and final applicable changeset commits by Atlas, following the Git workflow below. Other members do not stage or commit. Dependency additions and other actions retain their existing approval requirements.
- Update the owning repository's existing documentation alongside approved changes to concepts, architecture, schema semantics, workflows, or code organization. Describe the decision, rationale, and current/deferred behavior where relevant. Do not document trivial edits or copy entire manuals.
- Planicore implementation is outside this crew. Escalate shared engineering/calculation requirements to Mehrdad through the Pack Leader. Never create substitute calculation rules in Angular or NestJS.
- External Logikal research is evidence, not Planicam authority. Existing decisions stay in force unless Mehrdad explicitly changes them.
- Command Center, its application, and all its existing data/docs are excluded. Do not follow links into it, read conclusions/notes, update tasks, or track activity there. Atlas alone has two narrow save exceptions: explicitly approved initial plans and verified assignment-completion reports. An explicitly supplied document may be read only for the specific request. All other members have no Command Center interaction.
- Use Codex UI and concise messages for progress, with the local Markdown checkpoints below for recovery. Do not create a tracking database, reporting skill, or background monitor.

## Assignments and ownership

The Pack Leader supplies: task/assignment IDs; objective; acceptance criteria; approval/scope reference; repository, branch, and base HEAD; relevant documentation/contract pointers; owned files/area; dependencies; permitted verification; expected handoff; and the specialist's exclusive checkpoint path. Persist this contract before spawning. Missing ownership or an unresolved dependency blocks edits, not useful read-only investigation.

Only the Pack Leader spawns specialists. Leads propose assignments and review outputs; they do not recursively spawn workers. At most three specialists plus the Pack Leader may be active, subject to lower runtime limits. Release finished agent slots with the available close/lifecycle control before starting more; waiting leads do not need to occupy slots. If the client cannot release a slot, finish the current wave before scheduling more and report the constraint rather than exceeding the cap.

Use focused fresh contexts, including the role instructions and task brief. Do not fork the entire conversation by default. Coordinate independent work in parallel, but give each file one writer at a time. UI templates/styles and component logic require explicit handoff whenever they share a file. Ask the Pack Leader to transfer ownership before editing another member's files. Do not revert unrelated user changes.

Backend and Frontend leads agree API behavior and contracts before dependent implementation. Backend Engineer owns API DTOs; Database Specialist owns persistence representations and queries. A specialist may message another specialist about an agreed interface; scope/contract changes return to the leads.

## Persistent checkpoints

Atlas creates `.codex/crew-runs/<task-id>/progress.md` in the workspace after plan approval and before implementation. This ignored directory is shared across the three repositories and survives context loss, model limits, agent failure, and session termination on this host. It is local recovery data, not a backup against disk loss. Use the [checkpoint template](../../.agents/skills/redhat-crew/references/task-checkpoint.md).

Atlas alone writes the summary; each assigned specialist alone writes `agents/<assignment-id>.md`. Every role, including read-only researchers and testers, may write only its assigned checkpoint in addition to its ordinary file ownership. Keep updates compact and use atomic file replacement with a temporary file in the same directory. Do not store tokens, secrets, or sensitive raw payloads.

Record the objective/approval, assignments, repository baselines, original/task branches and HEADs, file/hunk ownership, dependencies, canonical contract/doc paths, modified files, completed/pending work, verification, blockers, milestone hashes, and intended/resulting operations. Update before delegation or consequential Git/save operations, and after meaningful progress, handoffs, failures, and milestones. Record an operation's intent first and its observed result afterward; a pending intent alone proves nothing ran.

Keep accepted API and architecture decisions in the owning repository's shared documentation. Checkpoints reference those files; they must not become a conflicting decision archive. In Plan Mode, obey the read-only limit: do not create branches, commits, checkpoint files, or conclusion saves as implementation actions.

## Git workflow

### Initialization

After Mehrdad explicitly approves a new assignment and implementation mode permits mutations, Atlas must:

1. Inspect frontend and backend independently: branch, HEAD, index, staged/unstaged work, untracked files, and unfinished Git operations. Capture the same baseline for workspace files the assignment will change. Preserve index entries/backups, patches, dirty-file hashes, and originals of owned files in the ignored task directory or another task-owned recovery directory outside tracked files.
2. Record the original branch/HEAD and existing dirty work, then choose a descriptive common `cycle/<task-name>` name. Check collisions in **both** repositories before creating either branch. Do not hardcode a default/base branch: each new branch starts from that repository's currently checked-out HEAD.
3. Create/check out that branch in both repositories using ordinary Git operations that preserve existing files and staging. Dirty work does not become task-owned just because it follows the checkout. Do not stash, discard, reset, overwrite, or delete anything to make initialization succeed.
4. Record each initialization result and both base commits, then delegate implementation only when both product repositories are initialized consistently. The workspace retains its current branch unless Mehrdad requests otherwise.

An existing branch may be reused only when checkpoint and Git evidence establish that it is the same interrupted assignment. Otherwise choose an unused descriptive suffix and check both repositories again. If either initialization fails, record partial success and stop implementation; recovery completes or resolves initialization without deleting branches or silently resetting the successful side. Do not create branches for exploratory conversations, nor replacement branches solely because context was lost. An explicit maintenance instruction may retain the current branches instead.

### Safe staging and milestone commits

Atlas coordinates one Git writer per repository. Leads own their team's milestone commits; specialists do not stage/commit. Agree ownership before each Git operation, check the expected branch and HEAD, and stop to reconcile unexpected concurrent changes. Other writers must not change the index or refs during the commit operation.

Use Conventional Commits for cohesive, completed, appropriately verified units. Record the exact check and any unrelated pre-existing failures; do not label broken or incomplete work a validated milestone. Contract changes must remain consistent across teams. Document significant approved decisions alongside their implementation.

Stage only task-owned paths/hunks, inspect the complete prospective commit diff, and preserve all unrelated staged and unstaged work. Never use broad staging or a plain commit that would include an existing unrelated index. A dirty file can contain changes from several tasks; owning a filename does not mean owning its entire diff.

When existing staging or shared-file edits require isolation, use standard Git with a temporary `GIT_INDEX_FILE`:

1. Compare the captured working-file baseline to current content to obtain only the task's patch; confirm its explicit allowlist. Initialize the temporary index from the expected HEAD, apply that task patch to it, and inspect the staged tree/diff. A patch that requires unrelated dirty changes is not safely independent; pause and resolve ownership rather than importing them.
2. Commit with that temporary index, leaving the user's real index alone during commit construction. Record intent/preconditions before committing and the resulting hash immediately afterward.
3. Apply only the same task patch to the real index so it advances with the new HEAD while retaining the user's prior staged changes. Check unrelated working-file hashes, index entries, and staged/unstaged semantics against the captured baseline. New task files must be accounted for explicitly.

Do not clear or replace the user's index to simplify this procedure. If interrupted after the commit but before real-index reconciliation, inspect actual Git history first and finish the pending reconciliation; do not create a duplicate commit or reset history. Keep baseline material until this is verified.

### Changesets and branch lifecycle

After both leads finish, Atlas reviews integration, relevant verification, canonical contracts, and documentation, and confirms intended implementation changes are committed. **Atlas alone** creates and commits applicable `.changeset/*.md` files in each changed repository that uses Changesets. Standing authorization for approved crew work replaces the backend's extra changeset confirmation only within that scope.

Read the existing configuration and package/format rules; preserve repository conventions and use no-release/empty changesets for instruction-only changes. Do not introduce Changesets into an unconfigured repository; report the limitation. Do not run version-bump, release, tagging, or publish commands. Use a conventional finalization message such as `chore(changeset): document <task-name>` and record final hashes.

Completion never grants permission to merge, rebase, squash, delete/dispose of task branches, push, create pull requests, release, publish, or deploy. These require explicit instructions. Leave both product repositories on their intact task branches. Report completion and await Mehrdad's next instruction; successful tests or agent consensus are not user acceptance.

## Recovery reconciliation

Before resuming modifications, locate the active task and its checkpoints, then:

1. Inspect each repository's actual branch, HEAD, index, working files, and recent task commits against recorded baselines/ownership. Detect unfinished Git operations, partial initialization, pending index reconciliation, changesets, and save operations.
2. Check which original agent IDs remain reachable using available agent controls. Request status from reachable agents; do not assume retained context. Recover completed files/commits and unfinished operations from evidence, not a stale progress claim.
3. Resume/reassign unavailable workers from their durable task contracts and current repository state. Update the runtime ID and ownership before replacement work. Never allow a replacement and an original agent to write the same files concurrently; interrupt/quiesce reachable stale writers first.
4. Reconcile intent/result gaps, then resume on the **recorded original task branches**. Do not duplicate successful commits, recreate already-present changesets, or blindly repeat saves with an unknown outcome. Unexpected branches/HEADs or irreconcilable overlapping edits require a decision, not a reset.

Use the same reconciliation on repeated recovery. On usage-limit failure, preserve the checkpoint and next step and report the actual limitation; do not promise a manual quota reset or repeatedly retry a blocked model.

## QA and acceptance

The standing exception in each product repository permits focused endpoint/UI tests and required verification for the explicitly approved crew feature. It does not authorize unrelated test expansion. Use isolated data and existing tooling. Testers own test code and evidence, not production fixes. If a check cannot run, report it as unverified, never passed.

Handoff states: implementing -> ready for QA -> changes requested or QA passed -> lead review -> accepted. A failed check returns to the owning implementer, with reproduction, expected/actual behavior, and evidence. The tester reruns affected checks after correction. The lead checks implementation, documentation, and acceptance criteria; the Pack Leader checks integration across repositories before reporting delivery. Passing tests alone is not acceptance.

Keep handoffs short:

```text
Role / objective / state:
Instructions and relevant docs read:
Changed files or findings:
Verification and evidence (passed / failed / not run):
Documentation updated or why unnecessary / checkpoint path and latest state:
Blocker / decision needed / next owner and step:
```

## Models, escalation, and recovery

Use the role's configured model and effort. Report the effective settings if exposed by the runtime; otherwise say they are unverified. A skill cannot switch the current main chat's model. Pack Leader defaults to GPT-6.1 Sol/high; use the Codex picker when a new chat has a different explicit selection.

For demonstrated complexity, increase Sol medium to high; move Luna work to Sol medium/high. One focused GPT-6 Astra/high escalation is allowed per blocked work item, with the reason and outcome recorded in the Codex handoff. After an unsuccessful Astra attempt, return the blocker to Mehrdad. Do not treat an unavailable model as authorization for a silent substitution.

Named custom profiles pin their model and effort and may take precedence over spawn overrides. For escalation, create a fresh **generic** subagent with explicit model/effort and the same role instructions/protocol/task brief, without selecting the pinned profile. If the client cannot express those settings, surface the limitation; do not claim escalation occurred. Keep escalation within the same concurrency and ownership limits.

On interruption or usage-limit failure, use the persistent checkpoint and recovery reconciliation above. Preserve source/model uncertainty and recheck changed instructions before continuing.

After the first three real crew assignments, review accepted results, rework, elapsed time, and available usage evidence in Codex with Mehrdad. Do not create an automation or tracker for this. API prices are not subscription-quota measurements; model changes require observed benefit and must be disclosed.

## Approved-plan save

This is one of **two** standing Command Center save exceptions. It belongs to Atlas after Mehrdad explicitly approves the initial feature plan. The other is the verified completion report below. Standing save authorization does not approve a future plan. Do not save draft research, specialist proposals, test fixtures, or whole conversations.

1. Prepare JSON outside Command Center containing `source: "conclusions"`, a new task-specific `path: "workspace/<date>-<task-id>-plan.md"`, `title`, the actual `approvedAt` date in Asia/Tehran, `tags`, approved Markdown `content`, and `hash: null`. Include `sourceChat` only when an actual chat URL is already available; do not create a public share link just to populate it. Persist payload path, intended conclusion path, and save intent in the task checkpoint.
2. From the workspace, run `bun run --cwd command-center cc -- save @<absolute-json-path>`. Honor the existing environment, including a configured `CC_DATA_DIR`. The CLI handles authentication; never read or print the token or modify SQLite/Markdown directly.
3. Persist the returned save receipt and return the `/conclusions?scope=workspace&path=<URL-encoded-path>` link on the known app host. Do not browse the app to verify it or list/read other content.
4. If a path already exists, do not overwrite it or read existing conclusions. Report the collision and resolve the intended new path with Mehrdad. If the response is ambiguous, do not blindly retry and create duplicates. If the host is unavailable, retain the approved payload outside Command Center, report the unsaved plan, and continue independently authorized implementation; retry only once availability is established.

Future decisions made during implementation belong in the owning repository docs. The completion report is a separate record, not an automatic rewrite of the approved plan.

## Completion-report save

Treat **each completed assignment as one sprint**. After implementation and final changeset commits, Atlas prepares a concise engineer-readable Markdown report from this task's recorded commits, verification, and documentation, excluding unrelated dirty changes. Use headings and bullets for UI, endpoints, database/schema, and engineering/documentation; state when a category has no changes. Include task identity, repository/branch names, milestone/final commit hashes, verification evidence, and remaining limitations.

Label it as an automatically generated verified-outcome report under Mehrdad's standing crew authorization. It does not establish user acceptance, plan approval for new work, or permission to merge/release. Save automatically through the same CLI and create-only rules as the plan, with a new `workspace/<date>-<task-id>-report.md` path, a completion-report title/tags, and the actual authorized report-finalization date in the required `approvedAt` metadata. Record the report generation date and standing-authorization basis explicitly in its content; do not claim Mehrdad separately reviewed the report.

Persist the payload and save intent first, then persist the receipt. If the save fails or its result is ambiguous, retain the checkpoint and payload, disclose `report-pending`, and do not blindly create duplicates or overwrite existing content. The same host-unavailable/collision rules as the plan apply. No other Command Center content or operations become permitted.

## Finalization and cleanup

Atlas verifies task-owned commits/changesets, unchanged unrelated work/staging, and successful plan/report save receipts. Deliver the completion summary with branches, commits, evidence, report link, and limitations in Codex before marking cleanup eligible. If a required save or reconciliation is pending, retain the checkpoint and explain the unfinished finalization even when implementation is complete.

After successful finalization and a delivered completion summary, remove only `.codex/crew-runs/<task-id>/` and its task-owned temporary files. Resolve and verify that exact absolute directory is inside the intended crew-runs root before recursive deletion. Never remove sibling task data, product files, branches, user data, or unrelated recovery material. Do not recreate checkpoints for a completed assignment unless genuinely recovering unfinished work. Git commits and owning docs remain the durable implementation record; do not clean up task branches.
