export const ssr = false;

export const load = ({ url }: { url: URL }) => ({
	fromQuoteId: url.searchParams.get('from_quote') ?? null
});
