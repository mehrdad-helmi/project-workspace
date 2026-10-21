import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
	MaterialAnalysis,
	MaterialLine,
} from '../../../planicam-frontend/libs/calc/temporary-engine/src/lib/material-analysis.model';

const categories = [
	'profiles',
	'glass',
	'accessories',
	'gaskets',
	'hardware',
] as const;
const labels = {
	profiles: 'Profiles',
	glass: 'Glass',
	accessories: 'Accessories',
	gaskets: 'Gaskets',
	hardware: 'Hardware',
};
const text = (value: unknown): value is string =>
	typeof value === 'string' && value.length <= 2000;
const amount = (value: unknown): value is number =>
	typeof value === 'number' &&
	Number.isFinite(value) &&
	value >= 0 &&
	value <= 1e12;
const nullableAmount = (value: unknown) => value === null || amount(value);
const record = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value);

/** Only structured data is accepted. Never execute or store submitted HTML. */
export function isMaterialAnalysis(value: unknown): value is MaterialAnalysis {
	if (
		!record(value) ||
		value['title'] !== 'Material analysis' ||
		value['currency'] !== 'USD'
	)
		return false;
	const positions = value['positions'],
		lines = value['lines'],
		notes = value['notes'],
		selected = value['categories'];
	return (
		Array.isArray(positions) &&
		positions.length > 0 &&
		positions.length <= 1000 &&
		positions.every(
			(p) =>
				record(p) &&
				['number', 'name', 'project', 'system'].every((k) => text(p[k])) &&
				amount(p['quantity']) &&
				Number.isSafeInteger(p['quantity']) &&
				amount(p['version']),
		) &&
		Array.isArray(lines) &&
		lines.length <= 10000 &&
		lines.every(
			(l) =>
				record(l) &&
				categories.includes(l['category'] as (typeof categories)[number]) &&
				['number', 'name', 'required', 'stock', 'priceUnit'].every((k) =>
					text(l[k]),
				) &&
				amount(l['quantity']) &&
				nullableAmount(l['unitPrice']) &&
				nullableAmount(l['total']) &&
				typeof l['fictional'] === 'boolean',
		) &&
		Array.isArray(notes) &&
		notes.length <= 100 &&
		notes.every(text) &&
		amount(value['pricedTotal']) &&
		Array.isArray(selected) &&
		selected.length > 0 &&
		selected.length <= 5 &&
		new Set(selected).size === selected.length &&
		selected.every((c) => categories.includes(c))
	);
}

