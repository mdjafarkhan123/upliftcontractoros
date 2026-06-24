// Monday-start week utilities. All inputs/outputs in local time.

export function startOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
}

export function endOfDay(d: Date): Date {
	const x = new Date(d);
	x.setHours(23, 59, 59, 999);
	return x;
}

export function startOfWeekMonday(d: Date): Date {
	const x = startOfDay(d);
	const day = x.getDay(); // 0 = Sun
	const diff = day === 0 ? -6 : 1 - day;
	x.setDate(x.getDate() + diff);
	return x;
}

export function addDays(d: Date, n: number): Date {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
}

export function startOfMonth(d: Date): Date {
	const x = startOfDay(d);
	x.setDate(1);
	return x;
}

export function addMonths(d: Date, n: number): Date {
	const x = startOfDay(d);
	const day = x.getDate();
	x.setDate(1);
	x.setMonth(x.getMonth() + n);
	const daysInMonth = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
	x.setDate(Math.min(day, daysInMonth));
	return x;
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function dayKey(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDayLabel(d: Date): string {
	return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(d: Date | string): string {
	const x = typeof d === 'string' ? new Date(d) : d;
	return x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function dateTimeLocalValue(iso: string | Date | null): string {
	if (!iso) return '';
	const d = typeof iso === 'string' ? new Date(iso) : iso;
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
