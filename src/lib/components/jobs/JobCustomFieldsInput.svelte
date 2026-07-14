<script lang="ts">
	import { onMount } from 'svelte';
	import type { JobCustomFieldDef, JobCustomFieldValuePayload } from '$lib/types/jobs';

	// Renders the org's custom fields on the New Job form. Holds its own draft and exposes the
	// built value payload via `bind:values`. `errors` (keyed by field id) highlights required
	// fields the server bounced. Renders nothing until at least one field is defined.
	let {
		values = $bindable([]),
		errors = {}
	}: {
		values: JobCustomFieldValuePayload[];
		errors?: Record<string, string>;
	} = $props();

	let defs = $state<JobCustomFieldDef[]>([]);
	let draft = $state<Record<string, string | boolean>>({});

	onMount(async () => {
		try {
			const res = await fetch('/api/job-custom-fields');
			if (!res.ok) return;
			const body = (await res.json()) as { data: { items: JobCustomFieldDef[] } };
			defs = body.data.items;
			const d: Record<string, string | boolean> = {};
			for (const f of defs) d[f.id] = f.field_type === 'checkbox' ? false : '';
			draft = d;
		} catch {
			// Custom fields are non-blocking on the create form; silently skip if unavailable.
		}
	});

	function buildValues(): JobCustomFieldValuePayload[] {
		return defs.map((f) => {
			const v = draft[f.id];
			if (f.field_type === 'checkbox') return { field_id: f.id, value_bool: !!v };
			if (f.field_type === 'number')
				return { field_id: f.id, value_number: v === '' || v == null ? null : Number(v) };
			if (f.field_type === 'date') return { field_id: f.id, value_date: v ? String(v) : null };
			return { field_id: f.id, value_text: v ? String(v) : null };
		});
	}

	// Push the built payload out through the bindable prop whenever the draft or defs change.
	$effect(() => {
		values = buildValues();
	});
</script>

{#if defs.length > 0}
	<section class="job-section">
		<div class="job-section__head">
			<div class="job-section__head-main">
				<i class="ri-list-settings-line job-section__icon" aria-hidden="true"></i>
				<h2 class="job-section__title">Custom fields</h2>
			</div>
		</div>

		<div class="job-cf-input">
			{#each defs as f (f.id)}
				<div class="field" class:job-cf-input__field--invalid={!!errors[f.id]}>
					{#if f.field_type === 'checkbox'}
						<label class="job-cf-input__checkbox">
							<input type="checkbox" bind:checked={draft[f.id] as boolean} />
							<span>
								{f.label}{#if f.required}<span class="job-cf-input__req">*</span>{/if}
							</span>
						</label>
						{#if f.help_text}<p class="job-cf-input__help">{f.help_text}</p>{/if}
					{:else}
						<label class="field__label" for="ncf-{f.id}">
							{f.label}{#if f.required}<span class="job-cf-input__req">*</span>{/if}
						</label>
						{#if f.help_text}<p class="job-cf-input__help">{f.help_text}</p>{/if}

						{#if f.field_type === 'short_text'}
							<input id="ncf-{f.id}" class="field__input" type="text" bind:value={draft[f.id]} maxlength="2000" />
						{:else if f.field_type === 'link'}
							<input id="ncf-{f.id}" class="field__input" type="url" inputmode="url" placeholder="https://…" bind:value={draft[f.id]} maxlength="2000" />
						{:else if f.field_type === 'number'}
							<input id="ncf-{f.id}" class="field__input" type="number" bind:value={draft[f.id]} />
						{:else if f.field_type === 'date'}
							<input id="ncf-{f.id}" class="field__input" type="date" bind:value={draft[f.id]} />
						{:else if f.field_type === 'dropdown'}
							<select id="ncf-{f.id}" class="field__input" bind:value={draft[f.id]}>
								<option value="">Select…</option>
								{#each f.options ?? [] as opt (opt)}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						{/if}
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.job-cf-input {
		display: flex;
		flex-direction: column;
		gap: $space-3;

		&__help {
			margin: 0 0 $space-1;
			font-size: $fs-body;
			color: var(--color-text-muted);
		}

		&__req {
			margin-left: 2px;
			color: var(--danger-text);
		}

		&__checkbox {
			display: inline-flex;
			align-items: center;
			gap: $space-2;
			font-size: $fs-body;
			color: var(--color-text-primary);
			cursor: pointer;

			input {
				width: 18px;
				height: 18px;
			}
		}

		&__field--invalid {
			padding: $space-2 $space-3;
			margin: 0 (-$space-3);
			border-radius: $radius-md;
			background: var(--danger-bg);

			:global(.field__label) {
				color: var(--danger-text);
			}

			:global(.field__input) {
				border-color: var(--danger-text);
			}
		}
	}
</style>