function escape(value: string | number): string {
	return String(value).replace(
		/[&<>"']/g,
		(c) =>
			({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
				c
			]!,
	);
}
const number = (value: number) =>
	new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
const money = (value: number | null) =>
	value === null
		? '<span class="unpriced">Unavailable</span>'
		: new Intl.NumberFormat('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}).format(value);

export async function renderMaterialAnalysis(
	report: MaterialAnalysis,
	date: Date,
): Promise<string> {
	const assets = join(
		import.meta.dir,
		'../../../planicam-frontend/apps/planicam-web/public/assets',
	);
	const [font, logo] = await Promise.all([
		readFile(join(assets, 'fonts/inter/InterVariable.woff2')),
		readFile(join(assets, 'images/planicam-logo.svg')),
	]);
	const row = (line: MaterialLine) => `<tr>
		<td class="article-number">${escape(line.number)}</td>
		<td class="description">${escape(line.name)}${line.fictional ? '<span class="demo">Demo article</span>' : ''}<small>${escape(line.stock)}</small></td>
		<td class="numeric">${number(line.quantity)}<small>${escape(line.required)}</small></td>
		<td class="numeric">${money(line.unitPrice)}<small>${escape(line.priceUnit)}</small></td>
		<td class="numeric">${money(line.total)}</td>
	</tr>`;
	const sections = report.categories
		.map((category) => {
			const lines = report.lines.filter((line) => line.category === category);
			const priced = lines.filter((line) => line.total !== null);
			return `<section><h2>${labels[category]}<span>${lines.length} article${lines.length === 1 ? '' : 's'}</span></h2>
		<table><colgroup><col style="width:17%"><col style="width:35%"><col style="width:20%"><col style="width:14%"><col style="width:14%"></colgroup>
		<thead><tr><th>Article no.</th><th>Description / stock unit</th><th class="numeric">Quantity / required</th><th class="numeric">Unit price</th><th class="numeric">Amount</th></tr></thead>
		<tbody>${lines.length ? lines.map(row).join('') : '<tr><td colspan="5" class="empty">No articles used in the selected positions.</td></tr>'}</tbody>
		<tfoot><tr><td colspan="4">${priced.length !== lines.length ? 'Priced subtotal · unpriced articles excluded' : 'Subtotal'} <span>USD</span></td><td class="numeric">${priced.length ? money(priced.reduce((sum, line) => sum + line.total!, 0)) : lines.length ? 'Unavailable' : '0.00'}</td></tr></tfoot></table></section>`;
		})
		.join('');
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>Planicam · Material analysis</title>
	<style>
	@font-face{font-family:Inter;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-weight:100 900}
	/* Print palette follows Planicam's Inter, primary blue and slate surface tokens. */
	:root{--primary:#2563eb;--ink:#1e293b;--muted:#475569;--line:#cbd5e1;--wash:#eff6ff}
	@page{size:A4;margin:15mm 14mm 17mm;@bottom-left{content:'PLANICAM  /  Material analysis';font-family:Inter,sans-serif;font-size:8pt;color:#475569}@bottom-right{content:counter(page) ' / ' counter(pages);font-family:Inter,sans-serif;font-size:8pt;color:#475569}}
	*{box-sizing:border-box}html{background:white;color:var(--ink);font-family:Inter,sans-serif;font-size:9pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{margin:0;line-height:1.45}header{display:flex;align-items:center;justify-content:space-between;padding-bottom:7mm;border-bottom:1.5pt solid var(--primary)}header img{width:54mm;height:auto}header div{font-size:8pt;color:var(--muted);text-align:right}h1{font-size:25pt;font-weight:650;letter-spacing:-.03em;line-height:1.15;margin:8mm 0 2mm}p.intro{color:var(--muted);margin:0 0 6mm;font-size:9pt}.scope{width:100%;margin-bottom:4mm}.scope th{background:white;padding:0 2mm 2mm;text-transform:uppercase;font-size:7pt;color:var(--muted);letter-spacing:.04em}.scope td{font-size:8pt;padding:2mm;border-top:1px solid var(--line)}.scope small{font-size:7pt}h2{font-size:12pt;font-weight:650;color:var(--primary);margin:4mm 0 2mm;display:flex;align-items:baseline;justify-content:space-between;break-after:avoid}h2 span{font-size:8pt;font-weight:400;color:var(--muted)}section{break-inside:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}tfoot{display:table-row-group}thead{display:table-header-group}th{text-align:left;font-size:7pt;font-weight:600;color:var(--muted);background:var(--wash);padding:2.5mm 2mm}td{padding:2mm 2mm;border-bottom:.5pt solid var(--line);vertical-align:top;font-size:8pt;overflow-wrap:anywhere}tr{break-inside:avoid}.numeric{text-align:right;font-variant-numeric:tabular-nums}.article-number{font-size:8pt;font-weight:550;letter-spacing:.01em}.description{font-weight:550}small{display:block;font-size:7pt;color:var(--muted);font-weight:400;margin-top:1mm}.demo{display:inline-block;font-size:6pt;font-weight:500;color:#1d4ed8;margin-left:1mm;white-space:nowrap}.unpriced{color:var(--muted);font-size:7pt}tfoot td{font-size:8pt;font-weight:600;background:#f8fafc;padding:2mm}tfoot span{font-weight:400;color:var(--muted);margin-left:2mm}.total{display:flex;align-items:baseline;justify-content:space-between;padding:5mm 0 3mm;border-top:1.5pt solid var(--primary);margin-top:7mm;break-inside:avoid}.total strong{font-size:17pt;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.total span{font-weight:600}.total small{font-weight:400}.notes{break-inside:avoid;font-size:7pt;color:var(--muted);padding-top:3mm}.notes h2{font-size:9pt;color:var(--ink);margin:0 0 2mm}.notes p{margin:0 0 1.4mm}.empty{color:var(--muted);padding:4mm 2mm}::selection{background:#dbeafe;color:#1e293b}
	@media screen{html{background:#e2e8f0}body{max-width:210mm;margin:10mm auto;padding:15mm 14mm;background:white}}
	</style></head><body><header><img alt="Planicam" src="data:image/svg+xml;base64,${logo.toString('base64')}"><div>Generated ${escape(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short' }).format(date))} Tehran<br>Currency USD · Demo prices</div></header>
	<h1>Material analysis</h1><p class="intro">Articles used in ${report.positions.length} position${report.positions.length === 1 ? '' : 's'} · Quantities include active, non-excluded elements.</p>
	<table class="scope"><colgroup><col style="width:23%"><col style="width:39%"><col style="width:26%"><col style="width:12%"></colgroup><thead><tr><th>Project</th><th>Position</th><th>Profile system</th><th class="numeric">Qty.</th></tr></thead><tbody>${report.positions.map((p) => `<tr><td>${escape(p.project)}</td><td><b>${escape(p.number)}</b> · ${escape(p.name)}<small>Saved revision ${number(p.version)}</small></td><td>${escape(p.system)}</td><td class="numeric">${number(p.quantity)}</td></tr>`).join('')}</tbody></table>
	${sections}<div class="total"><span>Priced materials only<small>Profile and gasket prices are unavailable.</small></span><strong><small>USD</small>${money(report.pricedTotal)}</strong></div>
	<div class="notes"><h2>Basis of this analysis</h2>${report.notes.map((note) => `<p>${escape(note)}</p>`).join('')}</div></body></html>`;
}
