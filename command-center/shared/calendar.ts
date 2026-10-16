/** Date-only Gregorian duration; UTC arithmetic avoids timezone and DST rounding. */
export function formatCountdown(date: string, today: string) {
	if (date < today) return 'Passed';
	if (date === today) return 'Today';
	const start = new Date(`${today}T12:00:00Z`);
	const end = new Date(`${date}T12:00:00Z`);
	let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12;
	months += end.getUTCMonth() - start.getUTCMonth();
	const anchorAt = (offset: number) => {
		const anchor = new Date(start);
		anchor.setUTCDate(1);
		anchor.setUTCMonth(anchor.getUTCMonth() + offset);
		const lastDay = new Date(anchor);
		lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
		anchor.setUTCDate(Math.min(start.getUTCDate(), lastDay.getUTCDate()));
		return anchor;
	};
	if (anchorAt(months) > end) months--;
	const days = Math.round((end.valueOf() - anchorAt(months).valueOf()) / 86_400_000);
	return (
		[
			[Math.floor(months / 12), 'year'],
			[months % 12, 'month'],
			[days, 'day'],
		]
			.filter(([amount]) => amount !== 0)
			.map(([amount, unit]) => `${amount} ${unit}${amount === 1 ? '' : 's'}`)
			.join(', ') + ' left'
	);
}
