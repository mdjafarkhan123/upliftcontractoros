<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	type AddressDraft = {
		label: 'billing' | 'service' | 'mailing' | 'other';
		address_line_1: string;
		address_line_2: string;
		city: string;
		state: string;
		zip: string;
		is_primary: boolean;
	};

	let props: { value: AddressDraft; disabled?: boolean } = $props();
	let value = $derived(props.value);
	let disabled = $derived(props.disabled ?? false);
</script>

<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
	<div class="space-y-1.5 md:col-span-2">
		<Label for="addr_label">Label</Label>
		<select
			id="addr_label"
			class="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			bind:value={value.label}
			{disabled}
		>
			<option value="service">Service</option>
			<option value="billing">Billing</option>
			<option value="mailing">Mailing</option>
			<option value="other">Other</option>
		</select>
	</div>
	<div class="space-y-1.5 md:col-span-2">
		<Label for="addr1">
			Address line 1 <span class="text-destructive">*</span>
		</Label>
		<Input id="addr1" bind:value={value.address_line_1} {disabled} required />
	</div>
	<div class="space-y-1.5 md:col-span-2">
		<Label for="addr2">Address line 2</Label>
		<Input id="addr2" bind:value={value.address_line_2} {disabled} />
	</div>
	<div class="space-y-1.5">
		<Label for="city">City <span class="text-destructive">*</span></Label>
		<Input id="city" bind:value={value.city} {disabled} required />
	</div>
	<div class="grid grid-cols-2 gap-3">
		<div class="space-y-1.5">
			<Label for="state">State <span class="text-destructive">*</span></Label>
			<Input id="state" bind:value={value.state} {disabled} required maxlength={4} />
		</div>
		<div class="space-y-1.5">
			<Label for="zip">ZIP <span class="text-destructive">*</span></Label>
			<Input id="zip" bind:value={value.zip} {disabled} required />
		</div>
	</div>
	<label class="flex items-center gap-2 md:col-span-2">
		<input type="checkbox" bind:checked={value.is_primary} {disabled} class="h-4 w-4 rounded border-border" />
		<span class="text-sm">Make this the primary address</span>
	</label>
</div>
