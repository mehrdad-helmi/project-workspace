# Domain workflows

Read [schema/contracts and coverage](data-model-contracts.md) and [provisioning](provisioning.md) first. Hub persistence workflows described below are implemented as of 2026-10-18, including transactional numbering/provisioning, tenant-qualified repositories, optimistic versions, snapshots, archives, bookmarks, batch membership, attachments and configuration. Engineering calculations and printout generators remain deferred. Do not infer a calculation or generator from a schema relation or DTO.

## Numbering — NumberingModule (original §2)

- Internal UUIDv7 keys identify relations. Public number is a separately stored immutable string, never a foreign key or a manual input.
- Allocate in PostgreSQL in the same transaction as entity creation. Atomically update the relevant counter, resolve the prefix at allocation time, render stored format/marker, insert number and sequence, then commit. Rollbacks roll back allocation. Never use MAX(number), Redis authority or owner-local next counters.
- Organization-scoped counters: PROJECT, CONTACT and FABRICATION_BATCH, starting at zero. Project-scoped counters: POSITION and PROJECT_PHASE, starting at zero. Position-scoped ELEMENT starts at one.
- Project/Position use {prefix}-000 with no marker. Contact/Batch/Phase/Element use {prefix}-{marker}-0000 with CT/FB/PH/EL respectively. Zeros specify minimum width, never a maximum. Numbers extend naturally after that width.
- Project/Contact/Batch allocation reads the current Organization.projectNumberPrefix (2–3 characters). Suggest it from Organization-name initials; later Organization prefix edits affect future allocations only and never restart counters.
- Position/Phase allocation reads the Project.positionPrefix, suggested from Project initials and editable only during creation. Require Organization-unique prefixes, immutable after creation including rename.
- Element allocation reads the entire immutable parent Position number, e.g. BL-000-EL-0001. Element ordinal 1 is local to its Position.
- No number is user-editable, recomputed on rename/prefix changes, or reused after deletion. Preserve the scoped number/sequence unique constraints.
- Current format tokens are only {prefix}, {marker} and the zero run. Formats are application-owned, not user formulas. Future date/millisecond syntax needs an explicit design and compatible SQL-check update; none is implemented now.

## Projects, customer data and conditions — ProjectsModule / ContactsModule (§3, §10)

A Project always references an existing same-Organization Contact. Creating a Contact inside the New Project UI is a convenience: finish directory creation, then submit customerId normally. Do not create Project-only customer identities. Contact classification (Customer/Vendor/Architect/Other) and legal kind (Person/Company) are distinct; every Contact receives a Contact number, regardless of type.

Live fields displayed from the Contact are name, Contact number, email, phone/secondaryPhone, commercialContact and technicalContact. Contact changes to these are reflected in existing Project displays. Project street/city/postalCode/country, additional addresses, conditions, pricing adjustments and all three estimation groups are independently owned copies. A Contact move must never relocate old Projects.

Contact.defaultEstimationDataSetId can preselect a reusable set. An explicit valid user selection wins; otherwise use a selected/available Contact preference, otherwise Organization Standard. Record selected source ID/version as provenance, not live calculation lookup. All referenced customers/templates/folders belong to the same tenant.

Conditions are plain text with Planicam-wide placeholder tokens, resolved only when used/generated. Date and Total are the initial illustrated variables. No rich-text storage, pre-rendered persistence, condition-template table or Organization-defined-variable subsystem now. Revisit exact supported token semantics when implementing rendering.

Project pricing adjustments retain ordered labels, explicit SURCHARGE/DISCOUNT direction, nonnegative decimal-string percentages and optional caps in estimationCurrency; additional addresses are arbitrary label→plain text maps. No address child table. responsiblePerson is free text, not a User relation. createdBy is metadata, not permission. Archive and soft-delete timestamps are distinct. Project archive hides its child Positions and blocks their direct mutations while preserving child archive/exclusion/Batch values. Do not add quotation number, ProjectHeader, all-users permission switches, a Project-only customer, or personal preference flags.

Contacts have only the documented primary address and string freeData. Omit Person/Company/ContactPerson/ContactAddress tables, Fax, Name1/Name2, extra customerReference and independent display-sequence fields. Contact soft deletion must preserve Project relationships and snapshots.

## Folders, favorites, attachments and Phases — ProjectsModule (§4–6)

Folders are UI organization wrappers, with an adjacency parent relation and virtual root. No root row or ownership/permission/workflow effects. Root folder parentId and root Project folderId are null. Nested moves stay in the Organization and must reject self/descendant cycles.

Delete Folder F transactionally: reparent direct child folders and directly contained Projects to F.parentId, then hard-delete F. For a root folder they become root-level. Never recursively delete descendants or Projects.

