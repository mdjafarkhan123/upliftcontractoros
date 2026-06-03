// Shared types for the booking availability engine.
// Engine is stateless and uncached — see index.ts.

export type IsoDate = string; // YYYY-MM-DD
export type IsoMonth = string; // YYYY-MM

export interface TimeWindow {
	start_time: string; // HH:mm or HH:mm:ss
	end_time: string;
}

export type ResolvedAvailability = { blocked: true } | { blocked: false; windows: TimeWindow[] };

export interface SlotEngineConfig {
	slot_duration_minutes: number;
	buffer_minutes: number;
	min_advance_hours: number;
	max_future_days: number;
}

export class BookingValidationError extends Error {
	field?: string;
	constructor(message: string, field?: string) {
		super(message);
		this.name = 'BookingValidationError';
		this.field = field;
	}
}
