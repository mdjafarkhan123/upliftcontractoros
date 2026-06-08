import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Minimal state the onboarding wizard needs to drive its dynamic step list.
// `sms_enabled` is intentionally not part of the /api/session safe fields, so
// the wizard reads it here.
export const GET: RequestHandler = async (event) => {
	const auth = event.locals.auth;
	if (!auth) return json({ error: 'Unauthorized.' }, { status: 401 });

	const org = auth.org;

	return json({
		data: {
			status: auth.orgStatus,
			sms_enabled: org.sms_enabled,
			password_changed: Boolean(auth.supabaseUser.app_metadata.password_changed),
			// Step 2 (Business Profile) prefill + resume signal. `country` is the
			// only required field that starts null, so it marks the step complete.
			business_profile_complete: org.country != null,
			// Step 3 (Phone Setup) resume signal. A number means the step is done
			// (or was skipped-then-completed); the wizard skips the phone phase.
			has_number: org.twilio_phone_number != null,
			phone_number: org.twilio_phone_number,
			// Step 4 (Carrier Approval) prefill + resume signal. Only US/CA orgs with
			// a number see this skippable step. "Complete" means the required fields
			// for the country are filled (US: legal name + EIN + website + use case;
			// CA: business name + Business Number).
			carrier_complete:
				org.country === 'US'
					? Boolean(org.legal_business_name && org.ein && org.website && org.messaging_use_case)
					: org.country === 'CA'
						? Boolean(org.legal_business_name && org.business_number)
						: false,
			carrier: {
				legal_business_name: org.legal_business_name,
				ein: org.ein,
				business_number: org.business_number,
				website: org.website,
				messaging_use_case: org.messaging_use_case
			},
			profile: {
				name: org.name,
				trade_type: org.trade_type,
				country: org.country,
				timezone: org.timezone,
				address: org.address,
				city: org.city,
				state: org.state,
				zip: org.zip
			},
			// Step 5 (Branding) prefill. Branding is the terminal, skippable step,
			// so there is no separate "complete" signal — the wizard always lands
			// here once the prior steps are done.
			branding: {
				primary_color: org.primary_color,
				calendar_day_start_hour: org.calendar_day_start_hour,
				calendar_day_end_hour: org.calendar_day_end_hour
			}
		}
	});
};
