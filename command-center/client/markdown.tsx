import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { FileSource } from '../shared/contracts';
import { GuardLink } from './ui';

export interface FileContext {
	source: FileSource;
	path: string;
}
function resolveRelative(path: string, context?: FileContext) {
	if (!context || /^(https?:|mailto:|#|\/)/i.test(path)) return path;
	try {
		path = decodeURIComponent(path);
	} catch {
		return path;
	}
	const base = context.path.split('/').slice(0, -1);
	for (const part of path.split('/')) {
		if (part === '..') base.pop();
		else if (part !== '.') base.push(part);
	}
	return base.join('/');
}
function assetUrl(path: string, context?: FileContext) {
	if (/^https?:\/\//i.test(path)) return path;
	if (!context || path.startsWith('/api/v1/asset?')) return path;
	return `/api/v1/asset?source=${context.source}&path=${encodeURIComponent(resolveRelative(path, context))}`;
}
let diagramSequence = 0;
function Diagram({ code }: { code: string }) {
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState('');
	useEffect(() => {
		let alive = true;
		setError('');
		import('mermaid')
			.then(async ({ default: mermaid }) => {
				mermaid.initialize({
					startOnLoad: false,
					securityLevel: 'strict',
					theme: 'dark',
					themeVariables: {
						primaryColor: '#17191F',
						primaryTextColor: '#E5E5E8',
						lineColor: '#858893',
						fontFamily: 'IBM Plex Sans',
					},
				});
				const { svg } = await mermaid.render(`diagram_${++diagramSequence}`, code);
				if (alive && ref.current) ref.current.innerHTML = svg;
			})
			.catch((error) => {
				if (alive) setError(String(error));
			});
		return () => {
			alive = false;
		};
	}, [code]);
	return error ? (
		<div className="inline-error">
			Diagram could not render: {error}
			<pre>{code}</pre>
		</div>
	) : (
		<div className="diagram" ref={ref} />
	);
}
function Chart({ code, context }: { code: string; context?: FileContext }) {
	const ref = useRef<HTMLDivElement>(null);
	const [error, setError] = useState('');
	useEffect(() => {
		let alive = true;
		let view: { finalize: () => void } | undefined;
		setError('');
		(async () => {
			const spec = JSON.parse(code);
			const check = (value: unknown) => {
				if (!value || typeof value !== 'object') return;
				for (const [key, item] of Object.entries(value)) {
					if (key === 'url' || key === 'href') {
						if (
							typeof item !== 'string' ||
							/^(https?:|data:|javascript:|\/\/)/i.test(item) ||
							item.startsWith('/')
						)
							throw new Error('Charts may use inline data or repository-relative assets only.');
						(value as Record<string, unknown>)[key] = assetUrl(item, context);
					} else check(item);
				}
			};
			check(spec);
			const { default: embed } = await import('vega-embed');
			if (!alive || !ref.current) return;
			const load = async (url: string) => {
				if (!url.startsWith('/api/v1/asset?')) throw new Error('External chart data is blocked.');
				const response = await fetch(url);
				if (!response.ok) throw new Error('Chart data unavailable.');
				return response.text();
			};
			const result = await embed(
				ref.current,
				{
					...spec,
					background: '#101115',
					config: {
						...spec.config,
						axis: {
							labelColor: '#B5B8C2',
							titleColor: '#E5E5E8',
							gridColor: '#2A2D35',
							domainColor: '#626671',
						},
						legend: { labelColor: '#B5B8C2', titleColor: '#E5E5E8' },
						title: { color: '#E5E5E8' },
					},
				},
				{
					actions: false,
					renderer: 'svg',
					loader: {
						load,
						http: load,
						file: async () => {
							throw new Error('Filesystem chart loading is blocked.');
						},
						sanitize: async (url: string) => {
							if (!url.startsWith('/api/v1/asset?'))
								throw new Error('External chart assets are blocked.');
							return { href: url };
						},
					},
				},
			);
			view = result.view;
			if (!alive) view.finalize();
		})().catch((error) => {
			if (alive) setError(String(error));
		});
		return () => {
			alive = false;
			view?.finalize();
		};
	}, [code, context?.source, context?.path]);
	return error ? (
		<div className="inline-error">Chart could not render: {error}</div>
	) : (
		<div className="chart" ref={ref} />
	);
}
export function Markdown({
	content,
	context,
	outline = false,
}: {
	content: string;
	context?: FileContext;
	outline?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const navigation = useRef<HTMLElement>(null);
	const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);
	const [activeId, setActiveId] = useState('');
	useEffect(() => {
		const root = ref.current;
		if (!root) return;
		const elements = [...root.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6')];
		const ids = new Set<string>();
		const items = elements.map((element) => {
			const text = element.textContent?.trim() ?? '';
			const base = slug(text) || 'heading';
			let id = base;
			let suffix = 0;
			while (ids.has(id)) id = `${base}-${++suffix}`;
			ids.add(id);
			element.id = id;
			element.tabIndex = -1;
			return { id, text: text || 'Untitled heading', level: Number(element.tagName.slice(1)) };
		});
		if (!outline) return;
		setHeadings(items);
		const scroller = root.parentElement!;
		const update = () => {
			const top = scroller.getBoundingClientRect().top + 28;
			let active = elements.at(0);
			for (const element of elements) {
				if (element.getBoundingClientRect().top > top) break;
				active = element;
			}
			if (
				scroller.scrollTop > 0 &&
				scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
			)
				active = elements.at(-1);
			setActiveId(active?.id ?? '');
		};
		update();
		scroller.addEventListener('scroll', update, { passive: true });
		const resize = new ResizeObserver(update);
		resize.observe(root);
		resize.observe(scroller);
		return () => {
			scroller.removeEventListener('scroll', update);
			resize.disconnect();
		};
	}, [content, outline]);
	const revealActiveHeading = () => {
		const nav = navigation.current;
		const active = nav?.querySelector('[aria-current="location"]');
		if (!nav || !active || !nav.clientHeight) return;
		const bounds = nav.getBoundingClientRect();
		const item = active.getBoundingClientRect();
		if (item.top < bounds.top) nav.scrollTop += item.top - bounds.top;
		else if (item.bottom > bounds.bottom) nav.scrollTop += item.bottom - bounds.bottom;
	};
	useEffect(revealActiveHeading, [activeId]);
	const rendered = useMemo(
		() => (
			<div className="markdown" ref={ref}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeHighlight]}
					components={{
						pre: ({ children }) => <div className="code-block">{children}</div>,
						code: ({ className, children }) => {
							const code = String(children).replace(/\n$/, '');
							if (className?.includes('language-mermaid')) return <Diagram code={code} />;
							if (className?.includes('language-vega-lite'))
								return <Chart code={code} context={context} />;
							return <code className={className}>{children}</code>;
						},
						img: ({ src, alt }) => (
							<img loading="lazy" src={assetUrl(String(src ?? ''), context)} alt={alt ?? ''} />
						),
						a: ({ href = '', children }) => {
							if (/^(https?:|mailto:)/i.test(href))
								return (
									<a href={href} target="_blank" rel="noreferrer">
										{children}
									</a>
								);
							if (href.startsWith('#')) return <a href={href}>{children}</a>;
							if (href.startsWith('/') && !href.startsWith('/api/v1/asset'))
								return <GuardLink to={href}>{children}</GuardLink>;
							const resolved = resolveRelative(href, context);
							const [path, anchor] = resolved.split('#');
							if (/\.(md|markdown)$/i.test(path) && context)
								return (
									<GuardLink
										to={`/${context.source === 'notes' || context.source === 'conclusions' ? context.source : 'documents'}?source=${context.source}&path=${encodeURIComponent(path)}${anchor ? `#${anchor}` : ''}`}
									>
										{children}
									</GuardLink>
								);
							const url = assetUrl(href, context);
							const extension = href.split('.').pop()?.split('#')[0].toLowerCase();
							if (['mp3', 'wav', 'ogg'].includes(extension ?? ''))
								return (
									<span className="media">
										<a href={url}>{children}</a>
										<audio controls src={url} />
									</span>
								);
							if (['mp4', 'webm'].includes(extension ?? ''))
								return (
									<span className="media">
										<a href={url}>{children}</a>
										<video controls src={url} />
									</span>
								);
							if (extension === 'pdf')
								return (
									<span className="media">
										<a href={url} target="_blank" rel="noreferrer">
											{children}
										</a>
										<iframe title={String(children)} src={url} />
									</span>
								);
							return (
								<a href={url} target="_blank" rel="noreferrer">
									{children}
								</a>
							);
						},
					}}
				>
					{content}
				</ReactMarkdown>
			</div>
		),
		[content, context],
	);
	if (!outline) return rendered;
	return (
		<div className="markdown-reader">
			<div className="document-preview" role="region" aria-label="Document content" tabIndex={0}>
				{rendered}
			</div>
			<aside className="document-outline">
				<details
					open
					onToggle={(event) => {
						if (event.currentTarget.open) revealActiveHeading();
					}}
				>
					<summary>Outline</summary>
					<nav aria-label="Document outline" ref={navigation}>
						{headings.length ? (
							headings.map((heading) => (
								<a
									key={heading.id}
									href={`#${encodeURIComponent(heading.id)}`}
									aria-current={heading.id === activeId ? 'location' : undefined}
									style={{ paddingInlineStart: `${12 + (heading.level - 1) * 12}px` }}
									onClick={(event) => {
										event.preventDefault();
										const target = [
											...ref.current!.querySelectorAll<HTMLHeadingElement>(
												'h1, h2, h3, h4, h5, h6',
											),
										].find((element) => element.id === heading.id);
										const scroller = ref.current!.parentElement!;
										if (!target) return;
										target.focus({ preventScroll: true });
										scroller.scrollTo({
											top:
												scroller.scrollTop +
												target.getBoundingClientRect().top -
												scroller.getBoundingClientRect().top -
												24,
											behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
												? 'instant'
												: 'smooth',
										});
									}}
								>
									{heading.text}
								</a>
							))
						) : (
							<p className="muted">No headings in this document.</p>
						)}
					</nav>
				</details>
			</aside>
		</div>
	);
}
const slug = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^\p{L}\p{N}_\s-]/gu, '')
		.replace(/\s+/g, '-');
