# Task checkpoint template

Copy the relevant sections into `.codex/crew-runs/<task-id>/progress.md` (Atlas) or `agents/<assignment-id>.md` (assigned specialist). Resolve the workspace root first. Each file has one writer; replace it atomically using a temporary file in the same directory. Do not commit checkpoints or record secrets, credentials, or raw sensitive payloads.

## Atlas: task summary

- Task ID / objective / approved plan reference / approval date:
- State: planning | initializing | implementing | verifying | finalizing | report-pending | completed
- Acceptance criteria / in-scope work / explicit exclusions:
- Original branch and HEAD for workspace, backend, frontend:
- Task branch and current HEAD per repository / initialization state per repository:
- Baseline directory: index backup, index entries, staged/unstaged patches, dirty/untracked file hashes, originals of files to edit:
- Explicit task-owned file/hunk allowlist / current Git writer per repository:
- Canonical API contract and architecture/documentation paths:
- Assignment IDs / role / agent ID if available / checkpoint path / dependencies / chosen fresh-or-inherited context:
- Original user request/constraints and correction references supplied independently to reviewer / grounding acknowledgments:
- Validated milestones: repository, commit hash, summary, verification:
- Changesets: repository, path, planned or committed state, final commit hash; no release where appropriate:
- Pending operation: intent, repository/path, expected precondition, observed result or unknown outcome:
- Blockers / verification gaps / next owner and action:
- Initial-plan save: intended unique path, payload path, saved receipt or pending/ambiguous result:
- Completion-report save: intended unique path, payload path, saved receipt or pending/ambiguous result:
- Finalization: intended changes committed, unrelated changes preserved, report saved, completion summary delivered, cleanup eligible:

## Specialist: delegated assignment

- Task ID / assignment ID / role / runtime agent ID if exposed:
- Objective / approved scope / acceptance criteria:
- Repository / task branch / base HEAD / current observed HEAD:
- Original user constraints (verbatim where material), subsequent corrections, approved exceptions / original request reference:
- Required instructions/docs read, representative existing implementation and canonical shared contract paths:
- Grounding: placement/patterns, architecture/state/contracts, reused services/controls and concrete gaps, constraints/exceptions, checks; source paths and Atlas acceptance:
- Owned code/test/docs files or area / checkpoint path (sole writer):
- Dependencies / interfaces / next recipient:
- Completed work / modified files:
- Verification: exact focused check, result, evidence, unexecuted checks:
- Milestone commits and hashes (owning engineers only under Atlas coordination; others reference the engineer):
- Pending operation and outcome / blockers / next step:
- Handoff state: grounding pending | grounded | implementing | ready for review | changes requested | review passed | Atlas integration accepted

An intended operation is not evidence that it ran. After interruption, reconcile these records against Git/files and reachable agents before resuming. Keep code/API/architecture decisions in their owning repository docs; use these checkpoints for coordination and references only.
