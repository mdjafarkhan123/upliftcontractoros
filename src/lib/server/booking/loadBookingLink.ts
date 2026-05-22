import { error } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { bookingLinks, type BookingLink } from '$lib/server/db/schema';

export async function loadBookingLinkForOrg(orgId: string, id: string): Promise<BookingLink> {
	const [row] = await db
		.select()
		.from(bookingLinks)
		.where(and(eq(bookingLinks.id, id), isNull(bookingLinks.deleted_at)))
		.limit(1);

	if (!row || row.org_id !== orgId) error(404, 'Not found');
	return row;
}
