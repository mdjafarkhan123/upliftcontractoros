export type NotificationItem = {
	id: string;
	org_id: string;
	member_id: string;
	type: string;
	title: string;
	body: string | null;
	resource_type: string | null;
	resource_id: string | null;
	read_at: string | null;
	created_at: string;
};

export function getNotificationHref(n: NotificationItem): string | null {
	const id = n.resource_id;
	switch (n.type) {
		case 'opportunity.won':
		case 'job.created':
			return id ? `/jobs/${id}` : null;
		case 'invoice.paid':
			return id ? `/invoices/${id}` : null;
		case 'quote.viewed':
		case 'quote.accepted':
		case 'quote.changes_requested':
		case 'quote.deposit_paid':
			return id ? `/quotes/${id}` : null;
		case 'review.received':
		case 'private_feedback.received':
			return '/reputation';
		case 'message.received':
		case 'call.missed':
			return id ? `/inbox/${id}` : null;
		case 'contact_follow_up_due':
			return id ? `/contacts/${id}` : null;
		case 'opportunity_follow_up_due':
			return id ? `/pipeline?deal=${id}` : null;
		case 'opportunity_stale_digest':
			return '/pipeline';
		case 'contact_import_completed':
			return '/contacts';
		case 'appointment_booked':
			return id ? `/appointments/${id}` : null;
		default:
			return null;
	}
}
