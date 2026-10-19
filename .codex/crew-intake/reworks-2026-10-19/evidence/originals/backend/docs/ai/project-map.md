# Planicam Backend Project Map

Last inspected: 2026-10-18 for Hub integration.

Use this file for current repository facts. Read the topic documents linked from [`index.md`](./index.md) for detailed rules instead of loading every AI document.

## Runtime And Entry Points

- NestJS 11 modular-monolith REST backend using the Fastify adapter.
- Bun is the package manager and script runner.
- PostgreSQL is accessed through Prisma 7 and `@prisma/adapter-pg`.
- [`src/main.ts`](../../src/main.ts) creates and starts the application.
- [`src/app.module.ts`](../../src/app.module.ts) imports configuration, infrastructure, common behavior, authentication/current-user modules and the Hub domain modules. Projects, Positions, Contacts, Fabrication, Organizations, Estimation, Preferences, Catalog, Currencies and Printouts expose the protected REST workflows in [Hub APIs](hub-api.md).
- [`src/bootstrap/configure-application.ts`](../../src/bootstrap/configure-application.ts) applies versioning, security, validation, CORS, Swagger, and global behavior.
- The current package version maps to the `/v1` global API prefix.
- Swagger is available at `/documentation` and writes generated output to `openapi/`; do not edit that generated directory.

```text
src/main.ts
  -> createNestApplication()
  -> AppModule
    -> PlanicamConfigModule
    -> InfrastructureModule
      -> PlanicamI18nModule
      -> PrismaModule
      -> CryptographyModule
      -> MailModule
    -> CommonModule
    -> AuthModule
    -> UsersModule
    -> Hub and domain modules
  -> configureApplication()
  -> startApplication()
```

## Configuration

Configuration is centralized under [`src/config`](../../src/config):

```text
src/config/
  config.ts
  config.module.ts
  config.service.ts
  config-keys.ts
  configs/
    app.config.ts
    auth.config.ts
    database.config.ts
    mail.config.ts
  types/
  utils/
```

- `config.ts` validates the environment once and merges the focused fragments.
- Consumers use `ConfigService` and typed `CONFIGS` keys from `@planicam/config`.
- Do not read `process.env` directly outside the configuration boundary.
- [`.env.example`](../../.env.example) documents required cryptographic secrets, password/Argon2 settings, signup lifecycle values, database settings, and mail settings.
- Auth lifetime defaults live in `auth.config.ts`: access/idle 30 days and absolute session expiry 90 days. Secrets remain environment values.
- `MAIL_TRANSPORT` supports `NOOP` and `SMTP`. `NOOP` is the development default and intentionally does not expose raw email tokens.

## Feature Modules

### Hub domains

Projects, Positions, Contacts, Fabrication, Organizations, Estimation, Preferences, Catalog, Currencies, Printouts, and Hub options are registered by AppModule. Their protected controllers delegate to application services and tenant-scoped repositories. See [Hub API workflows](hub-api.md) for route families, role/version contracts, independent Project snapshots, numbering, development attachment storage, and the deliberately unavailable printout generation action. Organization provisioning now runs during signup's existing transaction.

### Auth

[`src/modules/auth`](../../src/modules/auth) implements email/password signup, organization-scoped login, opaque refresh rotation, current-session logout, Passport authentication, and default route protection.

Active endpoints under `/v1/auth/signup`:

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/` | Creates or reuses temporary signup state and requests verification mail. |
| `POST` | `/resend-verification` | Applies pending-signup cooldown/caps and supersedes older verification tokens. |
| `GET` | `/verify-email?token=...` | Consumes a verification token, creates a completion token, and returns a `303` frontend redirect. |
| `POST` | `/complete` | Uses `Authorization: Signup <token>` to atomically create the account graph and returns authentication credentials. |

Active endpoints under `/v1/auth`:

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/login` | Passport Local credentials: organization identifier, email, password, optional remember-me. |
| `POST` | `/refresh` | Validates and atomically rotates an opaque session refresh token. |
| `POST` | `/logout` | Revokes the current bearer-authenticated session without affecting other sessions. |

The module uses API DTOs/controllers, Passport Local/JWT strategies and guards, application use-cases, domain policies and errors, module-owned types, `AuthSignupRepository`, and `AuthSessionRepository`. The global JWT `APP_GUARD` protects every controller route unless it has `@PublicRoute()`. `@CurrentActor()` exposes the organization-scoped actor after authentication. See [`auth-authorization.md`](./auth-authorization.md) for the workflow and security invariants.

The empty legacy files `src/modules/auth/auth.controller.ts` and `src/modules/auth/auth.service.ts` still exist and are not registered by `AuthModule`; active HTTP code lives under `src/modules/auth/api/`.

## Infrastructure

### Database

- [`src/infrastructure/database/prisma/prisma.service.ts`](../../src/infrastructure/database/prisma/prisma.service.ts) extends the generated Prisma client and is exported as `DatabaseService`.
- `runSerializableTransaction()` provides reusable serializable transactions with bounded retry support; `P2034` is retryable by default.
- Prisma `info` and `error` logs go to stdout. Query events go to the configured query log file.
- Query parameters are redacted for sensitive columns such as password and token hashes.
- Generated Prisma code lives under `src/infrastructure/database/prisma/generated/`; never edit it manually.

