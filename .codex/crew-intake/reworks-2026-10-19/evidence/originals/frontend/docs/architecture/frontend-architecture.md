# Frontend architecture

## Application composition

The workspace contains one client-rendered, standalone, zoneless Angular application: `apps/planicam-web`. The application root owns bootstrap and top-level route composition only.

Top-level contexts are lazy-loaded:

- `/auth` loads the authentication feature boundary.
- `/hub` loads `hub/shell`; its child routes load Project Management, Contacts, Fabrication Batches, organization settings, printout selection, and Database Browser.
- `/positions/:positionId/editor` loads Position Editor in its independent editor shell, outside the Hub shell. Both shells compose the same application frame and header; the editor uses overlay navigation with a backdrop.

Auth, Hub, and Position Editor are not separate applications. This keeps shared browser state and deployment simple while allowing the editor route to open in another browser tab or a future native window.

## Library responsibilities

| Library | Responsibility |
| --- | --- |
| `auth/feature` | Routed authentication presentation and local Signal Forms |
| `auth/state` | Application-lifetime session state/lifecycle/guard and page-scoped signup workflow state |
| `auth/data-access` | Stateless authentication services, gateway contracts, cloud implementations, and transport mapping |
| `users/state` | Application-lifetime current-user data, loading, failure state, and context-bound cancellation |
| `users/data-access` | Current-user models, stateless service, gateway contract, and validated `/users/me` cloud adapter |
| `hub/shell` | Hub frame, navigation, and child outlet; no domain feature logic |
| `project-management/feature` | Project-management domain presentation |
| `project-management/state`, `project-management/data-access` | Page-scoped project/position/attachment orchestration and source-neutral persistence contracts |
| `contacts/feature`, `contacts/state`, `contacts/data-access` | Organization contact directory and customer selection data |
| `fabrication/feature`, `fabrication/state`, `fabrication/data-access` | Batch workflows and physical-element assignment |
| `hub/feature`, `hub/state`, `hub/data-access` | Organization configuration, catalog lookups and contextual printout selection |
| `position-editor/state`, `position-editor/data-access` | Revision-aware canonical document, temporary projection orchestration and persistence |
| `database-browser/feature` | Catalog/database browsing presentation |
| `position-editor/feature` | Editor presentation and UI orchestration; never engineering calculations |
| `calc/wasm-client` | Future Planicore WASM loading, worker lifecycle, generated contracts, and Angular adapter |
| `platform/runtime` | Browser runtime configuration loading, configured API endpoint adapter, and future web/desktop adapters |
| `shared/config` | Typed, immutable configuration service, required deployment-value validation, and fixed application constants |
| `shared/ui` | Planicam design-system and feedback API; the only direct PrimeNG, PrimeIcons, and PrimeUI boundary |
| `shared/data-access` | Global HTTP interceptors, API URL policy, notification context, and UI-neutral infrastructure ports |
| `shared/models` | Genuinely shared framework-independent frontend models |
| `shared/util` | Pure framework-independent utilities |

Empty boundary libraries intentionally expose no invented API. Add an API only when a real feature requires it.

## Dependency direction

Projects carry one `scope:*` tag and one `type:*` tag. ESLint enforces both dimensions.

The usual stateful workflow is:

`feature/component -> SignalStore -> stateless service -> gateway`

Authentication session lifecycle is the deliberate exception: `AuthSessionService` coordinates restoration, refresh, logout and invalidation across the router, HTTP port and root `AuthSessionStore`, while the store remains the reactive state owner and `AuthGateway` remains the transport-neutral data-source contract. Auth state contains credentials, session metadata and context IDs, never profile presentation. An app-owned `CurrentUserLifecycleService` bridges synchronous auth-context events to the root `CurrentUserStore`; auth and users libraries never import each other. Only `/users/me` supplies user, profile, organization and membership presentation data.