Favorites are per-user bookmarks, unique by user/project; there is no Project.isFavorite or personal-preferences subsystem. Attachments are minimal Project/StorageFileAsset associations; MIME/kind distinguishes image/document formats. Reuse storage rather than duplicating binary tables.

Phases are optional flat Position groupings inside a Project. Preserve unique Project name/number/sequence and same-Project assignment. No nested Phases, status/date/permission/production additions. Delete a Phase by setting only its Positions' phaseId to null and hard-deleting it in one transaction; the Positions remain and the name becomes reusable. Do not attempt composite SET NULL on projectId.

## Fabrication — FabricationModule (§7)

A Batch is an Organization-wide manufacturing group of individual Elements across any Projects in that tenant. PLANNING means preparation, PRODUCTION active manufacture and COMPLETED finished processing. The business reference is Batch number, never assembly number or legacy Fabrication Phase. Responsible person is text; deploymentDate is date-only.

Elements have zero or one Batch. Individual assignment is supported. Selecting a Project performs one bulk operation over currently existing, non-deleted Elements that are both unassigned and not excluded. Skip other-Batch assignments; never silently reassign them. Skip excluded Elements. New Elements created afterward do not join automatically. Excluding an already assigned Element does not remove its Batch assignment.

There is no persistent Project↔Batch association or automatic membership rule. Delete a Batch by unassigning its Elements and hard-deleting the Batch in one transaction; never delete Elements. Enforce tenant consistency and write appropriate PositionActivity records in the mutation transaction.

## Position lifecycle and Elements — PositionsModule (§8–9)

Each Position has one required primary SystemProfile, immutable after creation. The temporary profile has only id/name/category; Standard—Always is a labor baseline, not an eighth category. Keep all seven category names, including Lift-and-Slide Doors. Position numbering is Project-wide, independent of Phase.

CREATED means engineering has not been initialized. New Position creation atomically produces metadata, no design, an Element counter, and exactly one Element with sequence 1. First initialization creates PositionDesign and sets IN_PROGRESS while reusing existing Elements. It never creates a duplicate Element 1. Later Element count can reach zero without deleting the design, reverting initialization or recreating Element 1. Engineering input remains an explicitly deferred opaque contract; persistence stores the supplied versioned document without claiming engineering validation or server calculation.

IN_PROGRESS means initialized/editable, possibly incomplete. READY means engineering checking succeeded; it does not mean quoted, ordered, manufactured or completed. Engineering status and calculation freshness are independent. Door/Window engineering is initially required; schema recognition of Curtain Wall/Slider does not promise their implementation.

The Position's canonical versioned engineering JSON is shared by all physical Elements. A different instance design requires a different Position. Do not store geometry overrides on Elements, derived calculation results as editable input, relational geometry columns, or editor selection/hover/cursor/panel/view/undo state inside canonical input. Planicore consumes explicit inputs and produces outputs; its absent input/output contracts must be supplied before engineering persistence endpoints claim structural validation.

Quantity is count of non-deleted Elements. Effective quantity additionally filters isExcluded=false for calculations, quotations and printouts. Use one exclusion flag for all three. Exclusion does not remove the row, change design or unassign a Batch.

When reducing quantity, automatically soft-delete only enough truly empty instances, deterministically and transactionally. Empty means no description, building location, Batch assignment, non-default exclusion flag or other meaningful instance data. If insufficient empty instances exist, reject silent reduction and require explicit deletion through Element Management. Explicit instance removal never alters shared geometry or reuses its number. Element Management owns create/list/edit/remove metadata; full production workflows remain separate.

## Audit, editor history and diagnostics — PositionsModule (§9.5–9.7)

Bounded configurable undo/redo stays in the editor session. Group high-frequency drag/pointer updates into semantic committed actions. Never persist mouse movement, selection, each undo command, a PositionRevision table, restorable snapshots or a restoration guarantee.

PositionActivity is append-only major committed change history: who/what/when, optional actor reference plus frozen display name, typed summary/context. Include creation, meaningful design saves, metadata/status/Phase changes, Element changes, exclusion and Batch changes, and deletion where appropriate. Write the activity in the same transaction as the state mutation. It cannot reconstruct a prior design.

PositionIssue persists engineering/catalog/system findings outside the editor and can surface in Hub/Project overviews. Refresh matching (positionId,fingerprint) findings instead of duplicating them. Preserve first/last detection and separate acknowledgement from resolution. INFO/WARNING/ERROR severity does not itself determine calculation freshness.

PositionCatalogDependency is a derived index of System/Profile/Article/Color/Filling/Hardware identities and observed versions, indexed by referenced type/id. Future catalog models are not required for these UUID references. Used-catalog changes may mark calculations STALE and create/refresh issues. Recalculation updates derived summary, engine version, fingerprint, time, freshness and diagnostics. No catalog-change detection/recalculation workflow is implemented here.

