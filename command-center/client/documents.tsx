import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView } from '@codemirror/view';
import {
	FileText,
	FolderPlus,
	Plus,
	Pencil,
	Save,
	Paperclip,
	Trash2,
	ArrowRightLeft,
	Eye,
	Columns2,
	Bold,
	List,
	Code2,
	Network,
	BarChart3,
} from 'lucide-react';
import type { DocumentFile, FileSource } from '../shared/contracts';
import { localDate, repositoryScopes, type RepositoryScope } from '../shared/contracts';
import { api, useDocuments, useRefresh, write } from './api';
import {
	Empty,
	ErrorBox,
	Field,
	Loading,
	Modal,
	Prompt,
	submit,
	useAction,
	useFeedback,
} from './ui';
import { Markdown } from './markdown';

export function DocumentsPage({
	mode = 'documents',
}: {
	mode?: 'documents' | 'notes' | 'conclusions';
}) {
	const [params, setParams] = useSearchParams();
	const location = useLocation();
	const { confirm, dirty, setDirty } = useFeedback();
	const source = (
		mode === 'documents' ? (params.get('source') ?? 'workspace') : mode
	) as FileSource;
	const path = params.get('path');
	const scope = (params.get('scope') ?? path?.split('/')[0] ?? 'workspace') as RepositoryScope;
	const documents = useDocuments(source, mode === 'conclusions' ? scope : undefined);
	const folders = useQuery({
		queryKey: ['folders'],
		queryFn: () => api<string[]>('folders'),
		enabled: mode === 'notes',
	});
	const [filter, setFilter] = useState('');
	const [folder, setFolder] = useState('');
	useEffect(() => {
		setFolder('');
		setFilter('');
	}, [mode]);
	const [creating, setCreating] = useState(false);
	const [folderAction, setFolderAction] = useState<'create' | 'move' | null>(null);
	const action = useAction();
	const refresh = useRefresh();
	const select = async (nextSource: string, nextPath?: string) => {
		setParams({
			source: mode === 'conclusions' ? 'conclusions' : nextSource,
			...(mode === 'conclusions'
				? {
						scope: nextPath
							? nextPath.split('/')[0]
							: nextSource === 'conclusions'
								? scope
								: nextSource,
					}
				: {}),
			...(nextPath ? { path: nextPath } : {}),
		});
	};
	const items =
		documents.data?.filter(
			(document) =>
				`${document.title} ${document.path} ${document.tags?.join(' ')}`
					.toLowerCase()
					.includes(filter.toLowerCase()) &&
				(!folder || document.path.startsWith(`${folder}/`)),
		) ?? [];
	return (
		<div className="document-layout">
			<aside className="document-browser">
				<div className="view-heading">
					<h1>{mode === 'documents' ? 'Documents' : mode === 'notes' ? 'Notes' : 'Conclusions'}</h1>
					<button
						aria-label={`New ${mode === 'notes' ? 'note' : mode === 'conclusions' ? 'conclusion' : 'document'}`}
						onClick={() => setCreating(true)}
					>
						<Plus size={18} />
					</button>
				</div>
				{mode !== 'notes' && (
					<div className="segmented">
						{repositoryScopes.map((item) => (
							<button
								className={(mode === 'conclusions' ? scope : source) === item ? 'selected' : ''}
								key={item}
								onClick={() => void select(item)}
							>
								{item}
							</button>
						))}
					</div>
				)}
				<input
					aria-label="Filter documents"
					placeholder="Filter titles, paths, tags…"
					value={filter}
					onChange={(event) => setFilter(event.target.value)}
				/>
				{mode === 'notes' && (
					<>
						<div className="folder-controls">
							<select
								aria-label="Note folder"
								value={folder}
								onChange={(event) => setFolder(event.target.value)}
							>
								<option value="">All folders</option>
								{folders.data?.map((item) => (
									<option key={item}>{item}</option>
								))}
							</select>
							<button
								title="New folder"
								aria-label="New folder"
								onClick={() => setFolderAction('create')}
							>
								<FolderPlus size={17} />
							</button>
						</div>
						{folder && (
							<div className="toolbar">
								<button onClick={() => setFolderAction('move')}>Rename / move folder</button>
								<button
									onClick={async () => {
										if (await confirm(`Delete empty folder “${folder}”?`))
											void action.run(
												() => write('folders', 'POST', { action: 'delete', path: folder }),
												() => {
													setFolder('');
													void refresh();
												},
											);
									}}
								>
									Delete folder
								</button>
							</div>
						)}
					</>
				)}
				{documents.isPending ? (
					<Loading />
				) : documents.error ? (
					<ErrorBox error={documents.error} />
				) : (
					<div className="document-list">
						{items.map((item) => (
							<button
								key={item.path}
								className={path === item.path ? 'active' : ''}
								onClick={() => void select(source, item.path)}
							>
								<FileText size={16} />
								<span>
									<strong>{item.title}</strong>
									<small>{item.path}</small>
									{item.approvedAt && <small>Approved {item.approvedAt}</small>}
								</span>
							</button>
						))}
						{!items.length && (
							<Empty>{filter ? 'No matching documents.' : `No ${mode} yet.`}</Empty>
						)}
					</div>
				)}
				<div className="browser-footer mono">
					{items.length} FILES · {(mode === 'conclusions' ? scope : source).toUpperCase()}
				</div>
			</aside>
			<section className="document-workspace">
				{path ? (
					<DocumentEditor
						key={`${source}:${path}`}
						source={source}
						path={path}
						onRemoved={() => void select(source)}
						onMoved={(to) => void select(source, to)}
					/>
				) : (
					<Empty
						action={
							<button onClick={() => setCreating(true)}>
								<Plus size={16} />
								Create{' '}
								{mode === 'notes' ? 'note' : mode === 'conclusions' ? 'conclusion' : 'document'}
							</button>
						}
					>
						Select a document to read or edit.
						{mode === 'conclusions' && (
							<span className="block muted">Approved decisions, saved when you ask.</span>
						)}
					</Empty>
				)}
			</section>
			{creating && (
				<NewDocument
					source={source}
					folder={mode === 'conclusions' ? scope : folder}
					onClose={() => setCreating(false)}
					onCreated={(createdPath) => {
						setCreating(false);
						void refresh();
						void select(source, createdPath);
					}}
				/>
			)}
			{folderAction && (
				<Prompt
					title={folderAction === 'create' ? 'New note folder' : 'Rename / move note folder'}
					label="Folder path"
					initial={folderAction === 'move' ? folder : ''}
					onClose={() => setFolderAction(null)}
					hint="Use a relative path. Moving a folder preserves its contained pages and attachments."
					onSubmit={async (value) => {
						await write('folders', 'POST', {
							action: folderAction,
							path: folderAction === 'create' ? value : folder,
							to: folderAction === 'move' ? value : undefined,
						});
						setFolder(value);
						await refresh();
					}}
				/>
			)}
		</div>
	);
}
function NewDocument({
	source,
	folder,
	onClose,
	onCreated,
}: {
	source: FileSource;
	folder: string;
	onClose: () => void;
	onCreated: (path: string) => void;
}) {
	const [title, setTitle] = useState('');
	const pathPrefix = folder
		? `${folder}/`
		: ['workspace', 'frontend', 'backend'].includes(source)
			? 'docs/'
			: '';
	const [path, setPath] = useState(pathPrefix);
	const [approval, setApproval] = useState(localDate());
	const action = useAction();
	return (
		<Modal
			title={`New ${source === 'conclusions' ? 'approved conclusion' : source === 'notes' ? 'note' : 'document'}`}
			onClose={onClose}
		>
			<form
				onSubmit={submit(
					() =>
						void action.run(
							() =>
								write('document', 'PUT', {
									source,
									path,
									title,
									content: `# ${title}\n\n`,
									hash: null,
									...(source === 'conclusions' ? { approvedAt: approval } : {}),
								}),
							() => onCreated(path),
						),
				)}
			>
				<Field label="Title">
					<input
						autoFocus
						required
						value={title}
						maxLength={200}
						onChange={(event) => {
							const next = event.target.value;
							setTitle(next);
							setPath(
								`${pathPrefix}${next
									.toLowerCase()
									.replace(/[^a-z0-9]+/g, '-')
									.replace(/^-|-$/g, '')}.md`,
							);
						}}
					/>
				</Field>
				<Field label="Markdown path">
					<input required value={path} onChange={(event) => setPath(event.target.value)} />
				</Field>
				{source === 'conclusions' && (
					<>
						<Field label="Approval date">
							<input
								type="date"
								required
								value={approval}
								onChange={(event) => setApproval(event.target.value)}
							/>
						</Field>
						<p className="muted">Create this record after the conclusion has been approved.</p>
					</>
				)}
				<div className="form-actions">
					<button type="button" onClick={onClose}>
						Cancel
					</button>
					<button className="primary" disabled={action.busy}>
						Create
					</button>
				</div>
			</form>
		</Modal>
	);
}
function DocumentEditor({
	source,
	path,
	onRemoved,
	onMoved,
}: {
	source: FileSource;
	path: string;
	onRemoved: () => void;
	onMoved: (path: string) => void;
}) {
	const query = useQuery({
		queryKey: ['document', source, path],
		queryFn: () => api<DocumentFile>(`document?source=${source}&path=${encodeURIComponent(path)}`),
	});
	const [loaded, setLoaded] = useState<DocumentFile | null>(null);
	const [content, setContent] = useState('');
	const [title, setTitle] = useState('');
	const [tags, setTags] = useState('');
	const [approvedAt, setApprovedAt] = useState('');
	const [sourceChat, setSourceChat] = useState('');
	const [editing, setEditing] = useState(false);
	const [preview, setPreview] = useState(true);
	const [moving, setMoving] = useState(false);
	const [copying, setCopying] = useState(false);
	const { dirty, setDirty, notify, confirm } = useFeedback();
	const action = useAction();
	const refresh = useRefresh();
	const location = useLocation();
	useEffect(() => {
		if (query.data && !dirty) {
			setLoaded(query.data);
			setContent(query.data.content);
			setTitle(query.data.title);
			setTags(query.data.tags?.join(', ') ?? '');
			setApprovedAt(query.data.approvedAt ?? '');
			setSourceChat(query.data.sourceChat ?? '');
		}
	}, [query.data, dirty]);
	useEffect(() => () => setDirty(false), []);
	useEffect(() => {
		if (location.hash && query.data)
			setTimeout(
				() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(),
				200,
			);
	}, [location.hash, query.data, editing]);
	const change = (next: string) => {
		setContent(next);
		setDirty(true);
	};
	const insert = (text: string) => change(`${content}\n${text}\n`);
	const save = () =>
		void action.run(
			() =>
				api<DocumentFile>('document', {
					method: 'PUT',
					body: JSON.stringify({
						source,
						path,
						content,
						hash: loaded?.hash,
						...(source === 'notes' || source === 'conclusions'
							? {
									title,
									tags: tags
										.split(',')
										.map((tag) => tag.trim())
										.filter(Boolean),
									...(approvedAt ? { approvedAt } : {}),
									sourceChat: sourceChat || null,
								}
							: {}),
					}),
				}),
			(file) => {
				setLoaded(file);
				setContent(file.content);
				setDirty(false);
				notify('Document saved.');
				void refresh();
			},
		);
	if (query.isPending || !loaded)
		return query.error ? <ErrorBox error={query.error} /> : <Loading />;
	return (
		<>
			<div className="editor-header">
				<div>
					<h1>{loaded.title}</h1>
					<div className="mono muted path">
						{source} / {path}
					</div>
				</div>
				<div className="toolbar">
					{dirty && <span className="badge warning">Unsaved</span>}
					{query.data?.hash !== loaded.hash && (
						<span className="badge warning">Source changed</span>
					)}
					<button
						onClick={async () => {
							if (dirty && !(await confirm('Discard the unsaved draft and reload the source?')))
								return;
							setDirty(false);
							void query.refetch();
						}}
					>
						Reload
					</button>
					<button className={editing ? 'selected' : ''} onClick={() => setEditing(!editing)}>
						{editing ? <Eye size={16} /> : <Pencil size={16} />}
						{editing ? 'Read' : 'Edit'}
					</button>
					{editing && (
						<button className="primary" disabled={action.busy || !dirty} onClick={save}>
							<Save size={16} />
							Save
						</button>
					)}
					{editing && (
						<button disabled={action.busy} onClick={() => setCopying(true)}>
							Save copy
						</button>
					)}
					<button aria-label="Move document" onClick={() => setMoving(true)}>
						<ArrowRightLeft size={16} />
					</button>
					<button
						aria-label="Delete document"
						onClick={async () => {
							if (
								await confirm(
									`Move “${loaded.title}” to recovery? Its attachments will be preserved.`,
								)
							)
								void action.run(
									() => write('document', 'DELETE', { source, path, hash: loaded.hash }),
									() => {
										setDirty(false);
										onRemoved();
										void refresh();
									},
								);
						}}
					>
						<Trash2 size={16} />
					</button>
				</div>
			</div>
			{editing && (
				<>
					<div className="toolbar editor-toolbar">
						<button
							title="Insert bold text"
							aria-label="Insert bold text"
							onClick={() => insert('**text**')}
						>
							<Bold size={16} />
						</button>
						<button title="Insert list" aria-label="Insert list" onClick={() => insert('- Item')}>
							<List size={16} />
						</button>
						<button
							title="Insert code block"
							aria-label="Insert code block"
							onClick={() => insert('```typescript\n// code\n```')}
						>
							<Code2 size={16} />
						</button>
						<button
							onClick={() => insert('```mermaid\nflowchart LR\n  A[Input] --> B[Output]\n```')}
						>
							<Network size={16} />
							Diagram
						</button>
						<button
							onClick={() =>
								insert(
									'```vega-lite\n{"data":{"values":[{"label":"A","value":3},{"label":"B","value":5}]},"mark":"bar","encoding":{"x":{"field":"label","type":"nominal"},"y":{"field":"value","type":"quantitative"}}}\n```',
								)
							}
						>
							<BarChart3 size={16} />
							Chart
						</button>
						<label className="button">
							<Paperclip size={16} />
							Attach
							<input
								className="sr-only"
								type="file"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) return;
									const form = new FormData();
									form.set('source', source);
									form.set('path', path);
									form.set('file', file);
									void action.run(
										() =>
											api<{ markdownPath: string }>('attachments', { method: 'POST', body: form }),
										({ markdownPath }) => {
											insert(
												`${file.type.startsWith('image/') ? '!' : ''}[${file.name.replace(/[\[\]]/g, '')}](${markdownPath})`,
											);
										},
									);
									event.target.value = '';
								}}
							/>
						</label>
						<button className={preview ? 'selected' : ''} onClick={() => setPreview(!preview)}>
							<Columns2 size={16} />
							Preview
						</button>
						<span className="mono muted">{content.length.toLocaleString()} chars</span>
					</div>
					{(source === 'notes' || source === 'conclusions') && (
						<div className="metadata-fields">
							<Field label="Title">
								<input
									value={title}
									onChange={(event) => {
										setTitle(event.target.value);
										setDirty(true);
									}}
								/>
							</Field>
							<Field label="Tags (comma separated)">
								<input
									value={tags}
									onChange={(event) => {
										setTags(event.target.value);
										setDirty(true);
									}}
								/>
							</Field>
							{source === 'conclusions' && (
								<>
									<Field label="Approval date">
										<input
											type="date"
											value={approvedAt}
											onChange={(event) => {
												setApprovedAt(event.target.value);
												setDirty(true);
											}}
										/>
									</Field>
									<Field label="Source chat URL (optional)">
										<input
											type="url"
											value={sourceChat}
											onChange={(event) => {
												setSourceChat(event.target.value);
												setDirty(true);
											}}
										/>
									</Field>
								</>
							)}
						</div>
					)}
				</>
			)}
			<div className={`editor-content ${editing && preview ? 'split' : ''}`}>
				{editing && (
					<CodeMirror
						value={content}
						onChange={change}
						theme="dark"
						extensions={[
							markdown(),
							EditorView.contentAttributes.of({ 'aria-label': 'Markdown source' }),
						]}
						height="100%"
						basicSetup={{ lineNumbers: true, foldGutter: true }}
						onKeyDown={(event) => {
							if ((event.ctrlKey || event.metaKey) && event.key === 's') {
								event.preventDefault();
								save();
							}
						}}
					/>
				)}
				{(!editing || preview) && <Markdown content={content} context={{ source, path }} outline />}
			</div>
			{moving && (
				<Prompt
					title="Move / rename document"
					label="Destination Markdown path"
					initial={path}
					onClose={() => setMoving(false)}
					hint="Local attachment folders move with the document. Other relative links are preserved and may need a manual update. Save your draft before moving."
					onSubmit={async (to) => {
						if (dirty) throw new Error('Save or discard the draft before moving.');
						await write('document/move', 'POST', { source, path, to, hash: loaded.hash });
						onMoved(to);
						await refresh();
					}}
				/>
			)}
			{copying && (
				<Prompt
					title="Save draft as a new document"
					label="New Markdown path"
					initial={path.replace(/\.(md|markdown)$/i, '-copy.md')}
					hint="Existing documents are preserved. Relative attachment links work when the copy stays in the same folder."
					onClose={() => setCopying(false)}
					onSubmit={async (to) => {
						await write('document', 'PUT', {
							source,
							path: to,
							content,
							hash: null,
							...(source === 'notes' || source === 'conclusions'
								? {
										title,
										tags: tags
											.split(',')
											.map((tag) => tag.trim())
											.filter(Boolean),
										...(approvedAt ? { approvedAt } : {}),
										sourceChat: sourceChat || null,
									}
								: {}),
						});
						setDirty(false);
						onMoved(to);
						await refresh();
					}}
				/>
			)}
		</>
	);
}
