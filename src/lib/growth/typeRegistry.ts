// Single source of truth for growth_feed_items.type → UI presentation.
// Do not scatter these mappings across components.

export type GrowthFeedType =
	| 'gbp_post'
	| 'seo'
	| 'social'
	| 'website'
	| 'blog'
	| 'review_response'
	| 'monthly_summary';

export type GrowthBadgeTone = 'blue' | 'green' | 'purple' | 'amber' | 'pink' | 'teal' | 'slate';

export type GrowthTypeMeta = {
	label: string;
	icon: string; // lucide icon name
	tone: GrowthBadgeTone;
};

export const GROWTH_TYPE_REGISTRY: Record<GrowthFeedType, GrowthTypeMeta> = {
	gbp_post: { label: 'Google Business', icon: 'MapPin', tone: 'blue' },
	seo: { label: 'SEO', icon: 'Search', tone: 'green' },
	social: { label: 'Social', icon: 'Share2', tone: 'pink' },
	website: { label: 'Website', icon: 'Globe', tone: 'teal' },
	blog: { label: 'Blog', icon: 'FileText', tone: 'amber' },
	review_response: { label: 'Review Response', icon: 'MessageSquare', tone: 'purple' },
	monthly_summary: { label: 'Monthly Summary', icon: 'Sparkles', tone: 'slate' }
};

export function getGrowthTypeMeta(type: string): GrowthTypeMeta {
	if (type in GROWTH_TYPE_REGISTRY) {
		return GROWTH_TYPE_REGISTRY[type as GrowthFeedType];
	}
	return { label: type, icon: 'Sparkles', tone: 'slate' };
}