## Estimation snapshots, VAT and preference replacement — EstimationModule / PreferencesModule (§11–12, §15–16)

Organization Estimation Data Sets are editable reusable templates, not live policies or calculated estimates. Each has three separate JSON roots. Standard is exactly one per Organization, editable but not renamable/deletable. Custom sets are soft-deletable. Enforce active-source selection in later endpoints.

ProjectEstimationSettings is a separate row with three independently copied JSON columns plus source ID/version. Create it atomically with the Project. Calculations read Project-owned JSON, never current template JSON. Local edits increment local version, preserving sourceVersion until explicit source re-application. Source soft deletion retains copies and origin links.

VAT is Organization-owned percentage-only, may be zero, and has no currency. Templates optionally reference VatRate; application copies the current applicable percentage into Project standardEstimation. Later VAT changes never alter existing Project percentages. No jurisdiction, tax effective-date or accounting subsystem.

Organization allocated costs include exactly five protected identities: Insulation/Sheet Metal → ELEMENT; Travel Costs/Scaffold Costs/Accommodation Allowance → WAGE. Names and sectors are fixed; do not delete/soft-delete or remove built-in identity. Price, currency, allocation basis and quotation display are editable. Custom global costs may be renamed/edited/soft-deleted. Illustrative source prices are not mandatory seed values.

New Projects copy every active global cost, including all five built-ins and active custom rows. Retain source ID/version and currency. Project copies are independently editable; copied custom rows can be removed and Project-only custom rows have null source ID/version. Protect the five Project built-ins identically. Global custom deletion must not remove copies or clear provenance.

Each Organization/Project has one Systems/Colors/Fillings/Other preference per category. These are defaults/suggestions, never catalog-access policies or immutable engineering restrictions. Copy JSON and source ID/version on Project creation. No personal preferences, Project labor overrides, generic inheritance resolver, Wall Section model or additional System access policy.

Changes to global templates/costs/preferences affect subsequently created Projects only. Existing snapshots never synchronize automatically. Later full replacement requires explicit user confirmation, copies the selected source's current complete values and advances sourceVersion. No partial merging or automatic propagation. Retain origin references after local customization. A sourceVersion mismatch says the source advanced, not that the destination was customized.

## Labor Hours — EstimationModule (§13)

Labor standards are operation durations, not financial hourly wages. Resolve values for the Organization/SystemProfile in this order: Standard—Always → matching category → specific SystemProfile override. Resolve at the operation/coefficient level; do not replace a whole category merely because one override exists. Missing means inherit; zero is explicitly configured, never false/missing.

Initialize the universal map and all seven category maps. Different Organizations may override the same shared SystemProfile independently. Simple records have up to eight applicable coefficients across four work categories. Rule records retain multiple conditional rows, all documented dimensions/units, subsystem, material and comment. Preserve the complete operation hierarchy and all 46 material choices in the canonical registries.

For Wall Connections, Add-On Profiles, Couplings and Bottom Configuration, store a record for each referenced future catalog item, not one numeric value for the group. Do not create catalog-member tables or individual operation SQL tables. Rule evaluation/matching and operation-time calculations are later work; do not invent an algorithm in this schema phase.

## Suppliers and Discount Groups — CatalogModule (§14)

Supplier access: own Organization Supplier; or public platform Supplier; or platform Supplier with explicit Organization grant. Organization-owned Suppliers remain private to the owner and cannot be shared by isPublic or grants. Grants initially are manually maintained by Planicam's team; no Supplier Studio. Development platform Supplier seeds must be public. Supplier is not the same as a Contact classified Vendor.

Enforce access when associated Discount Groups are retrieved or used, not merely in Supplier listing. JSON references to existing Supplier/Group/catalog records must receive server-side ownership/access/existence checks. Do not rely on client filtering or separate physical catalog databases.

Groups belong to one Supplier and have Supplier-unique names. All seven pricing methods are fixed selections, not lookup rows. isNetPrice, separateMillFinishDiscount, requiresConnectionGroups, inactive state and optional surcharge source are persisted now but no pricing algorithms are implied.

Predecessor and surcharge source are independent self-FKs and may reference another Supplier's valid group. Check referenced-group access and reject cycles when actively managed. Predecessor is informational, not automatic replacement/migration. Non-null surcharge source replaces an extra checkbox. Estimation discounts/factors are JSON adjustments referencing group IDs; they are not group definitions or individual SQL adjustment rows.

## Allocation — EstimationModule (§15)

Use all 17 fixed bases, six quotation display rules and nine sectors with their complete public labels/units. Measurable prices are rates multiplied by their reference: e.g. currency/m² × effective area. COST_PROPORTIONAL is a total distributed proportionally to Position cost, not a dimensional rate.

