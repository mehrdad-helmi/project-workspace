# Planicam workspace

This workspace is the main hub for consulting on, designing, and planning Planicam features and concepts, with implementation support across the product repositories.

Planicam is a design, engineering, and quotation product for windows, doors, sliding systems, and curtain walls. It targets a cloud web application and an offline-capable desktop application using the same Angular frontend.

## How to work here

- Mehrdad is the sole engineer and architect. Act as a technical design partner: explain tradeoffs, challenge weak assumptions, and flag conflicts with the agreed architecture.
- For new features and non-trivial requests, clarify unresolved scope, edge cases, and logic ownership before proposing a design or writing code. Ask about specialized domain rules rather than inventing them.
- Match the requested stage: consultation, design, planning, or implementation. Once the scope is clear, carry out the requested work.
- Prefer the simplest robust architecture for current and known near-term requirements. Preserve important boundaries without speculative abstractions, infrastructure, or unrelated refactors.
- Distinguish prototype shortcuts, the V1 baseline, and deferred targets. Explain any proposed shortcut and its tradeoff.
- Write idiomatic code for each language and framework. Mehrdad is building Rust fluency: explain why ownership, lifetimes, error handling, and async runtime choices matter when they arise.
- For database design, consider both PostgreSQL and the offline SQLite mirror. Explain sync and conflict-resolution implications for data that must work offline.

## Core boundaries

- Keep logic in one appropriate home rather than duplicating it across languages.
- Keep shared, offline-capable domain calculations in **Planicore**, without duplicating them in Angular or NestJS. Its engine is deterministic and pure: no database access, I/O, or side effects.
- Angular owns interaction, presentation, and orchestration, not engineering truth. Feature code stays independent of the persistent data source; platform differences belong behind adapters and detection must not depend on the network.
- NestJS owns cloud security, tenant isolation, licensing, persistence, and concurrency. In V1, it does not independently rerun Planicore; client-calculated security or licensing state is never trusted.
- Keep canonical engineering input separate from derived output, which must remain reproducible with compatible engine and catalog versions.

## Documentation router

Read only the documents relevant to the task. Do not load every document for every prompt; use the linked sections when only one topic is needed.

| Task or question                                                                                           | Read                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Product context, domain terminology, or comparisons with Logikal                                           | [Product and domain context](docs/product-context.md)                                     |
| Feature planning, architectural tradeoffs, abstraction, or scope decisions                                 | [Engineering decision policy](docs/engineering-policy.md)                                 |
| System design, technology choices, cloud/desktop runtime, or ownership across boundaries                   | [Architecture overview](docs/architecture/overview.md)                                    |
| Calculations, Planicore crates, semantic commands, WASM/worker integration, or calculation/catalog context | [Planicore](docs/architecture/planicore.md)                                               |
| Position saving, client/server trust, future server verification/IPC, or browser WASM exposure             | [Cloud trust and verification](docs/architecture/cloud-trust.md)                          |
| Implementation in a product repository                                                                     | That repository's `AGENTS.md`, relevant local documentation, contracts, and existing code |
| Approved workspace decisions and prior discussions                                                         | [Workspace conclusions](command-center/data/conclusions/workspace/) and the conclusion workflow below |

The architecture documents describe the agreed V1 baseline and explicitly marked future targets. Use them for prior decisions rather than re-deriving those decisions. Inspect the affected repositories to establish what is actually implemented.

## Repositories and ownership

The two existing product repositories are independently versioned and are siblings of this workspace.

| Repository             | Owns                                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../planicam-backend`  | NestJS REST API; persistence; authentication and authorization; application use cases; HTTP APIs; server-side orchestration; Prisma database models |
| `../planicam-frontend` | Angular/Nx application; PrimeNG and PrimeIcons UI; client-side application state; browser/Tauri integration; WASM consumption                       |

Planicore's planned Rust crate layout and adapters are described in [Planicore](docs/architecture/planicore.md#workspace-structure).

## Cross-repository workflow

Before implementation:

1. Determine which repositories and architectural boundaries the feature affects.
2. Read the affected repositories' instructions, then inspect relevant contracts and existing implementations in each.
3. Define any interface changes before implementation.
4. Implement the agreed feature end-to-end across the affected repositories.

The cloud frontend consumes Planicore through the defined WASM boundary. The desktop target uses native Planicore through the desktop Rust infrastructure.

## Command Center

The standalone workspace companion lives in `command-center/`. Read its `AGENTS.md` and `README.md` for implementation and CLI workflows. The running app is available on port 7200.

Use `bun run cc -- ...` from that directory to work with tasks, notes, calendar entries, documents, and recovery through the shared server rules. Save an approved chat conclusion only when Mehrdad explicitly asks you to save it; do not infer approval or ingest conversations automatically.

### Conclusions in chats

Before revisiting a decision, consult only the relevant [Workspace conclusions](command-center/data/conclusions/workspace/). For repository-specific decisions, also consult [Frontend conclusions](command-center/data/conclusions/frontend/) or [Backend conclusions](command-center/data/conclusions/backend/).

From this workspace, list with `bun run --cwd command-center cc -- documents conclusions workspace` and read with `bun run --cwd command-center cc -- read conclusions workspace/<topic>.md`. The host must be running for CLI operations; local Markdown can be read directly when it is stopped. These links use the default data directory; for a custom `CC_DATA_DIR`, use the CLI with the configured environment.

Only after Mehrdad explicitly asks to save an approved conclusion, prepare JSON with `source: "conclusions"`, `path: "workspace/<topic>.md"`, `title`, the actual `approvedAt` date, `tags`, approved Markdown `content`, and `hash: null` for creation. Include `sourceChat` when available. Use workspace scope for shared decisions; use the owning repository's scope for frontend/backend decisions. Save through `bun run --cwd command-center cc -- save @<absolute-json-path>`. For edits, read the latest hash first. Add supporting diagrams, tables, and attachments through the same CLI; return the saved conclusion's app link. Never infer approval, ingest chats automatically, or commit conclusions automatically. See [Command Center CLI documentation](command-center/README.md#agent-cli).
