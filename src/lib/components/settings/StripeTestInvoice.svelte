<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/stores/toast.svelte';

	let { defaultEmail }: { defaultEmail: string } = $props();

	let email = $state(defaultEmail);
	let sending = $state(false);
	let result = $state<{
		invoice_id: string;
		invoice_number_display: string;
		public_url: string;
		recipient_email: string;
	} | null>(null);

	async function send() {
		sending = true;
		try {
			const res = await fetch('/api/settings/stripe/test-invoice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: email || undefined })
			});
			const body = (await res.json()) as {
				data?: {
					invoice_id: string;
					invoice_number_display: string;
					public_url: string;
					recipient_email: string;
				};
				error?: string;
			};
			if (!res.ok || !body.data) {
				toast.error(body.error ?? 'Could not send test invoice');
				return;
			}
			result = body.data;
			toast.success(`Test invoice ${body.data.invoice_number_display} sent`);
		} catch {
			toast.error('Could not send test invoice');
		} finally {
			sending = false;
		}
	}

	async function copyLink() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.public_url);
			toast.success('Payment link copied');
		} catch {
			toast.error('Copy failed');
		}
	}
</script>

<section class="stripe-test">
	<div class="stripe-test__head">
		<div class="stripe-test__head-icon">
			<i class="ri-flask-line" aria-hidden="true"></i>
		</div>
		<div>
			<h3 class="stripe-test__title">Try the full payment flow</h3>
			<p class="stripe-test__sub">
				Send yourself a $1 test invoice. You'll see it land in your inbox, open the payment page,
				pay with a test card, and watch it mark itself as paid — all without touching real money.
			</p>
		</div>
	</div>

	<div class="stripe-test__body">
		<div class="field">
			<label class="field__label" for="test-email">Send to</label>
			<input
				class="field__input"
				id="test-email"
				type="email"
				placeholder="you@yourbusiness.com"
				bind:value={email}
				disabled={sending}
			/>
			<p class="field__hint">
				Defaults to your own login email so you'll receive the test invoice yourself.
			</p>
		</div>

		<div class="stripe-test__actions">
			<Button disabled={!email} loading={sending} loadingLabel="Sending…" onclick={send}>
				<i class="ri-send-plane-line" aria-hidden="true"></i>
				Send $1 test invoice
			</Button>
			<p class="stripe-test__hint">
				Use Stripe test card <code>4242 4242 4242 4242</code>, any future expiry, any CVC.
			</p>
		</div>

		{#if result}
			<div class="stripe-test__result">
				<i class="ri-checkbox-circle-line stripe-test__result-icon" aria-hidden="true"></i>
				<div>
					<p class="stripe-test__result-title">
						Test invoice {result.invoice_number_display} sent to {result.recipient_email}
					</p>
					<p class="stripe-test__result-desc">
						Check your inbox, or open the customer payment page directly:
					</p>
					<div class="stripe-test__result-actions">
						<a
							class="stripe-codebtn"
							href={result.public_url}
							target="_blank"
							rel="noopener noreferrer"
						>
							<i class="ri-external-link-line" aria-hidden="true"></i>
							Open payment page
						</a>
						<button type="button" class="stripe-codebtn" onclick={copyLink}>
							<i class="ri-file-copy-line" aria-hidden="true"></i>
							Copy link
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</section>
