export const load = ({ url }) => {
	return {
		errorMessage: url.searchParams.get('error')
	};
};