Gateway contracts describe domain data sources, not HTTP. Cloud gateway implementations may own HTTP, serialization, and API mapping; future desktop implementations may use Tauri IPC, SQLite, or another local adapter behind the same service-facing contract. The application selects concrete providers at composition time, so components, stores, and services never branch on runtime or transport.

Services and gateways live in domain `data-access`; stores live in domain `state`. Features also depend on `shared/ui` for presentation, while state never depends on UI. The app composes routes and infrastructure providers. Data access, services, gateways, and shared UI cannot import state. Feature and shell libraries cannot bypass state to call data-access services. Stateless operations with no frontend state transition do not need artificial store wrappers; place them according to their actual responsibility.

State follows domain and lifetime boundaries, with no global application mega-store. See [State management](../development/state-management.md) for current ownership, workspace lifetimes, and the Position Editor composition boundary.

Feature-to-feature imports are prohibited. The application route composer links independent route boundaries, so Project Management does not import Position Editor internals merely to navigate there. Shared scope cannot depend on domain scopes, and low-level model/util libraries cannot depend upward.

## Boundary principles

- Each domain owns its business-facing concepts: `feature` holds routes and presentation, `state` holds frontend orchestration, and `data-access` holds stateless services and gateways.
- Shared libraries contain only genuinely reusable technical or domain-neutral behavior. Keep shared code small and boring; feature logic does not belong in `libs/shared/*`.
- A library's public API is its stable contract. Export routes, components, providers, facades, and types that consumers need; do not casually export internal services, mappers, implementation details, or generated internals.
- Consumers should depend on what a library does, not how it does it. Cross-context behavior should be coordinated through the app route composer or an explicit public API.
- Keep infrastructure replaceable. Raw browser, desktop, HTTP, storage, or third-party SDK details belong behind project-owned adapters in the appropriate library.
- Name source files with Angular's `[name].[type].ts` convention so roles stay visible, for example `position-editor.store.ts`, `project.service.ts`, `cloud-project.gateway.ts`, and `response-message.interceptor.ts`.

## PrimeNG boundary

`libs/shared/ui` owns PrimeNG, PrimeIcons, and `@primeuix/themes`. It exposes only Planicam-owned, domain-neutral standalone UI primitives such as `Button`, `Icon`, `ToastHost`, `ToastService`, and the `providePlanicamUi()` bootstrap provider; raw vendor symbols are never part of its public API. `ToastService` translates the Planicam `success`, `error`, `warning`, and `info` operations to PrimeNG, and the application root renders the one shared host. Feature and domain code never injects PrimeNG `MessageService` or renders `<p-toast>`. `PlIcons` maps feature-facing semantic names to the installed icon components. Controls remain thin Signal Forms adapters and use PrimeNG state/appearance APIs with only layout and message-placement styles. No app, shell, feature, data-access, model, util, or platform source may import these vendor packages directly; root ESLint restrictions enforce the rule.

## Platform and calculation boundaries

The current application is web-only and client-side rendered. Cloud gateway providers are selected at bootstrap and use the global HTTP policy. The default production build uses the web root base href so direct deep links can bootstrap correctly. The `bun run build:static` script applies a relative base href to the same production build for a future desktop/static host. No Tauri, SQLite, IPC, or sync code is initialized. Future Tauri detection belongs only in `platform/runtime`; it selects desktop gateways/adapters at composition time rather than leaking runtime checks into components, stores, services, or gateway contracts.

Planicore remains a separate Rust repository and owns deterministic engineering calculations. `calc/wasm-client` may later connect Angular to Planicore through a Web Worker and WASM, but must not reimplement calculation rules in TypeScript.

Mehrdad approved a temporary exception for Hub development: `calc/temporary-engine` owns the single pure TypeScript implementation of rectangular field distribution and decimal financial helpers until migration to Planicore/Rust. Every source file has an explicit migration header. Null rectangular partials mean Auto; remaining space is shared equally, and invalid/nonpositive dimensions are rejected. Financial arithmetic uses integer decimal scaling rather than binary floating point. Components own input interaction and stores orchestrate document/projection revisions. This exception supplies neither catalog BOM/profile geometry nor invented supplier calculations. Canonical input is persisted separately from reproducible output; NestJS does not calculate it.

