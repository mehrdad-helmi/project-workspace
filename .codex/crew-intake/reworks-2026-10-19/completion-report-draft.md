# Cycle 1 Reworks — verified outcome

Automatically generated outcome report for `cycle1-reworks-20261019`, prepared on 19 October 2026 (Asia/Tehran) under Mehrdad's standing Redhat Crew authorization. This report records implementation and verification; it does not establish user acceptance or permission to merge, publish, or release.

The approved plan covers every entry in the explicitly supplied Reworks.md, tracked by 80 stable acceptance criteria (A01–A31, P01–P25, W01–W17, Q01–Q07). Direct user clarifications supply the Position groups/Figma reference and limit printouts to workflow/contracts, with unimplemented generators disabled and endpoint null. Independent review passed: all 80 unique criteria have individual evidence dispositions, zero pending items, and no remaining blockers within that approved scope.

The detailed [80-item acceptance audit](D:/Planicam/planicam-workspace/.codex/crew-runs/cycle1-reworks-20261019/agents/quality.md) distinguishes source review, executed checks, inspected owner evidence, fixture-only results, and explicitly approved scope exceptions. No original entry was omitted. Review completion does not establish Mehrdad's acceptance.

## UI

- Separate Organization Settings, Preferences, and Estimation Settings; align inner sidebars with the Project list pattern; edit allocated costs in property panels.
- Use shared PrimeNG Dialog/Select wrappers, anchored destructive ConfirmPopups, and a distinct ConfirmDialog for assignment. Customer, folder creation, and Element editing use the requested Popovers; folders use a hierarchical Tree.
- Give Fabrication Batches inner pages with actual batch breadcrumbs and physical Element tables. List rows select details; Name/Number links open the inner route. Nested batch assignment reports assigned/skipped outcomes. Late mutation success/failure cannot overwrite another selected Batch.
- Remove visible pagination while traversing bounded transport pages to retain all matching records. Keep column-header sorting and show compact Position cards without the previous five-item limit.
- Use one Project Save action with Next/Previous navigation, preserve drafts across steps and the created ID after first Save, stage attachments until Save, and reset discarded drafts when reopening. Keep customer summaries read-only at all three entry points.
- Restore the Figma-based two-column Position groups, explicit type, quantity, mandatory geometry, visible disabled empty catalog controls, and Auto switches displaying calculated values through the sole temporary engine.
- Implement Printouts → Elements → Options → Review and Results. Render all nine semantic controls through shared UI, preserve per-report options/formats, validate readiness and field paths, and provide explicit stale-definition recovery and result/retry/download contracts.

## Endpoints and contracts

- Registry GET returns PLANNED/AVAILABLE definitions with semantic icons and nullable endpoints; `canGenerate` is removed. Three planned definitions cover Estimation, Material Analysis, and Labour Hours from the supplied Logikal sources.
- Protected `POST /printouts/validate` accepts values only, resolves the server-owned JSON Schema 2020-12 definition, verifies exact eligible tenant-qualified physical Element IDs and unique supported formats, and returns scoped field errors or recognizable stale-definition conflicts. It performs no generation or persistence.
- Position creation requires an explicit type and accepts quantity 1–10000 and optional versioned initialDesign. The new Position UI always supplies its canonical initial geometry. Existing metadata-only callers remain supported.
- No production generation, download, or ZIP endpoints or fabricated report files were introduced. Future run/output/retry/download interfaces remain behind a source-neutral gateway.

## Database and schema

- Add PrintoutType endpoint, icon, and annotated requiredOptions JSONB using additive migration `20261019090000_printout_definitions`. Code-owned definitions remain authoritative; seed synchronizes the persisted projection.
- Atomically create Position metadata, public counters/numbers, requested physical Elements, optional design, status, and activities in one serializable transaction. NestJS performs no geometry calculation and no automatic ambiguous-write replay is claimed.
- Local development migration history was checked, the one additive migration deployed, and ordinary seeds applied without resetting the database or using personal data for tests. Schema history/diff aligned; all 49 seeded printouts have null endpoints and only the three planned definitions have option metadata.

