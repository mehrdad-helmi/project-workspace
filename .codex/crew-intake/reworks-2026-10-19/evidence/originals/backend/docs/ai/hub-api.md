# Hub APIs

The Hub uses the existing protected `/v1` REST API and success envelope `{ statusCode, message, data }`. Projects, positions, contacts, and fabrication batches return `{ items, total, page, pageSize }` from their primary list routes. Configuration registries, folders, phases, element lists, and attachment lists return arrays. Dates are ISO UTC timestamps; decimal amounts and file sizes are lossless strings.

## Identity, validation, and concurrency

Every tenant selector comes from `@CurrentActor()`. Request bodies cannot select another organization or actor. All active organization roles may read. OWNER and ADMIN may write organization configuration; MEMBER may also write projects, contacts, positions, elements, folders, phases, attachments, and fabrication batches. VIEWER is read-only. Global JWT protection remains in effect; CASL remains deferred.

Existing-record writes require `expectedVersion` of the resource being edited. Favorites are a per-user idempotent boolean and do not alter the shared record version. Element updates/deletion use the Element version; element creation and quantity changes use Position version. Fabrication assignment uses Batch version and advances affected Element and Position versions. Attachment upload/removal uses Project version and returns `projectVersion`.

Version mismatches return `409` with `error.code = VERSION_CONFLICT`. Archived parents block directed edits; archived data remains readable, and existing batch assignments survive archiving. A quantity reduction that cannot remove enough safely empty Elements returns `409 ELEMENT_SELECTION_REQUIRED` and requires explicit Element selection. Deletions preserve the repository's provenance and numbering rules.

List queries accept `q`, `page` (1-based), `pageSize` (or `size`, maximum 100), `sortBy`, `sortDirection`, `archive=active|archived|all`, and the applicable `favoritesOnly`, `folderId=root|uuid`, `projectId`, `phaseId=none|uuid`. Repositories allow only known sortable columns and use IDs as deterministic tie breakers. Lookup lists are intentionally unpaginated.

`GET /projects/statistics` returns unfiltered tenant-wide `{active,archived,favorites,root,folders}` counts; favorites use the current actor and folder counts include active projects directly in each folder. These counters stay independent from the current page/search/filter. Project and Position `warningCount` counts persisted unresolved WARNING/ERROR issues (INFO is omitted); zero does not imply that calculations have run. Position list responses include the stored design input used for dimension presentation, without calculating engineering output.

Scalar PATCH bodies merge only supplied fields. Null clears nullable fields; it cannot clear required fields. Canonical JSON configuration values are complete replacements, validated against the decorated contracts without numeric coercion. Omitted roots are never recursively merged. Pricing adjustments remain an ordered array `{ label, direction: SURCHARGE|DISCOUNT, percentage: decimal-string, cap?: decimal-string }`.

## Routes