### Cryptography

[`src/infrastructure/cryptography`](../../src/infrastructure/cryptography) provides the project-owned cryptographic boundary:

- 32-byte base64url opaque tokens.
- Purpose-separated HMAC-SHA-256 hashes for action and session tokens.
- Argon2id password hashing and verification with a configured password pepper.
- Constant-time comparison where applicable.

Raw passwords, tokens, credentials, authorization headers, and stored hashes must not be logged.

### Mail And Runtime Resources

[`src/infrastructure/mail`](../../src/infrastructure/mail) provides:

- A project-owned `MailService` and transport interface.
- SMTP and safe no-op transports.
- An in-memory transport used by tests.
- EJS rendering with sanitized delivery-error logging.

The English-only signup template is [`src/resources/templates/email/signup-email-verification.ejs`](../../src/resources/templates/email/signup-email-verification.ejs). Localized API/validation messages live under `src/resources/i18n/<locale>/`. Nest copies both locale and template assets into `dist`.

## Prisma Structure And Signup Models

- Prisma configuration: [`prisma.config.ts`](../../prisma.config.ts).
- Split schema root: [`prisma/schema.prisma`](../../prisma/schema.prisma) plus [`prisma/models`](../../prisma/models).
- Migrations: [`prisma/migrations`](../../prisma/migrations).
- The schema includes projects, positions, fabrication, contacts, estimation, labor, preferences, suppliers, currencies and printouts alongside the existing account/auth/storage models. See [data models, contracts and ownership](data-model-contracts.md) for the complete file map and coverage checklist.
- Prisma JSON types are generated with prisma-json-types-generator 4.1.0. All 27 new JSON fields are annotated; two Planicore payload shapes remain explicitly pending. Legacy storage metadata retains its existing generic JSON contract.
- The global currency registry is seeded with 165 ISO entries plus custom IRT. Run `bun run prisma:seed` after migrations and before signup; no rates are seeded.
- Signup supplies Organization.projectNumberPrefix and initial preferredCurrencyCode USD. Other Organization/Project provisioning, numbering services, APIs and calculations remain deferred; schema presence does not register future NestJS modules.

Signup-specific persistence:

- `AuthPendingSignup` owns temporary identity, workflow state, resend counters, expiry, and completed user/session references.
- `AuthActionToken` supports user or pending-signup subjects, explicit purposes, expiry, consumption, revocation, and superseding.
- `Organization.organizationIdentifier` is the unique URL-safe login selector. `User.email` remains unique globally, and an active `AuthSession` is bound to one organization.
- `AuthSession` stores only a purpose-separated refresh-token hash, remember-me state, idle/absolute expiry, revocation state, and the bound organization.
- Migration-level constraints enforce exactly one token subject, one active token per pending-signup purpose, valid completed state, and nonnegative counters.
- `User.email` remains database-unique.

Signup completion runs in one serializable transaction and creates:

```text
User
  + UserProfile
  + Organization
  + OWNER OrganizationMembership
  + Organization.createdByUserId
  + AuthSession
  + completed AuthPendingSignup
  + consumed signup-completion token
```

Mail delivery occurs only after the pending-signup/token transaction commits. No external mail operation runs inside the database transaction.

## Testing

The root [`jest.config.ts`](../../jest.config.ts) contains two projects and derives path aliases from `tsconfig.json` with `pathsToModuleNameMapper`:

- `unit`: `src/**/*.spec.ts`.
- `e2e`: `test/**/*.e2e-spec.ts`, using ESM transformation for Prisma's generated `import.meta` usage.

`bun run test` selects the unit project. `bun run test:e2e` selects the E2E project and starts Jest with Node VM-module support.

Current authentication tests cover identifier generation, credential normalization, generic failure behavior, session expiry and rotation, JWT actor validation, public-route metadata, signup auto-login/retry behavior, HTTP login/refresh, and protected/public route behavior. E2E tests require a valid `.env`, generated Prisma client, and a reachable test database.

## Important Commands

```text
bun install
bun run start:dev
bun run build
bun run lint
bun run test
bun run test:e2e
bun run prisma:format
bun run prisma:validate
bun run prisma:generate
bun run prisma:seed
bun run prisma:migrate -- --name <migration-name>
bun run i18n:generate
```

## Current Risks And Deferred Work

- The documented [workflow rules](domain-workflows.md) and [mandatory provisioning](provisioning.md) must be followed when implementing each feature. Exact-one defaults, snapshot source tenant checks, financial conversion prerequisites and protected-record deletion policies still need application workflows.
- Development data is disposable; reset/reseed instead of adding compatibility transitions or backfills.

- Signup lifecycle cleanup has a deliberate TODO until background-task infrastructure exists.
- IP-based throttling is not implemented. Database-backed resend cooldown and delivery caps are implemented.
- CASL and CASL-based authorization policies remain deferred.
- Direct SMTP delivery after commit is not an outbox; delivery failures are recorded on the pending signup and the public response remains generic.
- `NOOP` mail is safe for development but cannot support a manual email-link flow; use SMTP or the injected in-memory transport in tests.
- The connection-test endpoint still contains development-oriented database behavior and should not be treated as a production health contract.
- Generated Prisma and OpenAPI files must stay out of manual edits.
