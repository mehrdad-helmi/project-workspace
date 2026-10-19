# Frontend state management

Use `@ngrx/signals` for shared domain and workflow state. Follow `Feature / Component -> SignalStore -> Service -> Gateway` for ordinary workflows. Stores own frontend transitions, services coordinate behavior, and gateways abstract the selected data source. Cloud gateway implementations may use HTTP; future desktop implementations may use IPC or local persistence without changing store or service contracts. Data access and shared UI never depend on state. There is no global application mega-store. The root auth lifecycle service is a focused exception that injects its store because it must coordinate startup restoration, HTTP recovery and router cleanup around one application-wide session.

## Current ownership

| Owner | Lifetime | State |
| --- | --- | --- |
| `AuthSessionStore` in `auth/state` | Application injector (`providedIn: 'root'`) | Status, private credentials, context IDs/generation, session metadata, refresh progress and one-shot login notice |
| `AuthSessionService` in `auth/state` | Application injector (`providedIn: 'root'`) | Persisted restoration, login/session adoption, expiry-aware coordinated refresh, logout, invalid-session cleanup and HTTP session port |
| `CurrentUserStore` in `users/state` | Application injector (`providedIn: 'root'`) | `/users/me` user/profile/organization/membership, independent loading and sanitized failure state |
| `CurrentUserLifecycleService` in app composition | Application injector (`providedIn: 'root'`) | Synchronous bridge from auth context changes to current-user cancellation/reset/load |
| `LoginStore` in `auth/state` | Login page component provider | Login submission progress and sanitized request feedback; credentials remain in the page form |
| `SignupStore` in `auth/state` | Each signup page's component provider | Request progress, result, sanitized error, resend message and cooldown |
| Signup page Signal Forms | Component | Editable names/email/organization/password/confirmation/consent, validation and form interaction |
| Shared UI controls | Component | Password visibility, control value/interaction and presentation-derived signals |

Bootstrap imports the focused `@planicam/auth/state/session` public entry point and binds `HttpAuthSession` to the existing `AuthSessionService` instance. This keeps page-scoped login and signup code in the lazy auth bundle. The shared port permits HTTP interception without a shared-to-auth import. `AuthSessionService` coordinates the root store and delegates transport to `AuthGateway`; refresh requests share one replayed operation in a tab and remembered sessions serialize refresh across tabs. The persistence gateway stores the complete rotating token pair in `sessionStorage` when remember-me is off and `localStorage` when it is on. The functional guard restores authentication before protecting the Hub and independent Position Editor boundaries. Authentication state owns session identity, not future authorization policy or permissions.

`SignupStore` composes `withSignupRequest` and `withSignupCooldown` behind one public boundary. Pages still bridge cold submission Observables with `firstValueFrom()` inside Signal Forms callbacks. Destruction cancels pending page requests, returns a frontend-only `cancelled` outcome, and prevents success navigation; finalization clears submission progress. The cooldown uses `rxMethod` and ends with the page. Passwords and form models never enter stores. No additional store is needed for a control's transient presentation.

## Current-user lifecycle

Only `GET /users/me` populates current-user presentation. The root store calls `CurrentUserService`, which delegates to the configured data-source gateway; profile data is never persisted. The app coordinator starts restoration without blocking root rendering and bridges synchronous context events to `setContext()`. Login, signup completion, restoration and cross-tab context replacement load the profile. Logout clears it before server revocation completes.

The auth context generation changes on session/account/organization replacement and logout, independently of credential revisions. Same-context refresh neither clears nor reloads profile data. A context change cancels pending requests and recovery delays; a response must match its captured generation and user/organization IDs. `load()` deduplicates pending reads and reuses loaded data. Errors remain separate from authentication; there is no profile recovery button or auth-data fallback.

## Substantial workspace domains

Use this layout as substantial workspace behavior is implemented:

```text
<domain>/
  feature/       # routes, shell/components, local forms
  state/         # stores and focused store features
  data-access/   # stateless services, gateways, domain-facing models
```

