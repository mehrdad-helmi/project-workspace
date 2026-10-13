import { StrictMode, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	Command,
	LayoutDashboard,
	BookOpen,
	FileCheck2,
	PanelsTopLeft,
	StickyNote,
	CalendarDays,
	Network,
	Search,
	Settings,
	LogOut,
	X,
	ArchiveRestore,
	Download,
	Upload,
	ArrowUpRight,
	PanelLeft,
} from 'lucide-react';
import { api, useRefresh, useTrash, write } from './api';
import {
	FeedbackProvider,
	Field,
	GuardLink,
	Modal,
	Loading,
	Empty,
	ErrorBox,
	submit,
	useAction,
	useFeedback,
} from './ui';
import { Hub } from './hub';
import type { Preferences } from './calendar';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import './styles.css';

const SchemaPage = lazy(() =>
	import('./schema').then((module) => ({ default: module.SchemaPage })),
);
const DocumentsPage = lazy(() =>
	import('./documents').then((module) => ({ default: module.DocumentsPage })),
);
const JobsPage = lazy(() => import('./jobs').then((module) => ({ default: module.JobsPage })));
const CalendarPage = lazy(() =>
	import('./calendar').then((module) => ({ default: module.CalendarPage })),
);
const client = new QueryClient({
	defaultOptions: { queries: { staleTime: 30000, retry: false, refetchOnWindowFocus: true } },
});
const navigation = [
	{ path: '/', title: 'Hub', icon: LayoutDashboard },
	{ path: '/documents', title: 'Documents', icon: BookOpen },
	{ path: '/conclusions', title: 'Conclusions', icon: FileCheck2 },
	{ path: '/jobs', title: 'Jobs', icon: PanelsTopLeft },
	{ path: '/notes', title: 'Notes', icon: StickyNote },
	{ path: '/calendar', title: 'Calendar', icon: CalendarDays },
	{ path: '/schema', title: 'Schema', icon: Network },
];
function App() {
	const preferences = useQuery({ queryKey: ['me'], queryFn: () => api<Preferences>('me') });
	const [loggedOut, setLoggedOut] = useState(false);
	const queryClient = useQueryClient();
	useEffect(() => {
		const listener = () => setLoggedOut(true);
		window.addEventListener('cc:unauthorized', listener);
		return () => window.removeEventListener('cc:unauthorized', listener);
	}, []);
	if (preferences.isPending && !loggedOut) return <Loading />;
	if (loggedOut || preferences.error)
		return (
			<Login
				onLogin={() => {
					setLoggedOut(false);
					queryClient.clear();
					void preferences.refetch();
				}}
			/>
		);
	return (
		<Shell
			preferences={preferences.data!}
			onLogout={() => {
				setLoggedOut(true);
				queryClient.clear();
			}}
		/>
	);
}
function Login({ onLogin }: { onLogin: () => void }) {
	const [password, setPassword] = useState('');
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);
	const status = useQuery({
		queryKey: ['auth-status'],
		queryFn: () => api<{ configured: boolean }>('auth/status'),
	});
	return (
		<main className="login-screen">
			<section className="login-panel">
				<div className="brand-mark">
					<Command size={28} />
				</div>
				<h1>Planicam Command Center</h1>
				<p className="muted">Workspace access</p>
				{status.error ? (
					<ErrorBox error={status.error} />
				) : status.data?.configured === false ? (
					<div className="setup-message">
						<h2>Configure the owner</h2>
						<p>On the host, open a terminal in the command-center folder and run:</p>
						<pre>bun run setup</pre>
						<p className="muted">
							Then reload this page to sign in. The password stays on your host.
						</p>
						<button onClick={() => void status.refetch()}>Check setup</button>
					</div>
				) : (
					<form
						onSubmit={submit(() => {
							setBusy(true);
							setError('');
							void write('auth/login', 'POST', { password })
								.then(onLogin)
								.catch((error) => setError(error.message))
								.finally(() => setBusy(false));
						})}
					>
						<Field label="Owner password">
							<input
								autoFocus
								type="password"
								autoComplete="current-password"
								required
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
						</Field>
						{error && <ErrorBox error={new Error(error)} />}
						<button className="primary" disabled={busy || status.isPending}>
							{busy ? 'Signing in…' : 'Sign in'}
							<ArrowUpRight size={16} />
						</button>
					</form>
				)}
				<div className="login-footer mono">LOCAL HOST · PORT 7200 · TRUSTED LAN</div>
			</section>
		</main>
	);
}
function Shell({ preferences, onLogout }: { preferences: Preferences; onLogout: () => void }) {
	const location = useLocation();
	const [search, setSearch] = useState(false);
	const [settings, setSettings] = useState(false);
	const [connected, setConnected] = useState(false);
	const [collapsed, setCollapsed] = useState(false);
	const queryClient = useQueryClient();
	const { confirm, dirty } = useFeedback();
	useEffect(() => {
		const stream = new EventSource('/api/v1/changes');
		stream.addEventListener('ready', () => setConnected(true));
		stream.addEventListener('change', () => void queryClient.invalidateQueries());
		stream.onerror = () => setConnected(false);
		return () => stream.close();
	}, []);
	useEffect(() => {
		const listener = (event: KeyboardEvent) => {
			if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
				event.preventDefault();
				setSearch(true);
			}
		};
		document.addEventListener('keydown', listener);
		return () => document.removeEventListener('keydown', listener);
	}, []);
	return (
		<div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
			<aside className="sidebar">
				<GuardLink to="/" className="brand" aria-label="Planicam Command Center">
					<span className="brand-mark">
						<Command size={23} />
					</span>
					<span>
						PLANICAM<small>COMMAND CENTER</small>
					</span>
				</GuardLink>
				<div className="sidebar-label mono">WORKSPACE</div>
				<nav>
					{navigation.map(({ path, title, icon: Icon }) => (
						<GuardLink
							key={path}
							title={title}
							to={path}
							className={location.pathname === path ? 'active' : ''}
						>
							<Icon size={18} />
							<span>{title}</span>
							{location.pathname === path && <span className="nav-indicator" />}
						</GuardLink>
					))}
				</nav>
				<div className="sidebar-bottom">
					<button aria-label="Backup & recovery" onClick={() => setSettings(true)}>
						<Settings size={17} />
						<span>Backup & recovery</span>
					</button>
					<div className="mono sidebar-status">
						<span className={`status-dot ${connected ? '' : 'offline'}`} />
						{connected ? 'HOST CONNECTED' : 'RECONNECTING'}
					</div>
					<small className="mono">V1 · PERSONAL WORKSPACE</small>
				</div>
			</aside>
			<div className="main-shell">
				<header className="topbar">
					<button aria-label="Toggle navigation" onClick={() => setCollapsed(!collapsed)}>
						<PanelLeft size={18} />
					</button>
					<div className="breadcrumb mono">
						PLANICAM<span>/</span>
						{navigation.find((item) => item.path === location.pathname)?.title.toUpperCase() ??
							'HUB'}
					</div>
					<button className="search-trigger" onClick={() => setSearch(true)}>
						<Search size={16} />
						<span>Search workspace</span>
						<kbd>Ctrl K</kbd>
					</button>
					<span className="topbar-status mono">
						<span className={`status-dot ${connected ? '' : 'offline'}`} />
						{connected ? 'LIVE' : 'OFFLINE'}
					</span>
					<button
						aria-label="Sign out"
						title="Sign out"
						onClick={async () => {
							if (dirty && !(await confirm('Discard the document draft and sign out?'))) return;
							await write('auth/logout', 'POST');
							onLogout();
						}}
					>
						<LogOut size={17} />
					</button>
				</header>
				<main className="main-content">
					<Suspense fallback={<Loading />}>
						<Routes>
							<Route path="/" element={<Hub preferences={preferences} />} />
							<Route path="/documents" element={<DocumentsPage />} />
							<Route path="/notes" element={<DocumentsPage mode="notes" />} />
							<Route path="/conclusions" element={<DocumentsPage mode="conclusions" />} />
							<Route path="/jobs" element={<JobsPage />} />
							<Route path="/calendar" element={<CalendarPage preferences={preferences} />} />
							<Route path="/schema" element={<SchemaPage />} />
							<Route
								path="*"
								element={
									<Empty action={<GuardLink to="/">Go to Hub</GuardLink>}>Page not found.</Empty>
								}
							/>
						</Routes>
					</Suspense>
				</main>
			</div>
			{search && <SearchDialog onClose={() => setSearch(false)} />}
			{settings && <SettingsDialog onClose={() => setSettings(false)} />}
		</div>
	);
}
function SearchDialog({ onClose }: { onClose: () => void }) {
	const [input, setInput] = useState('');
	const [query, setQuery] = useState('');
	useEffect(() => {
		const timer = setTimeout(() => setQuery(input.trim()), 250);
		return () => clearTimeout(timer);
	}, [input]);
	const results = useQuery({
		queryKey: ['search', query],
		queryFn: () =>
			api<{ title: string; kind: string; url: string; excerpt: string }[]>(
				`search?q=${encodeURIComponent(query)}`,
			),
		enabled: query.length >= 2,
	});
	return (
		<Modal title="Search workspace" onClose={onClose} wide>
			<input
				autoFocus
				className="command-search"
				aria-label="Search all content"
				placeholder="Search documents, tasks, notes, and calendar…"
				value={input}
				onChange={(event) => setInput(event.target.value)}
			/>
			{query.length < 2 ? (
				<p className="muted">Type at least two characters. Press Escape to close.</p>
			) : results.isPending ? (
				<Loading />
			) : results.error ? (
				<ErrorBox error={results.error} />
			) : (
				<div className="search-results">
					{results.data?.map((result) => (
						<GuardLink key={result.url} to={result.url} onClick={onClose}>
							<span className="badge mono">{result.kind}</span>
							<div>
								<strong>{result.title}</strong>
								<p>{result.excerpt}</p>
							</div>
							<ArrowUpRight size={16} />
						</GuardLink>
					))}
					{results.data?.length === 0 && <Empty>No matching content.</Empty>}
				</div>
			)}
		</Modal>
	);
}
function SettingsDialog({ onClose }: { onClose: () => void }) {
	const trash = useTrash();
	const refresh = useRefresh();
	const action = useAction();
	const { confirm, notify } = useFeedback();
	const input = useRef<HTMLInputElement>(null);
	return (
		<Modal title="Backup & recovery" onClose={onClose} wide>
			<h3>Workspace data</h3>
			<p className="muted">
				Backups contain tasks, calendar entries, notes, conclusions, and app-owned history.
				Repository documents remain in their repositories. Restoring preserves your current login
				credentials.
			</p>
			<div className="toolbar">
				<a className="button" href="/api/v1/backup" download>
					<Download size={16} />
					Download backup
				</a>
				<button onClick={() => input.current?.click()} disabled={action.busy}>
					<Upload size={16} />
					Restore backup
				</button>
				<input
					ref={input}
					className="sr-only"
					type="file"
					accept=".zip"
					onChange={async (event) => {
						const file = event.target.files?.[0];
						if (!file) return;
						if (
							await confirm(
								'Replace app-owned records and files with this backup? Download a current backup first if you need to preserve them.',
							)
						)
							void action.run(
								async () => {
									const response = await fetch('/api/v1/backup/restore', {
										method: 'POST',
										headers: { 'Content-Type': 'application/zip' },
										body: file,
									});
									if (!response.ok) throw new Error((await response.json()).error);
								},
								() => {
									notify('Backup restored.');
									void refresh();
								},
							);
						event.target.value = '';
					}}
				/>
			</div>
			<h3 className="subheading">Recover deleted items</h3>
			{trash.isPending ? (
				<Loading />
			) : trash.error ? (
				<ErrorBox error={trash.error} />
			) : trash.data?.length ? (
				<div className="recovery-list">
					{trash.data.map((item) => (
						<div key={item.id}>
							<ArchiveRestore size={18} />
							<div>
								<strong>{item.title}</strong>
								<small>
									{item.kind} · {new Date(item.deletedAt).toLocaleString()}
								</small>
							</div>
							<button
								disabled={action.busy}
								onClick={() =>
									void action.run(
										() => write(`trash/${item.id}/restore`, 'POST'),
										() => {
											notify('Item restored.');
											void refresh();
										},
									)
								}
							>
								Restore
							</button>
						</div>
					))}
				</div>
			) : (
				<Empty>No deleted items to recover.</Empty>
			)}
		</Modal>
	);
}
createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={client}>
			<RouterProvider
				router={createBrowserRouter([
					{
						path: '*',
						element: (
							<FeedbackProvider>
								<App />
							</FeedbackProvider>
						),
					},
				])}
			/>
		</QueryClientProvider>
	</StrictMode>,
);
