<script lang="ts">
	import { Beaker, Send, ExternalLink, Copy, CheckCircle2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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

<section class="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
	<div class="flex items-start gap-3 border-b border-border bg-muted/30 px-5 py-4">
		<div
			class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-600"
		>
			<Beaker class="h-4 w-4" />
		</div>
		<div>
			<h3 class="text-base font-semibold text-foreground">Try the full payment flow</h3>
			<p class="text-xs text-muted-foreground">
				Send yourself a $1 test invoice. You’ll see it land in your inbox, open the payment page,
				pay with a test card, and watch it mark itself as paid — all without touching real money.
			</p>
		</div>
	</div>

	<div class="flex flex-col gap-4 px-5 py-5">
		<div class="flex flex-col gap-1.5">
			<Label for="test-email">Send to</Label>
			<Input
				id="test-email"
				type="email"
				placeholder="you@yourbusiness.com"
				bind:value={email}
				disabled={sending}
			/>
			<p class="text-[11px] text-muted-foreground">
				Defaults to your own login email so you’ll receive the test invoice yourself.
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button onclick={send} disabled={sending || !email}>
				<Send class="mr-1.5 h-4 w-4" />
				{sending ? 'Sending…' : 'Send $1 test invoice'}
			</Button>
			<p class="text-xs text-muted-foreground">
				Use Stripe test card <code class="font-mono">4242 4242 4242 4242</code>, any future expiry,
				any CVC.
			</p>
		</div>

		{#if result}
			<div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
				<div class="flex items-start gap-2">
					<CheckCircle2 class="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
					<div class="flex-1">
						<p class="text-sm font-semibold text-foreground">
							Test invoice {result.invoice_number_display} sent to {result.recipient_email}
						</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Check your inbox, or open the customer payment page directly:
						</p>
						<div class="mt-2 flex flex-wrap items-center gap-2">
							<a
								href={result.public_url}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-500/40 bg-background px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10"
							>
								<ExternalLink class="h-3.5 w-3.5" />
								Open payment page
							</a>
							<button
								type="button"
								onclick={copyLink}
								class="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
							>
								<Copy class="h-3.5 w-3.5" />
								Copy link
							</button>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</div>
</section>
