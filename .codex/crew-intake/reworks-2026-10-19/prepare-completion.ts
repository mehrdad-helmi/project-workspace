import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const intake = 'D:/Planicam/planicam-workspace/.codex/crew-intake/reworks-2026-10-19';
const run = 'D:/Planicam/planicam-workspace/.codex/crew-runs/cycle1-reworks-20261019';
const now = new Date();
const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
const part = (name: string) => parts.find((entry) => entry.type === name)!.value;
const date = `${part('year')}-${part('month')}-${part('day')}`;
const humanDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', year: 'numeric', month: 'long', day: 'numeric' }).format(now);
const content = readFileSync(join(intake, 'completion-report-draft.md'), 'utf8').replace('prepared on 19 October 2026', `prepared on ${humanDate}`);
const payloadPath = join(intake, 'completion-report-payload.json');
const path = `workspace/${date}-cycle1-reworks-20261019-report.md`;
writeFileSync(payloadPath, JSON.stringify({ source: 'conclusions', path, title: 'Cycle 1 Reworks — verified completion report', approvedAt: date, tags: ['redhat-crew', 'completion-report', 'cycle1-reworks'], content, hash: null }, null, '\t') + '\n');
const progress = join(run, 'progress.md');
const update = `\n\n## Verified completion and report save intent\n\nAll80 unique acceptance rows passed independent source/fixture review, zero pending/blockers. Final review26UIchecks plus zero-writeprobe466requests (27evidence assertions), zero console/pageerrors; lastPopoverbug corrected/rechecked. Final productionbuild804.58kB/scopedlintPASS. Engineer+reviewer focused checks and baseline audit retained. Both original branch/HEAD/exactindex fingerprints unchanged; source scope110FE/26BE, outside=[]; allrework/changesets uncommitted by explicitinstruction.\n\nAtlas accepts integration within approvedscope. Prepared verified report ${payloadPath}; intended create-only conclusion ${path}, finalizationdate${date} Asia/Tehran understandingcrewauthorization (not useracceptance). Saving through existingCLI next; no prior report save attempt. Preserve checkpoint under no-commit exception.\n`;
writeFileSync(progress + '.tmp', readFileSync(progress, 'utf8') + update);
renameSync(progress + '.tmp', progress);
console.log(JSON.stringify({ payloadPath, path, date }));