## Engineering and documentation

- Direct Ajv 8 dependencies in both repositories validate the same schemas without coercion or default insertion. Strict calendar dates, required false/zero, finite numeric choices, JSON Pointers, and semantic metadata consistency are covered. Validation has a focused lazy entrypoint so the existing frontend build budget is preserved.
- Existing owning architecture/state/HTTP/domain/API/provisioning documentation and feature READMEs explain the accepted contracts and lifecycle changes. Applicable changesets exist in both repositories and remain uncommitted.
- Backend engineer, frontend engineer, and independent reviewer resumed from durable baselines after usage interruptions. Atlas owns the bounded Fabrication slice; all functional slices receive independent review.

## Verification

- Backend: Prisma validate/generate, build and scoped no-fix lint passed. Eight real JWT/Fastify endpoint checks passed against an isolated generated local PostgreSQL database, including tenant/access/stale/quantity/rollback behavior; that exact database was cleaned. Two focused pure control-parity checks passed and were independently rerun.
- Frontend: final post-Popover-correction production build passed at 804.58 kB against the unchanged 1 MB error budget. All 13 affected lint projects passed, with final changed-target rechecks after review corrections. Eleven scoped schema/pagination/printout-state checks passed with 55 assertions and were independently rerun; Fabrication stale-success/failure regression passed 2 checks/12 assertions and was independently rerun.
- Current-source isolated browser checks cover complete collections (125 Projects/Batches/picker choices, 105 physical Elements), Project Save/navigation/retained drafts/overflow, Position groups/cascade/Auto/quantity/design payload, all four printout stages and controls, date entry, and discard/reopen behavior. Fabrication passed 16 explicit checks plus delayed mutation success/failure through real UI submission and actual Angular Router parameter reuse.
- Independent fresh browser review passed 26 UI assertions plus a request-log check of 466 intercepted requests with zero mutations. This includes both actual programmatic Folder/Element Popover callers after the final shared adapter correction, typed date validation, Auto dimensions, complete lists, and Review/Edit draft retention, with zero Angular console/page errors. The final source, renderer and original Figma/reference screenshots were compared independently.
- All browser API traffic was mocked; no personal account or database writes were made by UI verification. Results layout was smoke-tested with injected development state and action spies; real store tests separately exercised an injected fake service. These do not claim real report generation, authorized file downloads, or ZIP bytes.

## Repository state and limitations

Both repositories remain on `cycle/redhat-crew#1`. Backend HEAD: `86c7b5073e264994f7f22615bd01d70b869f587a`; frontend HEAD: `fbd5453ce6a1100ea1b059b0c47d8d4e3b29a380`. No task commits were created, by direct user instruction. All rework and changesets are uncommitted; pre-existing staged entries and unrelated work are preserved. No merge, push, PR, branch deletion, or release occurred. Recovery records are retained for this deliberately uncommitted delivery.

Final task-relative audit: 110 frontend paths and 26 backend paths changed, zero out-of-scope drift. Exact staged-entry fingerprints remain backend `3b252483f02d8deb82ec66d171f976cb0a23984b88188d2e4c89c0d5575de180` and frontend `935f98945ff3aa7718d5757d8ec5f0e980ed897abf370624d8f2775e3f18884f`, matching initial baselines. Normal commit-based crew finalization is superseded by the approved no-commit exception; no commit or cleanup was fabricated.

Unimplemented production generators remain disabled with null endpoints and empty supported formats. Subsystem and rule-package catalogs have no established data/contracts, so their controls remain visible and disabled as approved. No compatibility rules or catalog identities were invented. Existing build-warning thresholds and the Ajv CommonJS optimization warning may remain; error budgets were not raised.
