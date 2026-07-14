<script lang="ts">
	import Badge from '$lib/components/shared/Badge.svelte';
	import EditPencil from '$lib/components/shared/EditPencil.svelte';
	import { Button } from '$lib/components/ui/button';
	import ContactAvatar from './ContactAvatar.svelte';
	import ContactAvatarUploader from './ContactAvatarUploader.svelte';
	import { formatPhoneDisplay } from '$lib/utils/phone';
	import { TEMPERATURE_META, type LeadTemperature } from '$lib/contacts/temperature';
	import { PHONE_LABEL_DISPLAY, type PhoneLabel } from '$lib/contacts/phoneLabel';
	import { leadSourceLabel } from '$lib/contacts/leadSource';
	import type { InlineEditController } from '$lib/components/shared/inlineEditController.svelte';

	let {
		contact_id,
		full_name,
		company_name = null,
		avatar_url = null,
		phone,
		alt_phone = null,
		alt_phone_label = null,
		email,
		status,
		assignee_name,
		referrer,
		lead_source = null,
		lead_temperature = null,
		next_follow_up_at = null,
		do_not_contact = false,
		canEdit,
		canDelete,
		canMerge = false,
		archiveBusy = false,
		onBack,
		onEdit,
		onDelete,
		onMerge,
		onArchive,
		onUnarchive,
		onAvatarChange,
		onSaveName,
		editCtl
	}: {
		contact_id: string;
		full_name: string;
		company_name?: string | null;
		avatar_url?: string | null;
		phone: string | null;
		alt_phone?: string | null;
		alt_phone_label?: PhoneLabel | null;
		email: string | null;
		status: 'lead' | 'customer' | 'archived';
		assignee_name?: string | null;
		referrer?: { id: string; name: string } | null;
		lead_source?: string | null;
		lead_temperature?: LeadTemperature | null;
		next_follow_up_at?: string | null;
		do_not_contact?: boolean;
		canEdit: boolean;
		canDelete: boolean;
		canMerge?: boolean;
		archiveBusy?: boolean;
		onBack: () => void;
		onEdit?: () => void;
		onDelete: () => void;
		onMerge?: () => void;
		onArchive?: () => void;
		onUnarchive?: () => void;
		onAvatarChange?: (result: { avatar_url: string | null; updated_at: string }) => void;
		onSaveName?: (name: string) => Promise<string | null>;
		editCtl: InlineEditController;
	} = $props();

	// Inline name edit — click the pencil to swap the heading for an input. Editing
	// is coordinated by the shared page-level controller so the ONE Save/Cancel bar
	// (rendered in this topbar) serves the name and every details-panel field alike.
	let nameDraft = $state('');

	function enterNameEdit() {
		if (!onSaveName) return;
		editCtl.begin(
			'name',
			() => (nameDraft = full_name),
			() => onSaveName(nameDraft)
		);
	}
	function onNameKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			void editCtl.commit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			editCtl.cancel();
		}
	}

	const statusVariant = $derived(
		status === 'customer' ? 'success' : status === 'archived' ? 'warning' : 'info'
	);
	const statusLabel = $derived(
		status === 'customer' ? 'Customer' : status === 'archived' ? 'Archived' : 'Lead'
	);
	const isDue = $derived(
		next_follow_up_at !== null && new Date(next_follow_up_at).getTime() <= Date.now()
	);
	const temp = $derived(lead_temperature ? TEMPERATURE_META[lead_temperature] : null);
	// "Manual" carries no marketing signal (staff typed the contact in), so we hide
	// it — the chip is only worth showing when it tells you where a lead came from.
	const sourceLabel = $derived(
		lead_source && lead_source !== 'manual' ? leadSourceLabel(lead_source) : null
	);
</script>

