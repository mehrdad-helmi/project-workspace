# project-management-feature

This library was generated with [Nx](https://nx.dev).

## Hub workflows

Project and Position pages use scoped stores and live source-neutral gateways. Recent means `updatedAt DESC`; sortable server columns apply to the whole paginated collection. Project/Position favorites are personal bookmarks; archive is organization-wide. Archived parents prevent editing while retaining existing child archive flags and batch membership. Warning counts represent persisted unresolved WARNING/ERROR issues, not a claim that engineering has run.

The shared creation/header modal uses the shared PrimeNG Stepper. Only the initial project details are mandatory. Create finishes immediately; the explicit Create and continue setup action persists the Project, then offers independent attachment/preference/estimation/cost saves using its assigned ID. These optional writes are visibly separate operations, not an atomic multi-resource create. Customer identity stays live; address/commercial defaults copied at creation become project-owned values. Additional addresses use unique custom labels. Failed writes retain drafts and original versions; snapshot replacement requires confirmation.

New Position starts with exactly one physical Element. Optional rectangular initialization reuses it. If create succeeds but initialization fails, the modal retains the created ID and retries initialization without repeating creation. Field counts control individual width/height inputs; a blank partial is Auto, shown in the leading input-group addon. Quantity changes operate on physical Elements; unsafe reductions require explicit Element selection. The editor tracks submitted revisions and warns before discarding unsaved input.

Project, Position and Element actions can add eligible physical Elements to a selected active fabrication batch. The selection is one-time, and the result reports assigned/skipped items. Printout links preserve project/phase/position context and resolve the real catalog. Generation is deferred for every status badge. Supplier article, cross-section, subsystem/rule-package and color/filling selectors depend on catalog contracts not yet exposed by the API; the UI preserves existing references and identifies unavailable choices without fabricated records.

## Project attachments

`ProjectAttachments` provides a component-scoped `ProjectAttachmentsStore` and uses the domain service/gateway boundary. Cloud app composition installs `provideCloudProjectAttachmentsGateway()`. Loading combines the attachment list with the current project version/archive state; Refresh is also the conflict-recovery action. Upload and removal use optimistic project versions, retain failures inline, and propagate each successful `projectVersion` to the parent project view. Parent snapshots cannot downgrade the local version.

The file picker supports PNG/JPEG/WebP/GIF, PDF, text/CSV, Word/Excel, and OpenDocument files up to 10 MiB. The cloud adapter encodes uploads in bounded chunks and uses authenticated byte downloads. Raster images have an inline preview; PDFs can open in a separate tab, and every file can download. Removal requires confirmation. Browser object URLs are released when previews close, their attachment is removed, the project changes, or the component is destroyed. Archived projects allow reading and downloading only. Route context changes cancel pending operations and reject stale outcomes; writes are not automatically replayed.

This uses the backend's development attachment storage adapter. Production object storage, retention and cleanup remain deferred as documented by the backend.
