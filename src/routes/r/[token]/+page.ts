import type { PageLoad } from './$types';

export const ssr = false;
export const prerender = false;

export type FunnelInitialState =
	| { state: 'not_found' }
	| { state: 'expired' }
	| {
			state: 'ready';
			org_name: string;
			contact_first_name: string;
	  }
	| {
			state: 'already_submitted';
			org_name: string;
			contact_first_name: string;
			submitted_score: number | null;
			google_review_link: string | null;
	  };

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/r/${params.token}`);
	if (res.status === 404) {
		return { initial: { state: 'not_found' } as FunnelInitialState, token: params.token };
	}
	if (!res.ok) {
		return { initial: { state: 'not_found' } as FunnelInitialState, token: params.token };
	}
	const body = (await res.json()) as { data: FunnelInitialState };
	return { initial: body.data, token: params.token };
};
