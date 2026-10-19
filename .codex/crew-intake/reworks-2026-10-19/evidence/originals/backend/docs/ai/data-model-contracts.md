# Data models and canonical contracts

Schema foundation: 2026-10-16; Hub persistence workflows: 2026-10-18. Read this together with [domain workflows](domain-workflows.md) and [provisioning requirements](provisioning.md) before adding business logic.

Authority: the approved entity specification in [workspace conclusions](../../../planicam-workspace/command-center/data/conclusions/workspace/), supplemented by the approved currency and ownership requirements. Section numbers below refer to that original specification. The supplement takes precedence for currencies and ownership; other requirements remain effective. Do not edit the approved source as a side effect of implementation.

## Ownership

This is intended domain ownership, not a list of implemented NestJS modules. Reuse AuthModule and UsersModule. Do not create empty modules, controllers, providers, directories, facades, or placeholder files. Directories containing actual canonical contracts are not module scaffolding. CatalogModule is provisional until the detailed catalog design.

| Intended module | Schema file under prisma/models | Owned models |
| --- | --- | --- |
| `AuthModule` | `auth.prisma` | `AuthUserIdentity`, `AuthSession`, `AuthActionToken`, `AuthPendingSignup` |
| `UsersModule` | `user.prisma` | `User`, `UserProfile` |
| `OrganizationsModule` | `organization.prisma` | `Organization`, `OrganizationMembership`, `OrganizationInvitation`, `OrganizationAddress` |
| `StorageModule` | `storage.prisma` | `StorageFileAsset` |
| `NumberingModule` | `numbering.prisma` | `NumberSequence` |
| `ProjectsModule` | `projects.prisma` | `Project`, `ProjectFolder`, `ProjectPhase`, `ProjectFavorite`, `ProjectAttachment` |
| `PositionsModule` | `positions.prisma` | `Position`, `PositionFavorite`, `PositionDesign`, `PositionElement`, `PositionActivity`, `PositionIssue`, `PositionCatalogDependency` |
| `FabricationModule` | `fabrication.prisma` | `FabricationBatch` |
| `ContactsModule` | `contacts.prisma` | `Contact` |
| `EstimationModule` | `estimation.prisma` | `EstimationDataSet`, `ProjectEstimationSettings` |
| `EstimationModule` | `labor-hours.prisma` | `OrganizationLaborHours`, `SystemProfileLaborHours` |
| `EstimationModule` | `vat.prisma` | `VatRate` |
| `EstimationModule` | `allocated-costs.prisma` | `OrganizationAllocatedCost`, `ProjectAllocatedCost` |
| `PreferencesModule` | `preferences.prisma` | `OrganizationSystemPreferences`, `ProjectSystemPreferences`, `OrganizationColorPreferences`, `ProjectColorPreferences`, `OrganizationFillingPreferences`, `ProjectFillingPreferences`, `OrganizationOtherPreferences`, `ProjectOtherPreferences` |
| `CatalogModule` | `suppliers.prisma` | `Supplier`, `SupplierOrganizationAccess` |
| `CatalogModule` | `discount-groups.prisma` | `DiscountGroup` |
| `CatalogModule` | `system-profiles.prisma` | `SystemProfile` |
| `CurrenciesModule` | `currencies.prisma` | `Currency`, `OrganizationCurrencyRate` |
| `PrintoutsModule` | `printouts.prisma` | `PrintoutType`, `GeneratedPrintout` |

OrganizationsModule will orchestrate provisioning through the owners of predefined Organization preferences. NumberingModule owns allocation and rendering. FabricationModule owns Batch assignment, although PositionElement remains owned by PositionsModule. EstimationModule owns labor standards as well as financial estimation configuration. CurrenciesModule owns registry/rates/conversion prerequisites; PrintoutsModule owns generation/regeneration. StorageFileAsset and actual storage operations belong to StorageModule; references never duplicate binary storage.

The existing multi-file schema discovery and generated-client output are retained. Singular stable filenames user.prisma and organization.prisma are intentionally preserved. Enums live beside their owning models.

## Schema guarantees and application boundaries

The schema contains 49 models and 28 JSON fields, including 27 annotated domain JSON fields. Existing UUIDv7 defaults, native UUID FKs, explicit snake_case database names, UTC timestamptz timestamps and relation-cardinality comments are used. Fabrication deploymentDate is SQL date-only. Decimal amounts/percentages use Decimal(24,8); exchange rates use Decimal(38,18). Display precision does not change stored arithmetic precision.