<header class="contact-header">
	<!-- Top bar: back + actions -->
	<div class="contact-header__topbar">
		<button type="button" class="contact-header__back" onclick={onBack}>
			<i class="ri-arrow-left-line" aria-hidden="true"></i>
			<span>Back</span>
		</button>

		{#if editCtl.editing}
			<!-- The ONE Save/Cancel for the whole page — name or any details field -->
			<div class="contact-header__savebar">
				{#if editCtl.error}
					<p class="field__error contact-header__savebar-error">{editCtl.error}</p>
				{/if}
				<Button
					type="button"
					variant="default"
					size="sm"
					loading={editCtl.saving}
					loadingLabel="Saving"
					onclick={() => editCtl.commit()}
				>
					Save
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={editCtl.saving}
					onclick={() => editCtl.cancel()}
				>
					Cancel
				</Button>
			</div>
		{:else}
			<div class="contact-header__actions">
				{#if canEdit && onEdit}
					<button
						type="button"
						class="contact-header__action"
						aria-label="Edit contact"
						onclick={onEdit}
					>
						<i class="ri-pencil-line" aria-hidden="true"></i>
					</button>
				{/if}
				{#if canMerge}
					<button
						type="button"
						class="contact-header__action"
						aria-label="Merge duplicate"
						onclick={onMerge}
					>
						<i class="ri-git-merge-line" aria-hidden="true"></i>
					</button>
				{/if}
				{#if canEdit && status === 'archived' && onUnarchive}
					<button
						type="button"
						class="contact-header__action"
						aria-label="Unarchive contact"
						disabled={archiveBusy}
						onclick={onUnarchive}
					>
						<i class="ri-inbox-unarchive-line" aria-hidden="true"></i>
					</button>
				{:else if canEdit && status !== 'archived' && onArchive}
					<button
						type="button"
						class="contact-header__action"
						aria-label="Archive contact"
						disabled={archiveBusy}
						onclick={onArchive}
					>
						<i class="ri-archive-line" aria-hidden="true"></i>
					</button>
				{/if}
				{#if canDelete}
					<button
						type="button"
						class="contact-header__action contact-header__action--danger"
						aria-label="Delete contact"
						onclick={onDelete}
					>
						<i class="ri-delete-bin-line" aria-hidden="true"></i>
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Identity block -->
	<div class="contact-header__identity">
		<!-- Avatar with status ring — click to change when editable (GHL-style) -->
		{#if canEdit && onAvatarChange}
			<ContactAvatarUploader
				contactId={contact_id}
				name={full_name}
				src={avatar_url}
				{status}
				size={64}
				onChange={onAvatarChange}
			/>
		{:else}
			<ContactAvatar name={full_name} src={avatar_url} {status} size={64} />
		{/if}

		<div class="contact-header__identity-body">
			<!-- Name + badges -->
			<div class="contact-header__name-row">
				{#if editCtl.isEditing('name')}
					<div class="contact-header__name-edit">
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="field__input contact-header__name-input"
							type="text"
							bind:value={nameDraft}
							onkeydown={onNameKeydown}
							autofocus
						/>
					</div>
				{:else}
					<h1 class="contact-header__name">{full_name}</h1>
					{#if canEdit && onSaveName}
						<EditPencil onclick={enterNameEdit} ariaLabel="Edit name" size="sm" fade />
					{/if}
				{/if}
				<Badge variant={statusVariant} label={statusLabel} />
				{#if temp}
					<span class="temp-chip temp-chip--{lead_temperature}">
						<span class="temp-chip__dot"></span>
						{temp.label}
					</span>
				{/if}
				{#if do_not_contact}
					<span class="contact-header__flag contact-header__flag--dnc">
						<i class="ri-forbid-line" aria-hidden="true"></i>
						Do Not Contact
					</span>
				{/if}
				{#if isDue}
					<span class="contact-header__flag contact-header__flag--due">
						<i class="ri-fire-line" aria-hidden="true"></i>
						Due
					</span>
				{/if}
			</div>
			{#if company_name}
				<p class="contact-header__company">{company_name}</p>
			{/if}

			<!-- Assignee + referrer row -->
			<div class="contact-header__meta">
				{#if assignee_name}
					<p>
						<span class="contact-header__meta-faint">Assigned to</span>
						<span class="contact-header__meta-strong">{assignee_name}</span>
					</p>
				{:else}
					<p class="contact-header__meta-unassigned">Unassigned</p>
				{/if}
				{#if referrer}
					<a href={`/contacts/${referrer.id}`} class="contact-header__ref">
						<i class="ri-user-add-line" aria-hidden="true"></i>
						Ref: {referrer.name}
					</a>
				{/if}
				{#if sourceLabel}
					<span class="contact-header__source">
						<i class="ri-broadcast-line" aria-hidden="true"></i>
						<span class="contact-header__meta-faint">Source</span>
						<span class="contact-header__meta-strong">{sourceLabel}</span>
					</span>
				{/if}
			</div>
		</div>
	</div>
</header>
