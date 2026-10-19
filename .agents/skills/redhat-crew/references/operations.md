# Crew operations

Atlas and the active Git writer read only the needed sections. Workers read the compact [protocol](../../../../docs/agents/crew-protocol.md); this reference preserves detailed recovery, Git, and save rules.

## Bun helper

Run `bun .agents/skills/redhat-crew/scripts/crew.ts <command> <absolute-config.json> [arguments]` from the workspace. No dependency installation is needed. Keep the task config outside tracked files and outside the not-yet-initialized task directory:

```json
{
	"taskId": "descriptive-task-id",
	"workspace": "D:/Planicam/planicam-workspace",
	"branch": "cycle/descriptive-task-name",
	"repositories": [
		{"id": "workspace", "cwd": "D:/Planicam/planicam-workspace", "allow": ["exact-owned-file.md"]},
		{"id": "backend", "cwd": "D:/Planicam/planicam-backend", "product": true, "allow": ["exact-owned-file.ts"]},
		{"id": "frontend", "cwd": "D:/Planicam/planicam-frontend", "product": true, "allow": ["exact-owned-file.ts"]}
	]
}
```

Use real, explicit path allowlists, including approved future changeset paths. A path is not permission to include unrelated hunks: inspect the generated diff. If a new changeset path becomes necessary after initialization, reconcile the recorded config deliberately rather than silently changing its allowlist. Omit `branch` only for an authorized maintenance update retaining current branches. The helper does not infer scope, approve plans, generate reports/changesets, change permissions, or replace agent coordination.

| Command and trailing arguments (config follows the command) | Purpose |
| --- | --- |
| `init` | Capture initial baselines; preflight both branch collisions; initialize/recover matching branches. Repeat only for the same recorded task; partial initialization blocks implementation. Run before creating manual files in this task directory. |
| `checkpoint progress.md <content-file>` or `checkpoint agents/<assignment>.md <content-file>` | Register and atomically write the caller's assigned checkpoint. Atlas persists the assignment before handing its checkpoint to the worker. |
| `begin <repo> <milestone>` | Capture fresh milestone baseline **before its edits**, checking recorded branch/HEAD/index and previous milestones. |
| `prepare <repo> <milestone>` | Derive baseline-to-current task patch; build temporary commit/index reconciliation trees. Returns exact files, review-diff path and tree hash. Inspect the entire diff before commit. |
| `commit <repo> <milestone> '<type(scope): message>' <inspected-tree>` | Commit precisely that reviewed tree and reconcile only its task patch into real staging. Fails closed on drift. |
| `recover` | Inspect actual branches/HEADs/index fingerprints and recorded operations; reconcile reachable agents separately. |
| `recover <repo> <milestone>` | Reconcile the already-created direct-child commit against recorded parent/tree/message, without duplicating it. When no commit occurred and preconditions/locks are safe, explicitly return the operation to prepared for review/retry. |
| `save plan <payload.json>` or `save report <payload.json>` | Atlas only: invoke existing create-only save CLI, retaining payload/intent/response and verifying receipt identity. Human approval is still required for the plan; reports use standing authorization. |
| `recover --save plan` or `recover --save report` | Reconcile an already captured local successful response after interruption. Never reads Command Center or blindly resends an uncertain save. |
| `finalize --summary-delivered` | Verify all repository/milestone preconditions and both save receipts after delivering the completion summary. This flag is an attestation, not automatic user acceptance. |
| `cleanup` | Delete registered task-owned files and empty directories only after successful finalization; unknown files/symlinks block cleanup. |

CLI operations use a task lock; Atlas still serializes repository Git writes across tasks and agents. A live or unverifiable lock owner blocks work. Retain uncertain save operations and payloads; if the CLI response was never captured, report pending finalization and resolve the actual outcome with Mehrdad instead of guessing. On a confirmed unavailable host, establish availability and explicitly reconcile the failed attempt before any authorized retry. There is no automatic retry or receipt fabrication.

Use `bun test ./.agents/skills/redhat-crew/scripts/crew.test.ts` for focused disposable helper verification; it does not run product suites. Source inspection and native configuration checks complement these fixtures. The helper cannot prove architecture compliance or user acceptance.