Hub adds `Position.archivedAt`, per-user `PositionFavorite`, and a required stable `thumbnailKey` constrained to `window-1`, `window-2`, `door-1`, `sliding-1`, or `curtain-1`. Creation chooses the key randomly once; reads and updates retain it. Thumbnails are presentation assets, not engineering output. Project archive hides child Positions and rejects their direct edits without changing their own archive, exclusion, or Batch values. Batch archive preserves membership and blocks direct batch mutation until restoration.

Mutable Contact, Folder, Phase, Batch, Organization, Organization/System labor, VAT, and Organization currency-rate rows now carry optimistic `version` alongside the existing Project/Position/Element/snapshot/default versions. Existing-row commands require `expectedVersion`; stale writes return conflict. Favorite bookmarks have composite identities and do not advance shared entity versions. Creates and numbering execute in serializable transactions; parent Position versions and append-only activities advance with Element/Batch changes.

Composite FKs enforce Project→Contact/Folder tenant consistency; Position→Project tenant consistency and Position→Phase Project consistency; Element→Position/Batch tenant consistency; NumberSequence→Project/Position tenant consistency; Contact→default Estimation Data Set and Estimation Data Set→VAT tenant consistency.

The specified Project snapshot layouts have no duplicate organizationId columns. Their source FKs preserve provenance, but same-Organization source checks must be implemented in the application transaction. The same applies to storage asset ownership, favorite-user membership eligibility, Supplier grants requiring a platform Supplier, and access to nested catalog/currency IDs in JSON. A UUID in JSON is not a PostgreSQL FK.

Unique FKs/PKs guarantee at most one snapshot per Project and at most one global preference per Organization. Transactional Organization provisioning now supplies exactly-one defaults and the five mandatory costs. Partial unique indexes enforce at most one protected Standard preset and at most one built-in cost per owner/type. Row checks preserve built-in names/sectors and forbid built-in source soft deletion. Repository commands reject protected Standard deletion/rename and built-in cost deletion/name/sector changes; no public command removes their identities.

Migration SQL enforces numbering type/scope/owner combinations, formats/markers, nonnegative counters (Elements start at 1), prefix length, positive versions, coherent nullable source ID/version pairs, finite financial values, Supplier source/owner/public combinations, and direct self-reference prevention. Longer Folder/Discount Group cycles, business-number/system immutability, and audit append-only behavior remain application rules.

Restrict FKs intentionally require explicit unassignment/reparenting before deleting a Folder, Phase or Batch; do not replace composite FKs with SET NULL that would also null required owner columns. Source preference deletion is soft deletion and retains origin links.

## Canonical JSON contracts

Feature-owned decorated classes live under the actual owning feature's types directory. PrismaJson is declared in src/infrastructure/database/prisma/prisma-json.d.ts. Its aliases reference those definitions, not duplicate interfaces.

| Stored JSON field(s) | Canonical contract |
| --- | --- |
| Project/Contact.pricingAdjustments | Ordered PricingAdjustmentDto[]: label, SURCHARGE/DISCOUNT direction, nonnegative decimal-string percentage and optional cap |
| Project.otherAddresses; Contact.freeData | Raw Record<string,string> |
| EstimationDataSet/ProjectEstimationSettings.standardEstimation | StandardEstimationDto |
| EstimationDataSet/ProjectEstimationSettings.discountsAndFactors | DiscountsAndFactorsDto |
| EstimationDataSet/ProjectEstimationSettings.specialPrices | Raw SpecialPriceDto[] |
| OrganizationLaborHours.alwaysRecords; SystemProfileLaborHours.overrides | LaborOperationRecords |
| OrganizationLaborHours.categoryRecords | LaborCategoryRecords |
| PositionActivity.details | PositionActivityDetailsDto |
| PositionIssue.details | PositionIssueDetailsDto |
| Each Organization/Project preference config | Matching System/Color/Filling/OtherPreferencesDto |
| GeneratedPrintout.generationInputs | Raw PrintoutGenerationInputDto[] |
| GeneratedPrintout.generationOptions | never until concrete registered report contracts exist |
| PositionDesign.input | DeferredEngineeringInput = unknown |
| Position.calculationSummary | DeferredCalculationSummary = unknown |

The last two types are explicitly approved pending Planicore contracts. Do not claim their engineering shape is validated or invent geometry models. PositionDesign.schemaVersion versions its eventual canonical document. No implemented report generator exists in this phase, so the union of supported generation-option contracts is empty (never). Replace it with concrete decorated report option classes when actual implementations are added; never add an unrestricted options bag.

