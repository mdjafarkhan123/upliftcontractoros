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
			return id ? `/quotes/${id}` : null;
		case 'review.received':
		case 'private_feedback.received':
			return '/reputation';
		case 'message.received':
		case 'call.missed':
			return id ? `/inbox/${id}` : null;
		case 'appointment_booked':
			return id ? `/appointments/${id}` : null;
		default:
			return null;
	}
}