| Family | Implemented operations |
| --- | --- |
| `/projects` | GET list, POST create; GET/PATCH/DELETE `/:id`; PUT `/:id/favorite`, `/:id/archive` |
| `/project-folders` | GET list, POST create; PATCH/DELETE `/:id` |
| `/projects/:id/phases` | GET list, POST create; PATCH/DELETE `/:phaseId` |
| `/positions` | GET list, POST create; GET/PATCH/DELETE `/:id`; PUT `/:id/favorite`, `/:id/archive`, `/:id/quantity` |
| `/positions/:id/elements` | GET list, POST `{expectedVersion,count}`; PATCH/DELETE `/:elementId` |
| `/positions/:id/activity` | GET paginated append-only activity |
| `/positions/:id/design` | POST `/initialize`, PUT save; `{expectedVersion,schemaVersion,input}` |
| `/contacts` | GET list, POST create; GET/PATCH/DELETE `/:id`; detail includes Project uses |
| `/fabrication-batches` | GET list, POST create; GET/PATCH/DELETE `/:id`; PUT `/:id/archive` |
| `/fabrication-batches/:id/assignments` | POST `{expectedVersion,elementIds}` or `{expectedVersion,projectIds}`; DELETE `/:elementId` with Batch expectedVersion |
| `/organization/settings` | GET, PUT or PATCH supplied scalar settings |
| `/organization/estimation-data-sets` | GET list, POST create; PUT complete configuration/DELETE `/:id` |
| `/organization/allocated-costs` | GET list, POST create; PATCH/DELETE `/:id` |
| `/organization/vat-rates` | GET list, POST create; PATCH/DELETE `/:id` |
| `/organization/labor-hours` | GET, PUT complete maps; GET/PUT `/systems/:systemProfileId` |
| `/organization/preferences` | GET all; GET/PUT `/:kind`, where kind is system/color/filling/other |
| `/organization/currency-rates` | GET list; PUT directional rate; DELETE `/:from/:to` |
| `/projects/:id/estimation-settings` | GET, PUT complete roots; POST `/replace-source` `{expectedVersion,estimationDataSetId,confirmed:true}` |
| `/projects/:id/allocated-costs` | GET list, POST local cost; PATCH/DELETE `/:costId` |
| `/projects/:id/preferences` | GET all; GET/PUT `/:kind`; POST `/:kind/replace-source` `{expectedVersion,confirmed:true}` |
| Catalog and options | GET `/hub/options`, `/system-profiles`, `/suppliers`, `/discount-groups?supplierId=...`, `/currencies`, `/printout-types` |
| `/projects/:id/attachments` | GET list, POST upload; GET `/:fileAssetId/download`, DELETE `/:fileAssetId` |

The source of request field names is each feature's `api/dto/` folder. The estimation, labor, and preference JSON contracts stay in their owning `types/*-json.contracts.ts` files. The API success/error decorators use the existing shared envelopes; downloads document raw bytes.

## Workflow details

Project creation validates the directory Contact and copies addresses/commercial values and organization configuration atomically. The response retains canonical `customer: {id,name,number}` alongside independent snapshots. Replacing a snapshot requires `confirmed:true`, checks the current local version, revalidates the source tenant, and advances provenance. Organization edits never update existing Project copies automatically. Standard and built-in records retain their protected identities.

New Positions are CREATED, have one initial Element, and have no design. Initialization reuses that Element. The backend stores versioned design input and records activity; it does not calculate engineering output. The approved temporary frontend engine remains a frontend concern. Thumbnail keys refer to the independent read-only development thumbnail service.

Batch assignment is one-time bulk selection: only active, unassigned, nonexcluded Elements are assigned. Already assigned, excluded, or archived candidates are reported in `skipped` with explicit reasons. Future Elements are not automatically enrolled. Batch deletion unassigns existing Elements transactionally.

Rates are directional positive decimal values; no inverse or triangulated rates are invented. A first rate or system labor override is created without `expectedVersion`; replacing an existing row requires it. Printout registry entries return literal badges and `canGenerate:false`; no report generation route is implied.

Signup now calls Organizations provisioning inside its existing serializable account-creation transaction. Normal seeding remains separate from the explicitly development-only `bun run seed:demo` command.

## Development attachment storage

Upload JSON is `{expectedVersion,originalFilename,mimeType,contentBase64}`. The decoded file limit is 10 MiB; this route's Fastify body limit is 15 MiB to accommodate base64 and JSON overhead. The adapter generates an opaque UUID key and stores bytes under ignored `.local/attachments/`; client filenames are metadata only. SHA-256, size, MIME, uploader, and tenant are persisted in `StorageFileAsset`, linked to `ProjectAttachment`.

Tenant access is checked before writing bytes and again in the metadata transaction. Failed metadata writes remove the newly written file. Removal detaches the Project association and applies the existing reference-aware asset lifecycle; it retains local bytes. Filesystem and database commits cannot form one ACID transaction, so a process crash between those steps can leave an unreferenced local file. This development adapter does not implement production blob retention or cleanup. Download requires the tenant-owned Project association, streams bytes outside the JSON envelope, and uses attachment disposition plus `nosniff`.
