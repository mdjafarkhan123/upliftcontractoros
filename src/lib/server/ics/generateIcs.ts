// RFC 5545 .ics builder. Used to attach an "Add to Calendar" file to booking
// confirmation emails. No external dependency.
//
// The output is a single VEVENT with UTC timestamps, which Gmail / Outlook /
// Apple Calendar all parse into a one-click "Add to calendar" affordance.

const PROD_ID = '-//Contractor Growth OS//Appointments//EN';

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function toIcsUtc(d: Date): string {
	return (
		`${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
		`T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
	);
}

// RFC 5545 §3.3.11: escape backslash, semicolon, comma; CR/LF → \n.
function escapeText(s: string): string {
	return s
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n|\r|\n/g, '\\n');
}

// RFC 5545 §3.1: lines must be ≤ 75 octets; longer values are split across
// CRLF + leading space.
function foldLine(line: string): string {
	if (line.length <= 75) return line;
	const out: string[] = [];
	let i = 0;
	while (i < line.length) {
		const end = Math.min(i + (i === 0 ? 75 : 74), line.length);
		out.push((i === 0 ? '' : ' ') + line.slice(i, end));
		i = end;
	}
	return out.join('\r\n');
}

export type IcsInput = {
	uid: string;
	start: Date;
	end: Date;
	summary: string;
	description?: string;
	location?: string;
	organizerName?: string;
	organizerEmail?: string;
	customerName?: string;
	customerEmail?: string;
};

export function generateIcs(input: IcsInput): {
	filename: string;
	content: Buffer;
	contentType: string;
} {
	const dtstamp = toIcsUtc(new Date());
	const dtstart = toIcsUtc(input.start);
	const dtend = toIcsUtc(input.end);

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		`PRODID:${PROD_ID}`,
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escapeText(input.uid)}`,
		`DTSTAMP:${dtstamp}`,
		`DTSTART:${dtstart}`,
		`DTEND:${dtend}`,
		`SUMMARY:${escapeText(input.summary)}`
	];

	if (input.description) lines.push(`DESCRIPTION:${escapeText(input.description)}`);
	if (input.location) lines.push(`LOCATION:${escapeText(input.location)}`);
	if (input.organizerEmail) {
		const cn = input.organizerName ? `;CN=${escapeText(input.organizerName)}` : '';
		lines.push(`ORGANIZER${cn}:mailto:${input.organizerEmail}`);
	}
	if (input.customerEmail) {
		const cn = input.customerName ? `;CN=${escapeText(input.customerName)}` : '';
		lines.push(
			`ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${input.customerEmail}`
		);
	}

	lines.push('STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR');

	const body = lines.map(foldLine).join('\r\n') + '\r\n';

	return {
		filename: 'appointment.ics',
		content: Buffer.from(body, 'utf8'),
		contentType: 'text/calendar; charset=utf-8; method=PUBLISH'
	};
}