The generator is pinned to prisma-json-types-generator 4.1.0 for Prisma 7.8 / TypeScript 5.9 compatibility. allowAny=true tells this generator version to leave unannotated legacy storage metadata untouched with Prisma's original JSON types; every new JSON field has an explicit annotation. Do not add unannotated new JSON fields. Prisma generation changes generated files only; never edit them manually.

### V1 representations

- Complex estimation/preference objects have schemaVersion: 1. Raw arrays and dictionaries remain unwrapped; DTO wrappers are input-validation containers, not stored JSON wrappers.
- Financial JSON values are canonical decimal strings without exponent notation. IsDecimalString preserves original input so the existing implicit-conversion setting cannot quietly accept a potentially lossy numeric amount. No JavaScript floating-point financial arithmetic is introduced.
- PricingAdjustmentDto uses explicit `direction: SURCHARGE | DISCOUNT`, `percentage` and optional `cap`. Both numeric values are nonnegative decimal strings. Apply entries sequentially in array order; a cap uses the Project estimation settings' `estimationCurrency`. Persistence preserves inputs and performs no floating-point financial calculation.
- Standard estimation requires formCurrency and estimationCurrency registry codes. Optional groups cover profile/color/wastage/input choices; all overheads, charges, taxes and margins; four labor rates/reductions; coating basis/options/categories/color rates; and window/door/curtain-wall glazing/paneling rates and minima.
- Standard-estimation monetary fields without their own currency use the explicitly configured estimationCurrency context. Weight-price and special-price rows keep their own explicit currency. Currency existence/access checks are application work, including custom codes.
- Discounts/factors retain pricing-group/supplier IDs, optional group information, factors, surcharges, discounts, kg prices and glass-unit/single-glass adjustments. Special prices retain article/color/group IDs, price, currency, unit and discount. Missing financial defaults stay unset; no arbitrary rates or catalog IDs are invented.
- Labor operation IDs and hierarchy cover all 98 fixed operations; 34 use rule-based records. Four separate dynamic groups (Wall Connections, Add-On Profiles, Couplings, Bottom Configuration) map each catalog item UUID to its own time record. Unknown operation keys, incorrect record kinds and invalid nested records are rejected.
- Simple time records expose all eight optional coefficients across fabrication, installation, dismantling and work preparation, in min/pc and min/m. Rule rows expose quantity, work category, min/m, min/pc, min/m², inclusive/exclusive width/height/area bounds, subsystem, comment and all 46 material discriminators. Bounds use meters/m², not engine millimeters.
- Category labor maps require all seven SystemProfileCategory keys. Individual operation overrides and individual simple coefficients may be absent. An explicit zero remains a value. No operation-rule evaluation algorithm is implemented.
- System preferences retain preferred System IDs and optional subsystem/rule-package combinations/descriptions. Color preferences retain finish mode, primary/alternative and inside/outside hardware colors, plus supplier/profile/system/gasket mappings. Filling preferences retain three ordered entries at most in each Glass/Panel/rail list and typed color/thickness/filling mappings. Other preferences retain nullable defaultSystemId and applyTimeSuggestions.
- Activity details contain typed changed fields, Element identities/count, status/Phase/Batch transitions and design-format context. Issue details contain field paths, related identities, expected/actual text and engine/catalog version context. Neither becomes a revision snapshot.
- Printout input arrays store exactly inputId, inputType, name and number; name/number are required nullable frozen snapshots. Input types are Position, Element, Project, Project Phase and Fabrication Batch.

### Runtime validation and public exports

PreserveJsonValue keeps raw primitives and raw maps unchanged before validation, even when the existing Nest pipe enables implicit conversion. Quoted booleans/numbers must not silently become canonical boolean/numeric configuration. Decimal strings use the same preservation through IsDecimalString. The new migration wraps its DDL and constraints in one PostgreSQL transaction.

The global I18nValidationPipe is the Nest ValidationPipe boundary. When implementing endpoints, embed/reuse these decorated classes through ValidateNested and Type; validate root arrays and raw records through the provided input wrappers/decorators. Partial PATCH DTOs are separate request contracts: validate the patch, merge deliberately, and validate the complete canonical result before writing.

For non-HTTP data use plainToInstance with enableImplicitConversion:false plus validate/validateOrReject (with whitelist:true, forbidNonWhitelisted:true and forbidUnknownValues:true). Use class-transformer Type for nested DTOs. The custom record validators instantiate and validate map entries without changing the raw stored-map representation. Prisma reads/writes do not run Nest validation; generated types provide static checks only.

