import { redirect } from '@sveltejs/kit';
import { createOrgSchema, createOrganizationWithAdmin } from '$lib/server/admin/orgProvisioning';
import type { RequestHandler } from './$types';

function formError(message: string): never {
	throw redirect(303, `/jafar/orgs/new?error=${encodeURIComponent(message)}`);
}

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const parsed = createOrgSchema.safeParse({
		businessName: formData.get('businessName'),
		slug: formData.get('slug'),
		tradeType: formData.get('tradeType'),
		city: formData.get('city'),
		state: formData.get('state'),
		timezone: formData.get('timezone'),
		twilioPhoneNumber: formData.get('twilioPhoneNumber'),
		adminFullName: formData.get('adminFullName'),
		adminEmail: formData.get('adminEmail'),
		adminTemporaryPassword: formData.get('adminTemporaryPassword')
	});

	if (!parsed.success) {
		return formError(parsed.error.issues[0]?.message ?? 'Invalid form data.');
	}

	try {
		const { orgId } = await createOrganizationWithAdmin(parsed.data);
		throw redirect(303, `/jafar/orgs/${orgId}`);
	} catch (error) {
		return formError(error instanceof Error ? error.message : 'Organization creation failed.');
	}
};
