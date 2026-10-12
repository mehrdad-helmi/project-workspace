# Command Center implementation and content workflow

- This is a standalone React/TypeScript + Bun/Hono tool. Use Bun and keep its dependencies here.
- Run the application API/CLI for structured mutations; do not edit SQLite directly.
- Markdown is authoritative for notes, conclusions, and repository documents. Use the CLI with the latest hash for edits while the server runs. Direct file edits are detected, but they bypass app-owned revision history.
- Save a conclusion only after Mehrdad explicitly instructs you to save the approved discussion result. Include the approved result, date, useful supporting diagrams/tables/assets, and a source-chat link when available. Never invent approval.
- Read README.md for CLI shapes, config, startup, backup, and recovery. Do not print or commit the local agent token or data directory.
- Keep task hierarchy, completion, moves, and recovery rules on the server. UI and CLI share these rules.
- Tests and QA records use isolated data roots. Do not seed personal data or change the sibling product repositories during verification.
- Preserve the supplied visual direction in DESIGN.md and confirmed product context in PRODUCT.md. Use tabs at width two.
