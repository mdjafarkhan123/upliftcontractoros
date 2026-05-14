import type { OrgMember } from '$lib/server/db/schema';

export function canViewReviews(m: OrgMember): boolean {
	return m.can_view_reviews === true;
}

export function canSendReviewRequests(m: OrgMember): boolean {
	return m.can_send_review_requests === true;
}

export function canViewNegativeFeedback(m: OrgMember): boolean {
	return m.can_view_negative_feedback === true;
}
