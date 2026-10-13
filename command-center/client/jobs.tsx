import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	closestCorners,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	useSortable,
	sortableKeyboardCoordinates,
	horizontalListSortingStrategy,
	verticalListSortingStrategy,
	arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	Plus,
	GripVertical,
	Pencil,
	Trash2,
	GitBranch,
	Link2,
	Check,
	ArrowRight,
} from 'lucide-react';
import { progress, type Board, type Section, type Task, type Job } from '../shared/contracts';
import { useBoard, useRefresh, write } from './api';
import {
	Empty,
	ErrorBox,
	Field,
	GuardLink,
	Loading,
	Modal,
	Prompt,
	submit,
	useAction,
	useFeedback,
} from './ui';
import { Markdown } from './markdown';

export function JobsPage() {
	const query = useBoard();
	const refresh = useRefresh();
	const [params, setParams] = useSearchParams();
	const selected = params.get('job');
	const [newJob, setNewJob] = useState(false);
	const [editJob, setEditJob] = useState<Job | null>(null);
	const [newSection, setNewSection] = useState(false);
	const [editSection, setEditSection] = useState<Section | null>(null);
	const [newTask, setNewTask] = useState<{ sectionId: string; parentId: string | null } | null>(
		null,
	);
	const [filter, setFilter] = useState('');
	const [tag, setTag] = useState('');
	const action = useAction();
	const { confirm } = useFeedback();
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);
	useEffect(() => {
		if (query.data?.jobs.length && !query.data.jobs.some((item) => item.id === selected))
			setParams({ job: query.data.jobs[0].id });
	}, [query.data?.jobs, selected]);
	if (query.isPending) return <Loading />;
	if (query.error) return <ErrorBox error={query.error} />;
	const board = query.data!;
	const job = board.jobs.find((item) => item.id === selected);
	const sections = board.sections.filter((section) => section.jobId === selected);
	const tasks = board.tasks.filter((task) => task.jobId === selected);
	const task = board.tasks.find((task) => task.id === params.get('task'));
	const tags = [...new Set(tasks.flatMap((task) => task.tags))].sort();
	const openTask = (id: string) => setParams({ job: selected!, task: id });
	const drag = (event: DragEndEvent) => {
		if (!event.over) return;
		const active = String(event.active.id),
			over = String(event.over.id);
		if (active === over) return;
		if (event.active.data.current?.kind === 'section') {
			const to = sections.findIndex(
				(section) => section.id === (event.over!.data.current?.sectionId ?? over),
			);
			const from = sections.findIndex((section) => section.id === active);
			if (from < 0 || to < 0) return;
			const ids = arrayMove(
				sections.map((section) => section.id),
				from,
				to,
			);
			void action.run(
				() =>
					write('reorder', 'POST', {
						kind: 'sections',
						ids,
						revisions: Object.fromEntries(
							sections.map((section) => [section.id, section.revision]),
						),
						jobId: selected,
					}),
				() => void refresh(),
			);
		} else {
			const moving = tasks.find((task) => task.id === active);
			const targetTask = tasks.find((task) => task.id === over);
			const targetSection =
				targetTask?.sectionId ?? sections.find((section) => section.id === over)?.id;
			if (!moving || !targetSection) return;
			void action.run(
				() =>
					write(`tasks/${active}/move`, 'POST', {
						revision: moving.revision,
						sectionId: targetSection,
						beforeId: targetTask?.id ?? null,
					}),
				() => void refresh(),
			);
		}
	};
	return (
		<div>
			<div className="view-heading">
				<div>
					<h1>Jobs</h1>
					<p className="muted">Organize the work. Keep the next action visible.</p>
				</div>
				<button className="primary" onClick={() => setNewJob(true)}>
					<Plus size={16} />
					New Job
				</button>
			</div>
			<div className="job-tabs">
				{board.jobs.map((item, index) => {
					const count = progress(board, item.id);
					return (
						<div className={item.id === selected ? 'active' : ''} key={item.id}>
							<button onClick={() => setParams({ job: item.id })}>
								<strong>{item.title}</strong>
								<span className="mono">
									{count.remaining}/{count.total} remaining
								</span>
								<span className="progress-track">
									<span style={{ width: `${count.percent}%` }} />
								</span>
							</button>
							<button
								title="Move Job left"
								aria-label={`Move ${item.title} left`}
								disabled={index === 0 || action.busy}
								onClick={() =>
									void action.run(
										() =>
											write('reorder', 'POST', {
												kind: 'jobs',
												ids: arrayMove(
													board.jobs.map((item) => item.id),
													index,
													index - 1,
												),
												revisions: Object.fromEntries(
													board.jobs.map((item) => [item.id, item.revision]),
												),
											}),
										() => void refresh(),
									)
								}
							>
								←
							</button>
						</div>
					);
				})}
			</div>
			{job ? (
				<>
					<div className="board-toolbar">
						<div>
							<h2>{job.title}</h2>
							{job.description && <p className="muted">{job.description}</p>}
						</div>
						<div className="toolbar">
							<input
								aria-label="Filter tasks"
								placeholder="Filter tasks…"
								value={filter}
								onChange={(event) => setFilter(event.target.value)}
							/>
							<select
								aria-label="Filter by tag"
								value={tag}
								onChange={(event) => setTag(event.target.value)}
							>
								<option value="">All tags</option>
								{tags.map((tag) => (
									<option key={tag}>{tag}</option>
								))}
							</select>
							<button onClick={() => setNewSection(true)}>
								<Plus size={16} />
								Section
							</button>
							<button aria-label="Edit Job" onClick={() => setEditJob(job)}>
								<Pencil size={16} />
							</button>
							<button
								aria-label="Delete Job"
								onClick={async () => {
									if (
										await confirm(
											`Move “${job.title}”, its ${sections.length} sections and ${tasks.length} tasks to recovery?`,
										)
									)
										void action.run(
											() => write(`jobs/${job.id}?revision=${job.revision}`, 'DELETE'),
											() => void refresh(),
										);
								}}
							>
								<Trash2 size={16} />
							</button>
						</div>
					</div>
					<DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={drag}>
						<SortableContext
							items={sections.map((section) => section.id)}
							strategy={horizontalListSortingStrategy}
						>
							<div className="board">
								{sections.map((section) => (
									<BoardSection
										key={section.id}
										section={section}
										tasks={tasks.filter(
											(task) =>
												task.sectionId === section.id &&
												`${task.title} ${task.description}`
													.toLowerCase()
													.includes(filter.toLowerCase()) &&
												(!tag || task.tags.includes(tag)),
										)}
										board={board}
										onTask={openTask}
										onAdd={() => setNewTask({ sectionId: section.id, parentId: null })}
										onEdit={() => setEditSection(section)}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				</>
			) : (
				<Empty
					action={
						<button className="primary" onClick={() => setNewJob(true)}>
							Create your first Job
						</button>
					}
				>
					A clear place for each part of Planicam.
				</Empty>
			)}
			{newJob && (
				<JobForm
					onClose={() => setNewJob(false)}
					onSaved={async (item) => {
						setNewJob(false);
						await refresh();
						setParams({ job: item.id });
					}}
				/>
			)}
			{editJob && (
				<JobForm
					item={editJob}
					onClose={() => setEditJob(null)}
					onSaved={() => {
						setEditJob(null);
						void refresh();
					}}
				/>
			)}
			{newSection && (
				<Prompt
					title="New section"
					onClose={() => setNewSection(false)}
					onSubmit={async (title) => {
						await write('sections', 'POST', { title, jobId: selected });
						await refresh();
					}}
				/>
			)}
			{editSection && (
				<SectionForm
					section={editSection}
					sections={sections}
					taskCount={tasks.filter((task) => task.sectionId === editSection.id).length}
					onClose={() => setEditSection(null)}
					onSaved={() => {
						setEditSection(null);
						void refresh();
					}}
				/>
			)}
			{(task || newTask) && (
				<TaskForm
					key={task?.id ?? 'new'}
					task={task}
					initial={newTask ?? undefined}
					board={board}
					onClose={() => {
						setNewTask(null);
						setParams({ job: selected! });
					}}
					onSaved={() => {
						setNewTask(null);
						setParams({ job: selected! });
						void refresh();
					}}
					onOpen={openTask}
					onSubtask={(parent) => {
						setParams({ job: selected! });
						const section =
							sections.find((section) => section.kind === 'inbox') ??
							sections.find((section) => section.kind !== 'done');
						if (section) setNewTask({ sectionId: section.id, parentId: parent.id });
						else
							void action.run(
								() => write<Section>('sections', 'POST', { title: 'Inbox', jobId: selected }),
								async (created) => {
									await refresh();
									setNewTask({ sectionId: created.id, parentId: parent.id });
								},
							);
					}}
				/>
			)}
		</div>
	);
}
function BoardSection({
	section,
	tasks,
	board,
	onTask,
	onAdd,
	onEdit,
}: {
	section: Section;
	tasks: Task[];
	board: Board;
	onTask: (id: string) => void;
	onAdd: () => void;
	onEdit: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: section.id,
		data: { kind: 'section', sectionId: section.id },
	});
	return (
		<section
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
			}}
			className={`board-section ${section.kind}`}
		>
			<div className="section-header">
				<button aria-label={`Reorder ${section.title} section`} {...attributes} {...listeners}>
					<GripVertical size={15} />
				</button>
				<h3>{section.title}</h3>
				<span className="badge mono">{tasks.length}</span>
				<button aria-label={`Configure ${section.title}`} onClick={onEdit}>
					<Pencil size={14} />
				</button>
			</div>
			<SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
				<div className="task-stack">
					{tasks.map((task) => (
						<TaskCard key={task.id} task={task} board={board} onClick={() => onTask(task.id)} />
					))}
					{!tasks.length && <div className="drop-hint">No tasks in this section</div>}
				</div>
			</SortableContext>
			<button className="add-task" onClick={onAdd}>
				<Plus size={15} />
				Add task
			</button>
		</section>
	);
}
function TaskCard({ task, board, onClick }: { task: Task; board: Board; onClick: () => void }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: task.id,
		data: { kind: 'task', sectionId: task.sectionId },
	});
	const subtasks = board.tasks.filter((item) => item.parentId === task.id);
	const parent = board.tasks.find((item) => item.id === task.parentId);
	return (
		<article
			ref={setNodeRef}
			className="task-card"
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.4 : 1,
			}}
		>
			<div className="task-card-top">
				<button className="task-title" onClick={onClick}>
					{task.title}
				</button>
				<button
					className="drag-handle"
					aria-label={`Move ${task.title}`}
					{...attributes}
					{...listeners}
				>
					<GripVertical size={16} />
				</button>
			</div>
			{parent && (
				<div className="task-parent">
					<GitBranch size={12} />
					{parent.title}
				</div>
			)}
			{task.description && <p>{task.description.replace(/[#*`]/g, '').slice(0, 110)}</p>}
			<div className="task-card-bottom">
				<div className="tags">
					{task.tags.slice(0, 4).map((tag) => (
						<span className="tag" key={tag}>
							{tag}
						</span>
					))}
				</div>
				{subtasks.length > 0 && (
					<span className="mono">
						<GitBranch size={12} />
						{subtasks.length}
					</span>
				)}
				{task.links.length > 0 && (
					<span>
						<Link2 size={12} />
						{task.links.length}
					</span>
				)}
			</div>
		</article>
	);
}
function JobForm({
	item,
	onClose,
	onSaved,
}: {
	item?: Job;
	onClose: () => void;
	onSaved: (item: Job) => void;
}) {
	const [title, setTitle] = useState(item?.title ?? '');
	const [description, setDescription] = useState(item?.description ?? '');
	const action = useAction();
	return (
		<Modal title={item ? 'Edit Job' : 'New Job'} onClose={onClose}>
			<form
				onSubmit={submit(
					() =>
						void action.run(
							() =>
								write<Job>(item ? `jobs/${item.id}` : 'jobs', item ? 'PATCH' : 'POST', {
									title,
									description,
									...(item ? { revision: item.revision } : {}),
								}),
							onSaved,
						),
				)}
			>
				<Field label="Title">
					<input
						autoFocus
						required
						maxLength={200}
						value={title}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</Field>
				<Field label="Description">
					<textarea
						rows={4}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</Field>
				<div className="form-actions">
					<button type="button" onClick={onClose}>
						Cancel
					</button>
					<button className="primary" disabled={action.busy}>
						Save Job
					</button>
				</div>
			</form>
		</Modal>
	);
}
function SectionForm({
	section,
	sections,
	taskCount,
	onClose,
	onSaved,
}: {
	section: Section;
	sections: Section[];
	taskCount: number;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState(section.title);
	const action = useAction();
	const { confirm } = useFeedback();
	const refresh = useRefresh();
	const index = sections.findIndex((item) => item.id === section.id);
	return (
		<Modal title="Section settings" onClose={onClose}>
			<form
				onSubmit={submit(
					() =>
						void action.run(
							() => write(`sections/${section.id}`, 'PATCH', { title, revision: section.revision }),
							onSaved,
						),
				)}
			>
				<Field label="Title">
					<input
						required
						disabled={section.kind === 'done'}
						value={title}
						onChange={(event) => setTitle(event.target.value)}
					/>
				</Field>
				{section.kind === 'done' && (
					<p className="muted">Done keeps its name and cannot be deleted.</p>
				)}
				<div className="toolbar">
					{[-1, 1].map((direction) => (
						<button
							key={direction}
							type="button"
							disabled={
								index + direction < 0 || index + direction >= sections.length || action.busy
							}
							onClick={() =>
								void action.run(
									() =>
										write('reorder', 'POST', {
											kind: 'sections',
											ids: arrayMove(
												sections.map((item) => item.id),
												index,
												index + direction,
											),
											revisions: Object.fromEntries(
												sections.map((item) => [item.id, item.revision]),
											),
											jobId: section.jobId,
										}),
									() => {
										void refresh();
										onClose();
									},
								)
							}
						>
							Move {direction < 0 ? 'left' : 'right'}
						</button>
					))}
				</div>
				<div className="form-actions">
					{section.kind !== 'done' && (
						<button
							className="danger"
							type="button"
							disabled={taskCount > 0 || action.busy}
							title={taskCount ? 'Move all tasks out first' : ''}
							onClick={async () => {
								if (await confirm(`Move empty section “${section.title}” to recovery?`))
									void action.run(
										() => write(`sections/${section.id}?revision=${section.revision}`, 'DELETE'),
										onSaved,
									);
							}}
						>
							Delete section
						</button>
					)}
					<button type="button" onClick={onClose}>
						Close
					</button>
					{section.kind !== 'done' && (
						<button className="primary" disabled={action.busy}>
							Save
						</button>
					)}
				</div>
			</form>
		</Modal>
	);
}
function TaskForm({
	task,
	initial,
	board,
	onClose,
	onSaved,
	onOpen,
	onSubtask,
}: {
	task?: Task;
	initial?: { sectionId: string; parentId: string | null };
	board: Board;
	onClose: () => void;
	onSaved: () => void;
	onOpen: (id: string) => void;
	onSubtask: (task: Task) => void;
}) {
	const [title, setTitle] = useState(task?.title ?? '');
	const [description, setDescription] = useState(task?.description ?? '');
	const [tags, setTags] = useState(task?.tags.join(', ') ?? '');
	const [links, setLinks] = useState(task?.links.join('\n') ?? '');
	const [sectionId, setSectionId] = useState(task?.sectionId ?? initial!.sectionId);
	const [parentId, setParentId] = useState(task?.parentId ?? initial?.parentId ?? '');
	const [moveTo, setMoveTo] = useState('');
	const [preview, setPreview] = useState(false);
	const [completeAll, setCompleteAll] = useState(false);
	const jobId = task?.jobId ?? board.sections.find((item) => item.id === sectionId)!.jobId;
	const sections = board.sections.filter((item) => item.jobId === jobId);
	const action = useAction();
	const { confirm } = useFeedback();
	const descendantIds = new Set<string>();
	const visit = (id: string) => {
		board.tasks
			.filter((item) => item.parentId === id)
			.forEach((item) => {
				descendantIds.add(item.id);
				visit(item.id);
			});
	};
	if (task) visit(task.id);
	const children = board.tasks.filter((item) => item.parentId === task?.id);
	const done = sections.find((section) => section.kind === 'done')!;
	const save = async () => {
		const input = {
			title,
			description,
			tags: tags
				.split(',')
				.map((tag) => tag.trim())
				.filter(Boolean),
			links: links
				.split('\n')
				.map((link) => link.trim())
				.filter(Boolean),
			parentId: parentId || null,
		};
		if (!task) return write('tasks', 'POST', { ...input, sectionId });
		await write<Task>(`tasks/${task.id}`, 'PATCH', {
			...input,
			revision: task.revision,
			sectionId,
			completeAll,
		});
	};
	return (
		<Modal title={task ? 'Task details' : 'New task'} onClose={onClose} wide>
			<form onSubmit={submit(() => void action.run(save, onSaved))}>
				<div className="two-columns">
					<div>
						<Field label="Title">
							<input
								autoFocus
								required
								maxLength={200}
								value={title}
								onChange={(event) => setTitle(event.target.value)}
							/>
						</Field>
						<Field label="Description · Markdown">
							<textarea
								rows={9}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
							/>
						</Field>
						<button type="button" onClick={() => setPreview(!preview)}>
							Toggle description preview
						</button>
						{preview && <Markdown content={description} />}
						<Field label="Tags (comma separated)">
							<input value={tags} onChange={(event) => setTags(event.target.value)} />
						</Field>
						<Field label="Supporting links (one per line)">
							<textarea
								rows={3}
								value={links}
								onChange={(event) => setLinks(event.target.value)}
								placeholder="/notes?source=notes&path=…"
							/>
						</Field>
						{task?.links.map((link) =>
							/^(\/[^/]|https?:\/\/)/i.test(link) ? (
								<div key={link} className="supporting-link">
									{link.startsWith('/') ? (
										<GuardLink to={link} onClick={onClose}>
											{link}
										</GuardLink>
									) : (
										<a href={link} target="_blank" rel="noreferrer">
											{link}
										</a>
									)}
								</div>
							) : null,
						)}
					</div>
					<div>
						<Field label="Section">
							<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
								{sections.map((section) => (
									<option value={section.id} key={section.id}>
										{section.title}
									</option>
								))}
							</select>
						</Field>
						{sectionId === done.id && task && descendantIds.size > 0 && (
							<label className="checkbox">
								<input
									type="checkbox"
									checked={completeAll}
									onChange={(event) => setCompleteAll(event.target.checked)}
								/>
								Complete all subtasks
							</label>
						)}
						<Field label="Parent task">
							<select value={parentId} onChange={(event) => setParentId(event.target.value)}>
								<option value="">Top-level task</option>
								{board.tasks
									.filter(
										(item) =>
											item.jobId === jobId && item.id !== task?.id && !descendantIds.has(item.id),
									)
									.map((item) => (
										<option key={item.id} value={item.id}>
											{item.title}
										</option>
									))}
							</select>
						</Field>
						{task && (
							<>
								<h3 className="subheading">Subtasks · {descendantIds.size}</h3>
								<TaskTree board={board} parentId={task.id} onOpen={onOpen} />
								<button type="button" onClick={() => onSubtask(task)}>
									<Plus size={15} />
									Add subtask
								</button>
								<Field label="Transfer subtree to Job">
									<select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
										<option value="">Choose destination…</option>
										{board.jobs
											.filter((item) => item.id !== jobId)
											.map((item) => (
												<option key={item.id} value={item.id}>
													{item.title}
												</option>
											))}
									</select>
								</Field>
								<p className="muted">
									Transfers {descendantIds.size + 1} tasks. Completed tasks stay Done; unfinished
									tasks enter Inbox.
								</p>
								<button
									type="button"
									disabled={!moveTo || action.busy}
									onClick={async () => {
										if (
											await confirm(
												`Transfer ${descendantIds.size + 1} tasks? Unsaved field edits will be discarded.`,
											)
										)
											void action.run(
												() =>
													write(`tasks/${task.id}/move`, 'POST', {
														revision: task.revision,
														sectionId: board.sections.find(
															(item) => item.jobId === moveTo && item.kind === 'done',
														)!.id,
													}),
												onSaved,
											);
									}}
								>
									<ArrowRight size={15} />
									Transfer
								</button>
							</>
						)}
					</div>
				</div>
				<div className="form-actions">
					{task && (
						<button
							type="button"
							className="danger"
							onClick={async () => {
								if (await confirm(`Move this task and ${descendantIds.size} subtasks to recovery?`))
									void action.run(
										() => write(`tasks/${task.id}?revision=${task.revision}`, 'DELETE'),
										onSaved,
									);
							}}
						>
							<Trash2 size={15} />
							Delete
						</button>
					)}
					<button type="button" onClick={onClose}>
						Cancel
					</button>
					<button className="primary" disabled={action.busy}>
						<Check size={16} />
						Save task
					</button>
				</div>
			</form>
		</Modal>
	);
}
function TaskTree({
	board,
	parentId,
	onOpen,
}: {
	board: Board;
	parentId: string;
	onOpen: (id: string) => void;
}) {
	return (
		<ul className="task-tree">
			{board.tasks
				.filter((task) => task.parentId === parentId)
				.map((task) => (
					<li key={task.id}>
						<button type="button" onClick={() => onOpen(task.id)}>
							{board.sections.find((item) => item.id === task.sectionId)?.kind === 'done' && (
								<Check size={13} />
							)}
							{task.title}
						</button>
						<TaskTree board={board} parentId={task.id} onOpen={onOpen} />
					</li>
				))}
		</ul>
	);
}
