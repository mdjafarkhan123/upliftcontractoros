export const load = async ({ fetch, params }) => {
	const res = await fetch(`/api/admin/orgs/${params.id}`);
	if (!res.ok) throw new Error('Failed to load organization.');
	return await res.json();
};
