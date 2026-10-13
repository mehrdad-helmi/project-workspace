import {
	ArrowUpRight,
	CalendarDays,
	FileText,
	GitBranch,
	Network,
	Plus,
	CheckCircle2,
	ArrowRight,
	FolderOpen,
} from 'lucide-react';
import { progress, localDate, addDays } from '../shared/contracts';
import { useBoard, useDocuments, useEvents } from './api';
import { Empty, ErrorBox, GuardLink, Loading, Panel } from './ui';
import type { Preferences } from './calendar';

export function Hub({ preferences }: { preferences: Preferences }) {
	const board = useBoard();
	const documents = useDocuments();
	const events = useEvents();
	const today = localDate(new Date(), preferences.timezone);
	const tomorrow = addDays(today, 1);
	if (board.isPending || documents.isPending || events.isPending) return <Loading />;
	if (board.error || documents.error || events.error)
		return <ErrorBox error={board.error ?? documents.error ?? events.error} />;
	const data = board.data!;
	const files = documents.data!;
	const done = new Set(
		data.sections.filter((section) => section.kind === 'done').map((section) => section.id),
	);
	const active = new Set(
		data.sections.filter((section) => section.kind === 'active').map((section) => section.id),
	);
	const unfinished = data.tasks
		.filter((task) => !done.has(task.sectionId))
		.sort(
			(a, b) =>
				Number(active.has(b.sectionId)) - Number(active.has(a.sectionId)) ||
				b.updatedAt.localeCompare(a.updatedAt),
		);
	const conclusions = files
		.filter((file) => file.source === 'conclusions')
		.sort((a, b) => (b.approvedAt ?? b.updatedAt).localeCompare(a.approvedAt ?? a.updatedAt))
		.slice(0, 5);
	const recent = [...files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
	return (
		<div className="hub">
			<div className="view-heading">
				<div>
					<h1>Command Center</h1>
					<p className="muted">Your workspace, decisions, and next actions.</p>
				</div>
				<span className="mono hub-date">
					{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
						year: 'numeric',
						timeZone: 'UTC',
					})}
				</span>
			</div>
			<div className="telemetry-strip">
				<span>
					<span className="status-dot" />
					WORKSPACE CONNECTED
				</span>
				<span>{files.length} DOCUMENTS</span>
				<span>{data.jobs.length} JOBS</span>
				<span>{unfinished.length} OPEN TASKS</span>
				<span>{data.tasks.length - unfinished.length} COMPLETED</span>
			</div>
			<div className="hub-grid">
				<div className="hub-left">
					<Panel
						title="Jobs"
						actions={
							<GuardLink to="/jobs" aria-label="Open Jobs">
								<ArrowUpRight size={16} />
							</GuardLink>
						}
					>
						{data.jobs.length ? (
							data.jobs.map((item) => {
								const count = progress(data, item.id);
								return (
									<GuardLink key={item.id} className="job-summary" to={`/jobs?job=${item.id}`}>
										<div>
											<strong>{item.title}</strong>
											<ArrowRight size={14} />
										</div>
										<div className="progress-track">
											<span style={{ width: `${count.percent}%` }} />
										</div>
										<div className="mono">
											<span>
												{count.total ? `${count.remaining} / ${count.total} remaining` : 'No tasks'}
											</span>
											<span>{count.percent}%</span>
										</div>
									</GuardLink>
								);
							})
						) : (
							<Empty
								action={
									<GuardLink className="button" to="/jobs">
										<Plus size={15} />
										Create Job
									</GuardLink>
								}
							>
								Organize your first Job.
							</Empty>
						)}
					</Panel>
					<Panel title="Repository index">
						{(['workspace', 'frontend', 'backend'] as const).map((source) => (
							<GuardLink key={source} to={`/documents?source=${source}`} className="repository-row">
								<FolderOpen size={18} />
								<span>
									<strong>
										{source === 'workspace'
											? 'Workspace'
											: source === 'frontend'
												? 'Angular frontend'
												: 'NestJS backend'}
									</strong>
									<small className="mono">
										{files.filter((file) => file.source === source).length} MARKDOWN FILES
									</small>
								</span>
								<ArrowUpRight size={14} />
							</GuardLink>
						))}
						<GuardLink className="schema-launch" to="/schema">
							<Network size={18} />
							<span>Explore backend schema</span>
							<ArrowRight size={15} />
						</GuardLink>
					</Panel>
				</div>
				<div className="hub-center">
					<Panel
						title="Next actions"
						actions={<span className="badge mono">{unfinished.length} OPEN</span>}
					>
						{unfinished.length ? (
							<div className="action-list">
								{unfinished.slice(0, 10).map((task) => (
									<GuardLink key={task.id} to={`/jobs?job=${task.jobId}&task=${task.id}`}>
										<span
											className={`task-indicator ${active.has(task.sectionId) ? 'active' : ''}`}
										/>
										<div>
											<strong>{task.title}</strong>
											<small>
												{data.jobs.find((item) => item.id === task.jobId)?.title} /{' '}
												{data.sections.find((item) => item.id === task.sectionId)?.title}
												{task.parentId && ' · Subtask'}
											</small>
											{task.tags.length > 0 && (
												<span className="tags">
													{task.tags.slice(0, 3).map((tag) => (
														<span className="tag" key={tag}>
															{tag}
														</span>
													))}
												</span>
											)}
										</div>
										<ArrowUpRight size={15} />
									</GuardLink>
								))}
							</div>
						) : (
							<Empty
								action={
									<GuardLink className="button" to="/jobs">
										Open task board
									</GuardLink>
								}
							>
								<CheckCircle2 size={20} />
								No unfinished tasks.
							</Empty>
						)}
					</Panel>
					<Panel
						title="Approved conclusions"
						actions={
							<GuardLink to="/conclusions" aria-label="Open conclusions">
								<ArrowUpRight size={16} />
							</GuardLink>
						}
					>
						{conclusions.length ? (
							conclusions.map((file) => (
								<GuardLink
									className="conclusion-row"
									key={file.path}
									to={`/conclusions?source=conclusions&path=${encodeURIComponent(file.path)}`}
								>
									<FileText size={17} />
									<div>
										<strong>{file.title}</strong>
										<small className="mono">APPROVED {file.approvedAt}</small>
									</div>
									<ArrowUpRight size={14} />
								</GuardLink>
							))
						) : (
							<Empty>Decisions appear here after you ask to save an approved conclusion.</Empty>
						)}
					</Panel>
				</div>
				<div className="hub-right">
					<Panel
						title="Day notes"
						actions={
							<GuardLink to="/calendar" aria-label="Open calendar">
								<CalendarDays size={16} />
							</GuardLink>
						}
					>
						{[today, tomorrow].map((date, index) => {
							const entries = events.data!.filter((entry) => entry.date === date);
							return (
								<div className="day-agenda" key={date}>
									<div className="agenda-label mono">
										<span>{index === 0 ? 'TODAY' : 'TOMORROW'}</span>
										<span>{date.slice(5)}</span>
									</div>
									{entries.length ? (
										entries.map((entry) => (
											<GuardLink
												key={entry.id}
												to={`/calendar?date=${entry.date}&event=${entry.id}`}
												className="agenda-entry"
											>
												<span
													className="event-dot"
													style={{ background: preferences.colors[entry.color] }}
												/>
												<div>
													<strong>{entry.title}</strong>
													{entry.description && <p>{entry.description.slice(0, 110)}</p>}
												</div>
											</GuardLink>
										))
									) : (
										<p className="muted">No day notes.</p>
									)}
								</div>
							);
						})}
						<GuardLink className="panel-bottom-link" to={`/calendar?date=${today}`}>
							<Plus size={14} />
							Add a day note
						</GuardLink>
					</Panel>
					<Panel title="Recently updated">
						{recent.map((file) => (
							<GuardLink
								key={`${file.source}:${file.path}`}
								className="recent-file"
								to={`/${file.source === 'notes' || file.source === 'conclusions' ? file.source : 'documents'}?source=${file.source}&path=${encodeURIComponent(file.path)}`}
							>
								<strong>{file.title}</strong>
								<small className="mono">
									{file.source.toUpperCase()} ·{' '}
									{new Date(file.updatedAt).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										timeZone: preferences.timezone,
									})}
								</small>
							</GuardLink>
						))}
					</Panel>
				</div>
			</div>
			<div className="hub-footer mono">
				<GitBranch size={13} />
				LOCAL WORKSPACE · SHARED SERVER RULES · EXPLICIT SAVES
				<span>{preferences.timezone.toUpperCase()}</span>
			</div>
		</div>
	);
}