Option registries live with their owning domain under `src/modules/<owner>/types/`. Each enum keeps one canonical registry with exhaustive satisfies Record checks and complete labels/units/order. Prisma enums are imported only as types, so these files do not load Prisma Client or NestJS at runtime. OptionMetadata in common/types contains only the generic label/unit/order shape; it holds no domain values. Do not aggregate unrelated domain registries behind a shared runtime object.

| Owner | Registry files under src/modules |
| --- | --- |
| Numbering | numbering/types/numbering-options.ts |
| Fabrication | fabrication/types/fabrication-options.ts |
| Catalog | catalog/types/system-profile-options.ts, catalog/types/supplier-options.ts, catalog/types/discount-group-options.ts |
| Positions | positions/types/position-options.ts |
| Contacts | contacts/types/contact-options.ts |
| Estimation | estimation/types/allocated-cost-options.ts, estimation/types/labor-options.ts |
| Printouts | printouts/types/printout-options.ts |

Each domain exposes its own canonical options. Frontend sharing and cross-repository packaging remain deferred; do not duplicate enum labels in Angular. RequiredCurrencyConversion exposes fromCurrencyCode/toCurrencyCode without adding an endpoint.

## Coverage checklist

| Authority section | Implementation / preserved requirements |
| --- | --- |
| Original §1 | UUID/tenant/version conventions; minimal SystemProfile; disposable development policy; geometry boundary |
| §2 | Organization prefix, NumberSequence scopes/formats/markers/unique indexes; all fixed option registries; allocator workflow deferred |
| §3 | Every Project field/relation; required directory customer; live/copied fields; conditions and address/adjustment JSON; exclusions |
| §4 | Virtual-root adjacency hierarchy; tenant FK; transactional reparent/delete and cycle prevention documented |
| §5 | Composite favorite and attachment identities; per-user bookmarks; existing asset references |
| §6 | Flat Phases, unique name/number/sequence; same-Project assignment; transactional nulling before delete |
| §7 | Organization Batches, date-only deployment, status, free-text responsibility; eligible one-time assignment and deletion rules |
| §8 | Exactly the three temporary SystemProfile fields and seven categories |
| §9 | All six Position models, enums, calculation metadata, constraints, deferred engine JSON; initialization/quantity/exclusion/audit/diagnostics documented |
| §10 | Every Contact field, all numbered types, raw string freeData, live/copy matrix, soft deletion and omitted legacy fields |
| §11 | Three estimation JSON groups and complete named setting coverage; separate Project snapshot, source versions and Standard protections |
| §12 | Organization VAT Decimal, same-tenant template relation; copied percentage; no currency/tax subsystem |
| §13 | Both labor models, 98 operations, four per-item groups, 46 materials, all simple/rule fields; resolution/evaluation deferred |
| §14 | Minimal Supplier/access and DiscountGroup models; seven pricing choices; self-FKs and source checks; access/cycles deferred |
| §15 | Both cost models, currencies/provenance/protections; all 17 allocation, six quotation, nine sector choices; allocation deferred |
| §16 | Eight models with exact source layout, typed preference coverage and ordered maxima; copy/replacement behavior deferred |
| §17 | Global PrintoutType, scoped input snapshots and immutable storage association; no Project FK or membership expansion; generation deferred |
| §18 | All 27 fields annotated; decorated canonical contracts; two explicit engine exceptions and unchanged legacy storage metadata |
| §19 | All provisioning, tenant-coherence, deletion and explicit non-entity requirements classified in these linked documents |
| Supplement §1.1 | Global Currency, curated ISO snapshot plus non-ISO IRT, display metadata, custom-code support |
| §1.2 | Required relational currency references and explicit copied JSON currencies; VAT remains percentage-only |
| §1.3 | Tenant/directional composite PK, positive finite Decimal(38,18), no redundant same-currency pair |
| §1.4 | Complete required-pair blocking, browsing fallback, original-value and historical-output behavior documented |
| §1.5 | Reset/reseed development data; no preservation/backfill/compatibility migrations |
| Supplement §2–3 | Intended module ownership and exact file grouping, stable filenames retained, no module scaffolding |

## Verification policy

Run schema validation/generation, TypeScript checking, build and focused ESLint. Inspect generated model payload/create/update types and schema/SQL coverage. Tests follow AGENTS.md and its explicitly approved crew scope; do not expand unrelated coverage. Generated Prisma/OpenAPI files must not be manually edited. No commit or changeset without the required separate confirmation.