PER_ELEMENT/Per Piece (Position) counts non-deleted non-excluded physical Elements, not Position rows. Every applicable effective Element contributes its shared Position geometry/weight/length to the chosen reference. No editable user-formula engine or calculation implementation is added now.

## Currencies — CurrenciesModule (supplement §1)

Currency is platform-global and permits custom three-character codes; IRT is Planicam's custom Toman identity, distinct from official IRR. No ISO-only validation and no built-in Toman/Rial conversion shortcut. Currency.format and decimalDigits control presentation metadata, not a full Excel formatter, storage scaling or financial arithmetic.

Organization.preferredCurrencyCode is only the initial selection for new monetary inputs, not a common accounting denomination. Signup initially stores USD. Preference changes never convert/relabel existing amounts. New global allocated costs initially select that preference; Project copies retain source currency. Supplier prices use baseCurrencyCode for both platform/Organization Suppliers. Estimation values use their own explicitly configured contexts; special prices keep item currencies. VAT is percentage-only.

OrganizationCurrencyRate stores manually entered directional target-units-per-source-unit pairs. Future API population uses the same rows; no rate-origin model now. Do not infer inverse/multi-hop rates. Same currency is 1:1 without a stored pair. Preserve original monetary amounts and currencies through conversion; do not overwrite source prices.

A financial calculation, pricing-based estimation or financial printout targeting currency T must first collect every conversion required by included inputs. Sources include Project form/estimation monetary settings and explicit special prices, applicable Project cost currencies, and Supplier catalog currencies for articles participating in selected Positions/Elements. Deduplicate (from,to); omit from==to.

Missing pairs block the financial result and are returned as a list of RequiredCurrencyConversion objects for user entry. Never fabricate rates, equate currencies, silently omit inputs or return partially converted totals. Do not convert unrelated entries outside the selected financial inputs.

Ordinary catalog browsing is allowed without rates. If display conversion is unavailable, show the original Supplier currency. Pricing-based estimation using a different source currency requires its configured pair. Historical files are immutable; regeneration uses current rates/data and repeats all checks. Non-financial printouts do not gain arbitrary currency prerequisites.

## Printouts — PrintoutsModule (§17)

PrintoutType is a global registry of actual code-owned generators with stable code, category and declared input scope. Layout/content/algorithm remain application code, not SQL-defined report logic. PLANNED is unusable; AVAILABLE permits new generation and regeneration;NEXT means going to be available in next major version; DEPRECATED is hidden for new generation and normally cannot regenerate unless compatibility behavior is explicitly added. Retain access to prior files.

Hub's explicitly approved inventory now seeds 49 types, all scope POSITIONS. AVAILABLE/NEXT/PLANNED remain the literal approved display badges, with effective generator capability separately returned as canGenerate=false for every row. No generator or generation-option contract is registered, so no badge enables generation or regeneration. Future real generators must implement the requirements below before capability is enabled.

Selection UI and generator scope differ: choosing a whole Project/Phase may simply produce a Position input list for POSITIONS. Only truly Project/Phase/Batch-specific generators use those scopes.

Generation receives type, selected input identities and concrete report-specific validated options. Load the context needed by that generator; check tenant/access and financial prerequisites. Persist one new GeneratedPrintout with one new StorageFileAsset every time. Do not overwrite earlier output or require direct Project/Phase/Batch FKs, per-report generation tables, saved PrintoutSettings, GeneratedPrintoutPosition joins or deeply expanded membership snapshots.

generationInputs stores original requested IDs/types and frozen nullable names/numbers, not every member rendered in the file. A Batch input remains one Batch even if its output includes 50 Elements. Stored document content preserves history.

Regenerate with the previous type, original input identities and options, resolving latest current input data and rates, then create an independent file/history entry. A Batch now containing 40 rather than 50 Elements is changed content, not a missing input, and uses current membership without that warning.

If a requested input entity itself is missing, soft-deleted, archived or otherwise unavailable, return the array of unavailable inputs using saved display snapshots. Require a user decision before continuing with only available inputs; never silently omit missing inputs. If none are available, do not generate with an empty selection. Preserve access to original output regardless of input availability. Do not perform expensive availability checks for every history list row merely to display canRegenerate; design that interface later. Earlier-file removal follows separate storage policy, not regeneration overwrite behavior.

## Development and verification boundaries

Development records are disposable: reset/recreate/reseed rather than adding legacy backfills or preservation transitions. This changes only when valuable production data exists or preservation is explicitly requested. Hub persistence workflows are implemented; engineering calculations, labor-rule evaluation, financial conversion/calculation and printout generation remain deferred. No CASL expansion, Redis numbering authority, full catalog models or extra deployment architecture is introduced.

Follow AGENTS.md and its scoped crew verification exception; do not add dependencies, manually edit generated files, or commit/add a changeset without required confirmation.