## Persistent checkpoints

Atlas creates `.codex/crew-runs/<task-id>/progress.md` in the workspace after plan approval and before implementation. This ignored directory is shared across the three repositories and survives context loss, model limits, agent failure, and session termination on this host. It is local recovery data, not a backup against disk loss. Use the [checkpoint template](task-checkpoint.md).

Atlas alone writes the summary; each assigned specialist alone writes `agents/<assignment-id>.md` after Atlas persists its initial contract and hands ownership over. Every role, including read-only researchers and Quality Reviewer, may write only its assigned checkpoint in addition to its ordinary file ownership. Keep updates compact and use atomic file replacement with a temporary file in the same directory. Do not store tokens, secrets, or sensitive raw payloads.

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

Atlas coordinates one Git writer per repository. Backend/Frontend Engineers own their validated milestone commits under Atlas coordination; consultants and Quality Reviewer do not stage/commit. Agree ownership before each Git operation, check the expected branch and HEAD, and stop to reconcile unexpected concurrent changes. Other writers must not change the index or refs during the commit operation.

Use Conventional Commits for cohesive, completed, appropriately verified units. Record the exact check and any unrelated pre-existing failures; do not label broken or incomplete work a validated milestone. Contract changes must remain consistent across teams. Document significant approved decisions alongside their implementation.

Stage only task-owned paths/hunks, inspect the complete prospective commit diff, and preserve all unrelated staged and unstaged work. Never use broad staging or a plain commit that would include an existing unrelated index. A dirty file can contain changes from several tasks; owning a filename does not mean owning its entire diff.

When existing staging or shared-file edits require isolation, use standard Git with a temporary `GIT_INDEX_FILE`:

1. Compare the captured working-file baseline to current content to obtain only the task's patch; confirm its explicit allowlist. Initialize the temporary index from the expected HEAD, apply that task patch to it, and inspect the staged tree/diff. A patch that requires unrelated dirty changes is not safely independent; pause and resolve ownership rather than importing them.
2. Commit with that temporary index, leaving the user's real index alone during commit construction. Record intent/preconditions before committing and the resulting hash immediately afterward.
3. Apply only the same task patch to the real index so it advances with the new HEAD while retaining the user's prior staged changes. Check unrelated working-file hashes, index entries, and staged/unstaged semantics against the captured baseline. New task files must be accounted for explicitly.

Do not clear or replace the user's index to simplify this procedure. If interrupted after the commit but before real-index reconciliation, inspect actual Git history first and finish the pending reconciliation; do not create a duplicate commit or reset history. Keep baseline material until this is verified.

### Changesets and branch lifecycle

After the owning engineers finish, Atlas reviews integration, relevant verification, canonical contracts, and documentation, and confirms intended implementation changes are committed. **Atlas alone** creates and commits applicable `.changeset/*.md` files in each changed repository that uses Changesets. Standing authorization for approved crew work replaces the backend's extra changeset confirmation only within that scope.

Read the existing configuration and package/format rules; preserve repository conventions and use no-release/empty changesets for instruction-only changes. Do not introduce Changesets into an unconfigured repository; report the limitation. Do not run version-bump, release, tagging, or publish commands. Use a conventional finalization message such as `chore(changeset): document <task-name>` and record final hashes.

Completion never grants permission to merge, rebase, squash, delete/dispose of task branches, push, create pull requests, release, publish, or deploy. These require explicit instructions. Leave both product repositories on their intact task branches. Report completion and await Mehrdad's next instruction; successful tests or agent consensus are not user acceptance.

## Recovery reconciliation

Before resuming modifications, locate the active task and its checkpoints, then:

1. Inspect each repository's actual branch, HEAD, index, working files, and recent task commits against recorded baselines/ownership. Detect unfinished Git operations, partial initialization, pending index reconciliation, changesets, and save operations.
2. Check which original agent IDs remain reachable using available agent controls. Request status from reachable agents; do not assume retained context. Recover completed files/commits and unfinished operations from evidence, not a stale progress claim.
3. Resume/reassign unavailable workers from their durable task contracts and current repository state. Update the runtime ID and ownership before replacement work. Never allow a replacement and an original agent to write the same files concurrently; interrupt/quiesce reachable stale writers first.
4. Reconcile intent/result gaps, then resume on the **recorded original task branches**. Do not duplicate successful commits, recreate already-present changesets, or blindly repeat saves with an unknown outcome. Unexpected branches/HEADs or irreconcilable overlapping edits require a decision, not a reset.

