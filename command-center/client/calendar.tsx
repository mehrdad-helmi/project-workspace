import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { addDays, localDate, dateSchema, type CalendarEvent } from '../shared/contracts';
import { useEvents, useRefresh, write } from './api';
import { Empty, ErrorBox, Field, Loading, Modal, submit, useAction, useFeedback } from './ui';
import { Markdown } from './markdown';

export interface Preferences {
	timezone: string;
	colors: string[];
	weekStartsOn: number;
	weekends: number[];
	uploadLimit: number;
}
export function CalendarPage({ preferences }: { preferences: Preferences }) {
	const [params, setParams] = useSearchParams();
	const today = localDate(new Date(), preferences.timezone);
	const candidateDate = params.get('date');
	const date = candidateDate && dateSchema.safeParse(candidateDate).success ? candidateDate : today;
	const [newDate, setNewDate] = useState<string | null>(null);
	const query = useEvents();
	const refresh = useRefresh();
	const monthDate = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
	const monthStart = monthDate.toISOString().slice(0, 10);
	const offset = (monthDate.getUTCDay() - preferences.weekStartsOn + 7) % 7;
	const nextMonth = new Date(monthDate);
	nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
	const daysInMonth = new Date(nextMonth.valueOf() - 86400000).getUTCDate();
	const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
	const cells = Array.from({ length: totalCells }, (_, index) =>
		addDays(monthStart, index - offset),
	);
	const weekdays = Array.from({ length: 7 }, (_, index) => (preferences.weekStartsOn + index) % 7);
	const selected = query.data?.find((event) => event.id === params.get('event'));
	const navigateMonth = (delta: number) => {
		const value = new Date(monthDate);
		value.setUTCMonth(value.getUTCMonth() + delta);
		setParams({ date: value.toISOString().slice(0, 10) });
	};
	if (query.isPending) return <Loading />;
	if (query.error) return <ErrorBox error={query.error} />;
	return (
		<div>
			<div className="view-heading">
				<div>
					<h1>Calendar</h1>
					<p className="muted">Day notes · Gregorian · {preferences.timezone}</p>
				</div>
				<button className="primary" onClick={() => setNewDate(date)}>
					<Plus size={16} />
					Add day note
				</button>
			</div>
			<div className="calendar-toolbar">
				<h2>
					{monthDate.toLocaleDateString('en-US', {
						month: 'long',
						year: 'numeric',
						timeZone: 'UTC',
					})}
				</h2>
				<div className="toolbar">
					<button aria-label="Previous month" onClick={() => navigateMonth(-1)}>
						<ChevronLeft size={18} />
					</button>
					<button onClick={() => setParams({ date: today })}>Today</button>
					<button aria-label="Next month" onClick={() => navigateMonth(1)}>
						<ChevronRight size={18} />
					</button>
				</div>
			</div>
			<div className="calendar-grid">
				{weekdays.map((day) => (
					<div
						className={`weekday mono ${preferences.weekends.includes(day) ? 'weekend' : ''}`}
						key={day}
					>
						{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]}
					</div>
				))}
				{cells.map((day) => {
					const dayEvents = query.data!.filter((event) => event.date === day);
					const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
					return (
						<div
							className={`calendar-day ${day.slice(0, 7) !== monthStart.slice(0, 7) ? 'outside' : ''} ${day === today ? 'today' : ''} ${preferences.weekends.includes(weekday) ? 'weekend' : ''}`}
							key={day}
						>
							<button
								className="day-number mono"
								aria-label={`Add note on ${day}`}
								onClick={() => setNewDate(day)}
							>
								{Number(day.slice(-2))}
								{day === today && <span>Today</span>}
								<Plus size={13} />
							</button>
							{dayEvents.map((event) => (
								<button
									className="calendar-event"
									style={
										{ '--event-color': preferences.colors[event.color] } as React.CSSProperties
									}
									key={event.id}
									onClick={() => setParams({ date: day, event: event.id })}
								>
									<span className="event-dot" />
									<span>{event.title}</span>
								</button>
							))}
						</div>
					);
				})}
			</div>
			{query.data!.length === 0 && (
				<p className="muted calendar-hint">
					Click a day to record a milestone, decision, or reminder. Entries stay here without
					notifications.
				</p>
			)}
			{(selected || newDate) && (
				<EventForm
					key={selected?.id ?? newDate}
					event={selected}
					date={newDate ?? date}
					preferences={preferences}
					onClose={() => {
						setNewDate(null);
						setParams({ date });
					}}
					onSaved={() => {
						setNewDate(null);
						setParams({ date });
						void refresh();
					}}
				/>
			)}
		</div>
	);
}
function EventForm({
	event,
	date,
	preferences,
	onClose,
	onSaved,
}: {
	event?: CalendarEvent;
	date: string;
	preferences: Preferences;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [title, setTitle] = useState(event?.title ?? '');
	const [description, setDescription] = useState(event?.description ?? '');
	const [selectedDate, setSelectedDate] = useState(event?.date ?? date);
	const [color, setColor] = useState(event?.color ?? 0);
	const [preview, setPreview] = useState(false);
	const action = useAction();
	const { confirm } = useFeedback();
	return (
		<Modal title={event ? 'Edit day note' : 'New day note'} onClose={onClose}>
			<form
				onSubmit={submit(
					() =>
						void action.run(
							() =>
								write(event ? `events/${event.id}` : 'events', event ? 'PATCH' : 'POST', {
									title,
									description,
									date: selectedDate,
									color,
									...(event ? { revision: event.revision } : {}),
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
				<Field label="Date">
					<input
						type="date"
						required
						value={selectedDate}
						onChange={(event) => setSelectedDate(event.target.value)}
					/>
				</Field>
				<Field label="Description · Markdown">
					<textarea
						rows={6}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
				</Field>
				<button type="button" onClick={() => setPreview(!preview)}>
					Toggle preview
				</button>
				{preview && <Markdown content={description} />}
				<fieldset className="color-field">
					<legend>Color</legend>
					<div className="color-picker">
						{preferences.colors.map((value, index) => (
							<button
								key={value}
								type="button"
								aria-label={`Color ${index + 1}`}
								aria-pressed={color === index}
								className={color === index ? 'selected' : ''}
								style={{ background: value }}
								onClick={() => setColor(index)}
							/>
						))}
					</div>
				</fieldset>
				<div className="form-actions">
					{event && (
						<button
							type="button"
							className="danger"
							onClick={async () => {
								if (await confirm(`Move “${event.title}” to recovery?`))
									void action.run(
										() => write(`events/${event.id}?revision=${event.revision}`, 'DELETE'),
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
						Save day note
					</button>
				</div>
			</form>
		</Modal>
	);
}
