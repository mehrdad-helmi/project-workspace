# Planicam Command Center

A personal LAN dashboard for the Planicam workspace, frontend, and backend repositories.

## First run

Open PowerShell in this directory:

```powershell
bun install
bun run setup
bun run build
bun run start
```

`setup` asks for an owner password without echoing it. Use at least 12 characters. It can also reset the owner password; resetting revokes existing browser sessions and replaces the local agent token. The running server sees the updated credentials immediately.

Open [localhost:7200](http://localhost:7200). Other devices can use `http://<host-LAN-IP>:7200` while this host runs. The default allowlist includes the host's current IPv4 addresses and computer name. Firewall rules are left under your control. HTTP is the explicitly selected trusted-LAN mode; it does not encrypt network traffic.

For development, `bun run dev` runs Vite internally on loopback port 7201 and the application/API on port 7200. Production uses only port 7200. Restart the development command after server changes if the Bun watch process reports a port still in use.

## Configuration

`config.ts` owns repository paths, exclusions, timezone, week structure, twenty calendar colors, session duration, and attachment limit. Default repository paths are resolved relative to this directory, not the terminal working directory.

Optional environment variables:

| Variable           | Default                                             | Purpose                                                   |
| ------------------ | --------------------------------------------------- | --------------------------------------------------------- |
| `CC_PORT`          | `7200`                                              | Public application port                                   |
| `CC_HOST`          | `0.0.0.0`                                           | Bind address; use `127.0.0.1` for host-only access        |
| `CC_DATA_DIR`      | `command-center/data`                               | Absolute or working-directory-relative local storage path |
| `CC_ALLOWED_HOSTS` | localhost, loopback, host name, host IPv4 addresses | Comma-separated accepted hostnames/IPs, without ports     |

Set environment variables before starting the server, setup, or CLI. If the host's IP changes while running, restart the server or configure an explicit stable hostname.

## Everyday use

- **Hub:** Workstream progress, unfinished tasks, Tehran today/tomorrow day notes, recent documents, and conclusions.
- **Documents:** Repository Markdown files, with source editing and explicit Save. Edits change the real files. Generated folders and hidden files are excluded.
- **Conclusions:** Markdown records created after an approved discussion. Metadata includes a stable ID, title, approval date, tags, and optional source-chat URL.
- **Workstreams:** Inbox, In Progress, Done, custom sections, recursive subtasks, card/section ordering, filters, transfers, and recovery. A completed parent cannot retain unfinished descendants. Reopening a descendant reopens completed ancestors.
- **Notes:** Folder/page organization, Markdown source, previews, and attachments.
- **Calendar:** Gregorian month view, Saturday start, Thursday/Friday weekends, twenty colors, date-only entries. No notifications.
- **Schema:** Live backend Prisma model/relationship explorer. Uses no database connection. The parser adapter is pinned to Prisma 7.8.0; update it deliberately alongside schema compatibility verification.

Use **Ctrl K** for global search and **Ctrl S** in the source editor to save. Drag handles support keyboard pickup with Space and movement with arrow keys. Section/task dialogs also provide ordinary move controls. Task links accept app URLs such as `/notes?source=notes&path=Engineering/design.md` or ordinary HTTPS URLs.

Markdown supports GFM tables, fenced code, Mermaid blocks, and `vega-lite` JSON blocks. Chart data can be inline or a repository-relative asset. Raw HTML/MDX is not executed. Raster images, audio, video, and PDF have previews; SVG/HTML and other attachment formats download. Uploads are limited to 50 MB.

Relative links stay relative to their source document. Moving a document carries its conventionally named `.assets` folder with it. Other links are preserved exactly; review them after moving to a different folder. Deleting a document preserves attachments and places its Markdown in recovery.

## Agent CLI

Run commands here while the server is running:

```powershell
bun run cc -- help
bun run cc -- board
bun run cc -- documents workspace
bun run cc -- read workspace docs/architecture/overview.md
bun run cc -- events
bun run cc -- schema
bun run cc -- search Planicore
```

Mutations accept JSON or `@path-to-json-file`. Prefer a JSON file for multiline Markdown and PowerShell quoting. Responses are JSON; IDs and revisions come from read operations. Stale revisions or file hashes produce conflicts instead of overwriting newer work.

```powershell
bun run cc -- create workstreams @workstream-input.json
bun run cc -- create tasks @task-input.json
bun run cc -- update tasks <task-id> @task-update.json
bun run cc -- move-task <task-id> @task-move.json
bun run cc -- save @document-input.json
bun run cc -- attach notes Engineering/design.md D:\Images\diagram.png
bun run cc -- folder @folder-input.json
bun run cc -- reorder @ordering-input.json
bun run cc -- trash
bun run cc -- restore-item <trash-id>
```

Task creation shape:

```json
{
	"title": "Review input contract",
	"description": "Markdown description",
	"tags": ["architecture"],
	"links": ["/documents?source=workspace&path=docs/architecture/overview.md"],
	"sectionId": "UUID from board",
	"parentId": null
}
```

Task movement: `{ "revision": 1, "sectionId": "UUID", "beforeId": null, "completeAll": false }`. Moving to another Workstream transfers the subtree, detaches its root parent, and preserves Done/unfinished state. Task edits can include `sectionId` and `completeAll` to save fields and movement atomically.

Only Done is fixed. Inbox and In Progress can be renamed or deleted when empty. A missing default section is recreated when a transfer requires Inbox or reopening a completed parent requires In Progress. If a recreated default already exists, recovering the earlier deleted section restores it as an ordinary custom section.

Document save shape:

```json
{
	"source": "conclusions",
	"path": "calculation-ownership.md",
	"title": "Calculation ownership",
	"approvedAt": "2026-10-13",
	"tags": ["architecture"],
	"content": "# Calculation ownership\n\nApproved conclusion text.\n",
	"hash": null
}
```

For updates, use the latest `hash` from `cc read`. `hash: null` creates a new file only. `source` is one of `workspace`, `frontend`, `backend`, `notes`, or `conclusions`. The local token resides in `data/agent-token`; the CLI sends it to the loopback server and never edits SQLite directly.

**Conclusion workflow:** Wait for Mehrdad to explicitly ask to save the approved result. Write the agreed conclusion, relevant diagrams/tables/assets, approval date, tags, and available source-chat link. Save using the CLI, then return the conclusion's app URL. Do not invent approval or save conversations automatically.

## Backup and recovery

Use **Backup & recovery** in the sidebar, or:

```powershell
bun run cc -- backup D:\Backups\command-center.zip
bun run cc -- restore-backup D:\Backups\command-center.zip
```

Backups include a consistent SQLite snapshot plus notes, conclusions, attachment folders, previous file revisions, and deleted document content. They do not include source-repository documents, which remain managed in those repositories. Restore replaces app-owned records and files, retaining the current owner credentials and agent token. Download a current backup before restoring if you need to preserve the present state. Keep copies outside this host for recovery from disk loss.

Deleted records, Markdown, and empty note folders can be restored through the UI or CLI; nonempty folder deletion is blocked. Previous Markdown revisions are retained as JSON in `data/history` and are included in backups. Nothing is committed automatically.

## Verification

```powershell
bun run typecheck
bun run test
bun run build
bunx --no-install prettier --check client server shared scripts tests config.ts vite.config.ts
```

Tests use temporary directories and do not mutate the product repositories. One read-only parser test checks the current backend split schema. Browser QA fixtures are optional and isolated:

```powershell
$env:CC_DATA_DIR = "$PWD\output\qa-data"
bun run scripts/qa-fixture.ts
bun run start
```

That disposable fixture uses the password `qa-only-password` and explicitly labeled demo records. Remove the environment variable before starting your personal data store. Never run the fixture against the real data directory.
