import { useEffect, useState } from 'react';
import { localDate } from '../shared/contracts';

export function useToday(timezone: string) {
	const [today, setToday] = useState(() => localDate(new Date(), timezone));
	useEffect(() => {
		const update = () => setToday(localDate(new Date(), timezone));
		update();
		// Keep day-based labels current overnight and when returning to a suspended tab.
		let timer: ReturnType<typeof setTimeout>;
		const tick = () => {
			update();
			timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
		};
		timer = setTimeout(tick, 60_000 - (Date.now() % 60_000));
		window.addEventListener('focus', update);
		document.addEventListener('visibilitychange', update);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('focus', update);
			document.removeEventListener('visibilitychange', update);
		};
	}, [timezone]);
	return today;
}
