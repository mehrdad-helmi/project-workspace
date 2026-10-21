// Temporary SVG presentation only; geometry comes from the existing client engine.
type Point = readonly [number, number];
interface Path {
	points: readonly Point[];
	holes?: readonly (readonly Point[])[];
	style: 'profile' | 'structure' | 'symbol' | 'glass' | 'panel' | 'feature' | 'gasket' | 'break';
	closed: boolean;
	fill?: boolean;
	hitOnly?: boolean;
	surfaceOnly?: boolean;
	dashed?: boolean;
	layer?: number;
}
interface Drawing { width: number; height: number; paths: Path[] }
const styles = new Set(['profile', 'structure', 'symbol', 'glass', 'panel', 'feature', 'gasket', 'break']);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1e7;
const points = (v: unknown): v is Point[] => Array.isArray(v) && v.length <= 50000 && v.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e7));
export function parseDrawing(value: unknown): Drawing | null {
	if (!value || typeof value !== 'object') return null;
	const v = value as Record<string, unknown>;
	if (!positive(v['width']) || !positive(v['height']) || !Array.isArray(v['paths']) || v['paths'].length > 20000) return null;
	for (const p of v['paths']) {
		if (!p || !points(p.points) || !styles.has(p.style) || typeof p.closed !== 'boolean') return null;
		if (p.holes !== undefined && (!Array.isArray(p.holes) || p.holes.length > 1000 || !p.holes.every(points))) return null;
		if (p.layer !== undefined && (typeof p.layer !== 'number' || !Number.isFinite(p.layer))) return null;
		if (['fill', 'hitOnly', 'surfaceOnly', 'dashed'].some(k => p[k] !== undefined && typeof p[k] !== 'boolean')) return null;
	}
	return value as Drawing;
}
export function renderThumbnail(drawing: Drawing, dark: boolean, interior: boolean): string {
	const background = dark ? '#18181b' : '#ffffff';
	const colors = { profile: dark ? '#f4f4f5' : '#27272a', structure: dark ? '#a1a1aa' : '#71717a', symbol: dark ? '#a1a1aa' : '#71717a', glass: dark ? '#315665' : '#b9e0ef', panel: dark ? '#4a4033' : '#e7d8bf', feature: '#38bdf8', gasket: '#71717a', break: '#71717a' };
	const margin = Math.max(drawing.width, drawing.height) * 0.06;
	const pathData = (p: readonly Point[], close: boolean): string => p.length ? p.map(([x, y], i) => `${i ? 'L' : 'M'}${interior ? drawing.width - x : x},${drawing.height - y}`).join(' ') + (close ? 'Z' : '') : '';
	const paths = drawing.paths.filter(p => !p.hitOnly).toSorted((a, b) => (a.layer ?? 0) - (b.layer ?? 0)).map(p => {
		const d = [pathData(p.points, p.closed), ...(p.holes ?? []).map(h => pathData(h, true))].join(' ');
		const fill = p.fill && p.closed ? p.style === 'profile' ? background : colors[p.style] : 'none';
		const opacity = p.style === 'glass' ? 0.28 : p.style === 'profile' || p.style === 'panel' ? 1 : 0.55;
		return `<path d="${d}" fill="${fill}" fill-opacity="${opacity}" fill-rule="evenodd" stroke="${p.surfaceOnly ? 'none' : colors[p.style]}" stroke-width="1" vector-effect="non-scaling-stroke"${p.dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
	}).join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="${-margin} ${-margin} ${drawing.width + 2 * margin} ${drawing.height + 2 * margin}"><rect x="${-margin}" y="${-margin}" width="${drawing.width + 2 * margin}" height="${drawing.height + 2 * margin}" fill="${background}"/>${paths}</svg>`;
}