Use the same reconciliation on repeated recovery. On usage-limit failure, preserve the checkpoint and next step and report the actual limitation; do not promise a manual quota reset or repeatedly retry a blocked model.


## Approved-plan save

This is one of **two** standing Command Center save exceptions. It belongs to Atlas after Mehrdad explicitly approves the initial feature plan. The other is the verified completion report below. Standing save authorization does not approve a future plan. Do not save draft research, specialist proposals, test fixtures, or whole conversations.

1. Prepare JSON outside Command Center containing `source: "conclusions"`, a new task-specific `path: "workspace/<date>-<task-id>-plan.md"`, `title`, the actual `approvedAt` date in Asia/Tehran, `tags`, approved Markdown `content`, and `hash: null`. Include `sourceChat` only when an actual chat URL is already available; do not create a public share link just to populate it. Persist payload path, intended conclusion path, and save intent in the task checkpoint.
2. From the workspace, run `bun run --cwd command-center cc -- save @<absolute-json-path>`. Honor the existing environment, including a configured `CC_DATA_DIR`. The CLI handles authentication; never read or print the token or modify SQLite/Markdown directly.
3. Persist the returned save receipt and return the `/conclusions?scope=workspace&path=<URL-encoded-path>` link on the known app host. Do not browse the app to verify it or list/read other content.
4. If a path already exists, do not overwrite it or read existing conclusions. Report the collision and resolve the intended new path with Mehrdad. If the response is ambiguous, do not blindly retry and create duplicates. If the host is unavailable, retain the approved payload outside Command Center, report the unsaved plan, and continue independently authorized implementation; retry only once availability is established.

Future decisions made during implementation belong in the owning repository docs. The completion report is a separate record, not an automatic rewrite of the approved plan.

## Completion-report save

Treat **each completed top-level user assignment as one sprint**, never each delegated subtask. After implementation and final changeset commits, Atlas prepares a concise engineer-readable Markdown report from this task's recorded commits, verification, and documentation, excluding unrelated dirty changes. Use headings and bullets for UI, endpoints, database/schema, and engineering/documentation; state when a category has no changes. Include task identity, repository/branch names, milestone/final commit hashes, verification evidence, and remaining limitations.

Label it as an automatically generated verified-outcome report under Mehrdad's standing crew authorization. It does not establish user acceptance, plan approval for new work, or permission to merge/release. Save automatically through the same CLI and create-only rules as the plan, with a new `workspace/<date>-<task-id>-report.md` path, a completion-report title/tags, and the actual authorized report-finalization date in the required `approvedAt` metadata. Record the report generation date and standing-authorization basis explicitly in its content; do not claim Mehrdad separately reviewed the report.

Persist the payload and save intent first, then persist the receipt. If the save fails or its result is ambiguous, retain the checkpoint and payload, disclose `report-pending`, and do not blindly create duplicates or overwrite existing content. The same host-unavailable/collision rules as the plan apply. No other Command Center content or operations become permitted.

## Finalization and cleanup

Atlas verifies task-owned commits/changesets, unchanged unrelated work/staging, and successful plan/report save receipts. Deliver the completion summary with branches, commits, evidence, report link, and limitations in Codex before marking cleanup eligible. If a required save or reconciliation is pending, retain the checkpoint and explain the unfinished finalization even when implementation is complete.

After successful finalization and a delivered completion summary, remove only `.codex/crew-runs/<task-id>/` and its task-owned temporary files. Resolve and verify the exact directory is inside the intended crew-runs root, reject symlinks/junctions, and delete only recorded task-owned files followed by empty directories. Never recursively delete unknown files. Never remove sibling task data, product files, branches, user data, or unrelated recovery material. Do not recreate checkpoints for a completed assignment unless genuinely recovering unfinished work. Git commits and owning docs remain the durable implementation record; do not clean up task branches.
