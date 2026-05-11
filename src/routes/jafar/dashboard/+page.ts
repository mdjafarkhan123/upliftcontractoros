export const load = async ({ fetch }) => {
	const res = await fetch('/api/admin/orgs');
	if (!res.ok) throw new Error('Failed to load admin dashboard.');
	return await res.json();
};
