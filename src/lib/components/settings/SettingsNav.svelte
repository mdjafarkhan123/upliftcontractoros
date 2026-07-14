<script lang="ts">
	import { page } from '$app/state';

	let {
		role,
		featureAutomation,
		featureOnlineBooking,
		canManagePipeline,
		canViewCatalog,
		canManageJobForms,
		canManageJobCustomFields
	}: {
		role: 'admin' | 'manager' | 'member';
		featureAutomation: boolean;
		featureOnlineBooking: boolean;
		canManagePipeline: boolean;
		canViewCatalog: boolean;
		canManageJobForms: boolean;
		canManageJobCustomFields: boolean;
	} = $props();

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		return path === href || path.startsWith(href + '/');
	}

	type Item = {
		href: string;
		label: string;
		description: string;
		icon: string;
		locked: boolean;
		lockedReason?: string;
		accent: string;
	};

	let orgItems: Item[] = $derived([
		{
			href: '/settings/org',
			label: 'Business',
			description: 'Name, address, brand colors, logo',
			icon: 'ri-building-line',
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			accent: 'brand'
		},
		{
			href: '/settings/automation',
			label: 'Automation',
			description: 'Auto-replies, follow-ups, reminders',
			icon: 'ri-robot-2-line',
			locked: role !== 'admin' || !featureAutomation,
			lockedReason:
				role !== 'admin' ? 'Admin only' : !featureAutomation ? 'Not on your plan' : undefined,
			accent: 'violet'
		},
		{
			href: '/settings/email',
			label: 'Email',
			description: 'Your branded sending address',
			icon: 'ri-mail-line',
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			accent: 'rose'
		},
		{
			href: '/settings/integrations',
			label: 'Integrations',
			description: 'Messenger, payments, and more',
			icon: 'ri-apps-2-line',
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			accent: 'blue'
		},
		{
			href: '/settings/booking',
			label: 'Booking',
			description: 'Self-booking links and availability',
			icon: 'ri-calendar-schedule-line',
			locked: role !== 'admin' || !featureOnlineBooking,
			lockedReason:
				role !== 'admin' ? 'Admin only' : !featureOnlineBooking ? 'Not on your plan' : undefined,
			accent: 'amber'
		},
		{
			href: '/settings/team',
			label: 'Team',
			description: 'Members, roles, and permissions',
			icon: 'ri-team-line',
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			accent: 'brand'
		},
		{
			href: '/settings/sms-credit',
			label: 'SMS Credits',
			description: 'Text balance, usage, and activity',
			icon: 'ri-message-2-line',
			locked: role !== 'admin',
			lockedReason: role !== 'admin' ? 'Admin only' : undefined,
			accent: 'sky'
		},
		{
			href: '/settings/stages',
			label: 'Pipeline Stages',
			description: 'Customize your pipeline columns',
			icon: 'ri-layout-column-line',
			locked: !canManagePipeline,
			lockedReason: !canManagePipeline ? 'No access' : undefined,
			accent: 'indigo'
		},
		{
			href: '/settings/quick-replies',
			label: 'Quick Replies',
			description: 'Saved message templates for your inbox',
			icon: 'ri-flashlight-line',
			locked: false,
			accent: 'yellow'
		},
		{
			href: '/settings/catalog',
			label: 'Price Book',
			description: 'Reusable products, services, and pricing',
			icon: 'ri-book-2-line',
			locked: !canViewCatalog,
			lockedReason: !canViewCatalog ? 'No access' : undefined,
			accent: 'teal'
		},
		{
			href: '/settings/job-forms',
			label: 'Job Forms',
			description: 'Checklists & inspection forms for the field',
			icon: 'ri-survey-line',
			locked: !canManageJobForms,
			lockedReason: !canManageJobForms ? 'No access' : undefined,
			accent: 'green'
		},
		{
			href: '/settings/job-custom-fields',
			label: 'Job Custom Fields',
			description: 'Extra fields shown on every job',
			icon: 'ri-list-settings-line',
			locked: !canManageJobCustomFields,
			lockedReason: !canManageJobCustomFields ? 'No access' : undefined,
			accent: 'indigo'
		}
	]);

	let personalItems: Item[] = $derived([
		{
			href: '/settings/account',
			label: 'Account',
			description: 'Your name, email, and password',
			icon: 'ri-account-circle-line',
			locked: false,
			accent: 'slate'
		},
		{
			href: '/settings/notifications',
			label: 'Notifications',
			description: 'Choose what buzzes your phone',
			icon: 'ri-notification-3-line',
			locked: false,
			accent: 'amber'
		}
	]);
</script>

<div class="settings-nav">
	<div class="settings-nav__group">
		<p class="settings-nav__group-label">Organization</p>
		<div class="settings-nav__grid">
			{#each orgItems as item (item.href)}
				{@render navItem(item)}
			{/each}
		</div>
	</div>

	<div class="settings-nav__group">
		<p class="settings-nav__group-label">Personal</p>
		<div class="settings-nav__grid">
			{#each personalItems as item (item.href)}
				{@render navItem(item)}
			{/each}
		</div>
	</div>
</div>

{#snippet navItem(item: Item)}
	{#if item.locked}
		<div class="settings-nav__item settings-nav__item--locked" aria-disabled="true">
			<span class="settings-nav__icon settings-nav__icon--{item.accent}">
				<i class={item.icon} aria-hidden="true"></i>
			</span>
			<div class="settings-nav__body">
				<p class="settings-nav__label">{item.label}</p>
				<span class="settings-nav__lock">
					<i class="ri-lock-line" aria-hidden="true"></i>
					{item.lockedReason}
				</span>
			</div>
		</div>
	{:else}
		<a
			href={item.href}
			class="settings-nav__item"
			class:settings-nav__item--active={isActive(item.href)}
		>
			<span class="settings-nav__icon settings-nav__icon--{item.accent}">
				<i class={item.icon} aria-hidden="true"></i>
			</span>
			<div class="settings-nav__body">
				<p class="settings-nav__label">{item.label}</p>
				<p class="settings-nav__desc">{item.description}</p>
			</div>
			<i class="settings-nav__chevron ri-arrow-right-s-line" aria-hidden="true"></i>
		</a>
	{/if}
{/snippet}