Development thumbnails come from the independent read-only Bun server in `../planicam-workspace/temporary/thumbnail-server`. The backend assigns a stable random placeholder key at Position creation. Interior/exterior preview currently shares that placeholder asset; thumbnail generation and production storage remain deferred. Attachments use a separate authenticated development storage adapter behind their domain gateway.

Signup flows through component, state store, application service, gateway contract, and cloud gateway. Handwritten transport types and cloud response mapping remain internal to `auth/data-access`, so feature state never receives HTTP details. A future cross-domain REST generation workflow may live in `shared/data-access`; calculation contracts will come from Protobuf/buf and remain generated artifacts.

## Data and runtime boundaries

- Keep request/response DTOs and API mapping in the owning feature data-access library unless they are genuinely cross-domain; do not spread transport shapes through UI components.
- `platform/runtime` loads external JSON before Angular bootstrap. `shared/config` validates and freezes the configuration, exposing key-inferred reads through `ConfigService` and `CONFIGS`. Application constants are fixed in code, while the three deployment fields are required without defaults. See [runtime configuration](../development/runtime-configuration.md) for the same-build deployment contract and startup failure behavior.
- Gateways use relative `/api/...` URLs. The global base URL interceptor resolves that alias through `ApiEndpointProvider`, which reads `ConfigService` and is bound to the shared `API_ENDPOINT` port at bootstrap; feature code does not read environment globals directly.
- Shared HTTP policy depends on the `HttpAuthSession` port, implemented by `AuthSessionService` in auth state. Bootstrap aliases the port to that root service with `useExisting`; shared libraries do not import auth or platform implementations. The service coordinates the root store, delegates transport to `AuthGateway`, and uses the auth persistence gateway for browser credential storage and cross-tab refresh coordination. See [HTTP infrastructure](../development/http-infrastructure.md) for interceptor ordering, public requests, and token rotation.
- Shared HTTP policy also exposes a UI-neutral `ResponseMessageNotifier` port. The application adapter implements it with `ToastService`, so `shared/data-access` never depends on `shared/ui`. Successful envelope messages require the request's explicit `RESPONSE_MESSAGE_NOTIFICATION` context; routine reads remain silent.
- Runtime resources such as locale files, message catalogs, and static templates belong in explicit resource folders and must be included by the build when applicable.
- Use UTC and unambiguous ISO 8601 timestamps at API and persistence boundaries. Convert to the user's locale or time zone only for presentation. Keep date parsing, arithmetic, and formatting in focused utilities or services rather than duplicating it in components.
- Generated REST, Protobuf, and calculation artifacts are source-of-truth outputs. Regenerate them through their owning workflow; never hand-edit or create parallel handwritten copies.

## Authentication and access control

Planicam HTTP is authenticated by default. Public endpoints explicitly set `SKIP_AUTH`, which disables bearer attachment and automatic `401` recovery for that request. `AuthSessionStore` is the root reactive owner of credential/context identity and token state; `AuthSessionService` coordinates persisted restoration, expiry-aware single-flight refresh, login, logout, and cross-tab synchronization. Non-remembered sessions use tab-scoped storage; remembered sessions use persistent shared storage. The functional `authGuard` protects the Hub shell and the independent Position Editor route boundary by requiring an authenticated session. Profile loading does not block navigation or decide authentication. Global recovery repeats safe reads after 1 and 3 seconds on transient transport failures; writes require an explicit replay-safe contract. See the HTTP guide for recovery and notification policy.

Authentication answers who the user is and whether a session is valid. Future access control answers what that authenticated actor may do. Permission and policy state must use a dedicated domain contract/store or backend-provided capability model; it must not be folded into `authGuard`, transport handling, the toast system, or route visibility alone. A `403` never refreshes or clears the session and remains an authorization outcome for the owning workflow.