Project Management, Contacts, Fabrication, configuration and printout selection now own real page/component-scoped stores. ProjectsStore owns paged projects/folders and selected project details; PositionsStore owns the routed project context, paged positions, phases, selected physical elements and activity. Attachment components own independent versioned attachment stores. Contacts and Fabrication have independent collection/detail stores. HubCatalogStore owns read-only lookups; HubConfigurationStore owns one versioned configuration editor and cancels stale context work. Database Browser remains a presentation boundary pending its catalog workflows.

Workspace stores belong in their routed shell/component's `providers`, without `providedIn: 'root'`. A component provider guarantees destruction when the shell closes; do not assume a cached route environment injector has that same lifetime. The shell shares one store with its children. If Angular reuses a shell for another domain ID, explicitly load/reset that context, cancel superseded reads, and reject stale results. A route reuse strategy that retains components must define retention/disposal deliberately.

Project Management and Database Browser each own independent workspace stores when their workflows exist. Navigation to one workspace must not retain another workspace's transient state through a root provider. Application-lifetime session state remains separate.

## Position Editor boundary

Expose a coherent `PositionEditorStore` from `position-editor/state`, provided by the editor shell. Compose focused `signalStoreFeature` implementations instead of accumulating one giant store file or separate competing document owners:

| Concern | Ownership |
| --- | --- |
| Canonical position document | One authoritative document and document revision, using the actual contract when available |
| Planicore projection | Derived output tied to the document revision that produced it; never a second editable document |
| Selection | Selected domain IDs, reconciled when documents/projections change |
| Viewport | Shared editor pan/zoom/view state; no geometry or engineering calculations |
| Transient interaction | Cross-component active tool/gesture intent; purely local hover/focus remains component-local |
| Calculation | Pending/error/success orchestration and request/revision identity |
| Save/persistence | Pending/error/success and saved revision; dirty state derives from document versus saved revision |

The store orchestrates through stateless editor services. Services use persistence gateways or the future Planicore adapter through the allowed boundary. Planicore owns geometry, topology, profile calculations, areas and engineering validation. The explicitly approved temporary Hub engine in `calc/temporary-engine` currently supplies rectangular geometry and financial helpers behind this orchestration boundary; migrate it to Planicore rather than adding parallel implementations. Generated calculation contracts remain untouched.

A result may only replace a projection for its matching document revision. A save completion records the revision submitted, so edits made during saving remain dirty. Document replacement/reset reconciles selection, interaction and pending work together. These are implementation requirements for future real workflows, not placeholder behavior to fabricate now.

## Implementation rules

- Update protected state through `patchState`; expose commands and read-only derived signals. Keep private store members prefixed with `_`.
- Use `withComputed` for derived values rather than synchronizing duplicate state with effects. Use `withEntities` for keyed collections accessed/updated individually.
- Use `rxMethod` for reactive/cancellable reads and timers; handle errors inside the inner request so later calls still work. Pick concurrency deliberately: latest-only reads may use `switchMap`, while writes must not be silently cancelled by another click.
- A submission Observable may be returned when Signal Forms needs its outcome; scope it to the owning store, handle cancellation, and finalize loading state on every exit.
- Keep mutable subscriptions/coordination handles outside serializable state. The session lifecycle service owns its shared refresh Observable; individual request cancellation must not cancel token rotation. Persist both replacement tokens together, and reject late responses after a session revision changes.
- Keep filenames in `[name].[type].ts` form. Stores and helpers belong to the domain; do not make a generic store framework without demonstrated reuse.
- Nx tags forbid upward imports and feature-to-feature coupling. State import restrictions reject direct gateways and Angular HTTP. Domain data-access public APIs expose services, domain outcomes and bootstrap providers rather than gateway implementation details.

Verification uses lint and the production application build. Do not add or run tests while the repository's explicit test prohibition applies.
