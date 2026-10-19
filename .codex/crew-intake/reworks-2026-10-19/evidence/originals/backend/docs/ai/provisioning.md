# Provisioning and currency seeding

Read [schema/contracts](data-model-contracts.md) and [domain workflows](domain-workflows.md). Currency/printout registry seeding and transactional Organization/Project/Position initialization are implemented for Hub as of 2026-10-18. Calculations and printout generators remain deferred.

## Implemented currency seed

Run the normal database migration commands, then:

```text
bun run prisma:generate
bun run prisma:seed
```

Seed before starting signup: Organization.preferredCurrencyCode is a required FK and signup initially selects USD. The migration deliberately does not manufacture currency rows or populate old Organizations.

The checked-in prisma/seeds/currencies.iso.json snapshot records its official SIX List One source and publication date (2026-09-17). It contains 165 distinct current codes with numeric minor-unit precision, excluding historical and N.A./non-monetary test/metal entries. Minor-unit precision is presentation metadata. ISO names/codes/precision are not fetched during normal seeding; seed runs require no currency-provider network calls.

The seed adds custom IRT (Iranian Toman, precision 0, symbol تومان, mask #,##0 "تومان") separately from IRR. IRT is custom, not official ISO. Custom/ISO collisions fail before writes. Supported codes use code-prefixed masks; symbols may be null. There is no ISO-membership restriction on future Currency rows.

All 166 rows are upserted in a single transaction. Repeat runs update the managed entries without deleting other custom currencies or changing rates/monetary records. No exchange-rate pairs are seeded and no live FX provider is configured. Future supported-currency updates must review the snapshot and custom-code collisions deliberately.

The CLI uses the existing Prisma configuration boundary and PostgreSQL adapter. Registry seeding remains an explicit CLI operation, independent of API module startup; no external dependency or live provider is necessary.

## Organization initialization — OrganizationsModule

Provision atomically with Organization creation, coordinated with the owning modules:

| Required item | Initialization |
| --- | --- |
| Organization number prefix | Suggest 2–3 letters from normalized name initials; editable later without changing old numbers/counters |
| Preferred currency | Required Currency FK; current signup initial value USD |
| Organization NumberSequence | PROJECT/CONTACT/FABRICATION_BATCH, scope ORGANIZATION; nextValue=0; no projectId/positionId |
| Standard estimation preset | Exactly one name Standard/isStandard=true/version=1 with three valid typed JSON roots; editable, not renamable/deletable |
| Allocated costs | Exactly five protected rows with fixed identities/names/sectors; plus any later configured custom defaults |
| Labor Hours | One OrganizationLaborHours, with Standard—Always map and all seven category maps |
| Preferences | Exactly one System, Color, Filling and Other preference singleton; valid typed config/version=1 |

The prefix helper currently handles normalized Unicode letters: first initials for multi-word names, first letters for one word, capped at three uppercase characters; fallback PC when fewer than two usable letters remain. Organization prefixes need not be unique; Project.positionPrefix must be Organization-unique.

Built-in costs are INSULATION/Insulation/ELEMENT; SHEET_METAL/Sheet Metal/ELEMENT; TRAVEL_COSTS/Travel Costs/WAGE; SCAFFOLD_COSTS/Scaffold Costs/WAGE; ACCOMMODATION_ALLOWANCE/Accommodation Allowance/WAGE. Their prices, currencies, bases and presentation are configuration; illustrative legacy monetary amounts are not seed obligations. New monetary inputs select Organization preference without relabeling existing rows. Exact initial commercial rates, currencies for reusable templates, coating choices and labor coefficients must be explicit valid configuration, not invented catalog identities or silent financial assumptions.

`provisionOrganization(transaction, { organizationId, preferredCurrencyCode })` is the public persistence helper called inside the existing signup-completion transaction. A failed default write rolls back the account graph and claimed completion token. Standard starts with schemaVersion 1, explicit formCurrency/estimationCurrency matching the preference, discounts/factors schemaVersion 1, and an empty special-price array. Built-in costs start at price `0`, preferred currency, PER_ELEMENT, HIDDEN. Labor maps start empty with all seven category keys. Preferences use empty lists/no catalog identities, nullable defaultSystemId, and applyTimeSuggestions=false. These neutral defaults make no industrial or commercial assumptions; the separate demo fixture provides illustrative configuration.

## Project initialization — ProjectsModule coordinating owners

In one transaction:

1. Validate same-tenant directory customer, optional Folder and any explicitly selected template. New Contact creation is a preceding directory workflow, not a Project-only identity.
2. Allocate Project number from the Organization counter/current prefix. Persist the immutable unique 2–3-character positionPrefix.
3. Copy Contact address, conditions, commercial adjustments and supplied additional addresses as independent Project values; retain live Contact identity/contact-field references.
4. Create POSITION and PROJECT_PHASE NumberSequence rows scoped to this Project, both starting at zero.
5. Select explicit valid estimation preset, otherwise selected/available Contact preference, otherwise protected Standard. Create exactly one ProjectEstimationSettings with all three independent JSON values and source ID/version.
6. Copy applicable VAT percentage into the local standardEstimation, not a live VAT dependency. Preserve explicit formCurrency/estimationCurrency and all special-price currencies.
7. Copy every active OrganizationAllocatedCost, including all five built-ins and active custom rows, with source ID/version/currency. Project-only custom costs later have both source fields null.
8. Copy all four Organization preference singletons with required source IDs/current versions and local version=1.
9. Commit together; no partial Project graph or automatic future inheritance.

Enforce source/destination tenant consistency in the transaction for snapshot relations without duplicate organizationId columns. Later explicit full replacement requires user confirmation and advances sourceVersion; local modifications retain origin links.

## Position and numbered-entity initialization

| Trigger | Required transaction behavior |
| --- | --- |
| New Position | Allocate Project-scoped Position number; required immutable SystemProfile; CREATED; no PositionDesign; create ELEMENT counter, allocate Element sequence 1 in the same transaction, leaving nextValue=2; choose stable random thumbnailKey |
| First successful design initialization | Create versioned PositionDesign, reuse existing Elements, set IN_PROGRESS and append activity atomically |
| Later quantity changes | Allocate fresh Element values or soft-delete only safely empty instances; explicit management for populated removals; zero allowed without losing initialization |
| New Project Phase | Allocate Project-scoped PH number, enforce Project-unique name |
| New Contact, any type | Allocate Organization-scoped CT number |
| New Fabrication Batch | Allocate Organization-scoped FB number independent of other counters |

All allocation is authoritative PostgreSQL transaction work, never MAX(number) or Redis. Failed creation rolls back the counter. Deletion never reuses prior values.

## Catalog and printout seeds

- Platform test/development Suppliers use source=PLATFORM, ownerOrganizationId=null, isPublic=true and an explicit baseCurrencyCode. Optional Discount Groups may reference them. No detailed full catalog models are required.
- Organization-owned Suppliers require owner and remain private; cross-tenant grants are not a sharing mechanism.
- The approved Hub inventory seeds exactly 49 PrintoutType rows in Estimation, Quotation / Invoice, Order, and Fabrication, all scope POSITIONS. Their literal AVAILABLE/NEXT/PLANNED badges reproduce the approved inventory. Generator capability is separate: every returned type has canGenerate=false while no concrete generator/options contract exists. Seeding an AVAILABLE badge never enables a generation endpoint.
- SystemProfile contains only id/name/category. Catalog IDs in JSON do not require additional catalog tables now.

## Isolated development demo

After migrations/client generation, run `bun run seed:demo`. This separate command refuses environments other than development/test and refuses non-loopback database hosts. It creates only the isolated `planicam-demo` Organization and `demo@planicam.local` OWNER with development password `PlanicamDemo!2026`, using the existing configured CryptographyService; no mail/signup tokens are produced. An unrelated existing email/identifier collision stops instead of adopting that account.

Reruns reuse fixture identities. The fixture contains five Projects, twenty Positions with Elements, directory Contacts, nested Folders, Phases, bookmarks, exclusions, two Batches, activities, snapshot/default configuration, VAT, an explicitly entered directional rate, and minimal actual SystemProfile/Supplier/DiscountGroup rows. Engineering remains uninitialized until a compatible input contract is available. Demonstration commercial/labor values are illustrative, not validated manufacturing standards. Normal `prisma:seed` never creates this account or demo financial/labor data; it upserts only currencies and the approved printout registry.

## Deletion and provenance checklist

- Folder: transactionally reparent children/Projects to parent, then hard-delete.
- Phase: transactionally null only Position.phaseId, then hard-delete.
- Batch: transactionally unassign Element.fabricationBatchId, then hard-delete.
- Element: soft-delete, preserve shared design and counter history.
- Custom global cost/template: soft-delete; keep Project copies and origin FKs.
- Built-in cost, either scope: reject deletion, rename, sector change or identity removal.
- Standard preset: reject deletion, rename or protection removal.
- Global singleton preference: preserve its identity so Project source references remain valid.
- Regeneration: new file and history record; old files never overwritten.
- Currency: do not delete or repurpose referenced codes; changing preference/rates never rewrites original prices.

## Development policy

The configured development database may be reset/recreated/reseeded while records are disposable. No legacy preservation, historical backfill, one-time transformation or backward-compatible transition is needed. Do not apply that policy to future valuable production data without an explicit decision.

The domain-model migration adds required fields directly. Existing development Organizations should be recreated. A successful reset applies existing migrations plus the new migration; run the currency seed afterward, before signup. Mandatory future provisioning must be implemented for newly created Organizations instead of backfilling throwaway ones.
