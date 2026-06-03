<script lang="ts">
	import { Star } from '@lucide/svelte';
	import { cn } from '$lib/utils/cn';
	import type { FunnelInitialState } from './+page';

	let { data } = $props<{ data: { initial: FunnelInitialState; token: string } }>();

	type Phase = 'choose' | 'comment' | 'submitting' | 'done' | 'expired' | 'not_found';

	function phaseFromInitial(s: FunnelInitialState): Phase {
		if (s.state === 'expired') return 'expired';
		if (s.state === 'not_found') return 'not_found';
		if (s.state === 'already_submitted') return 'done';
		return 'choose';
	}

	let phase = $state<Phase>(phaseFromInitial(data.initial));
	let hoverScore = $state<number | null>(null);
	let selectedScore = $state<number | null>(
		data.initial.state === 'already_submitted' ? data.initial.submitted_score : null
	);
	let comment = $state('');
	let errorMessage = $state<string | null>(null);
	let resultGoogleLink = $state<string | null>(
		data.initial.state === 'already_submitted' ? data.initial.google_review_link : null
	);
	let resultPath = $state<'review' | 'feedback' | null>(
		data.initial.state === 'already_submitted' && data.initial.submitted_score
			? data.initial.submitted_score >= 4
				? 'review'
				: 'feedback'
			: null
	);

	const orgName = $derived(
		data.initial.state === 'ready' || data.initial.state === 'already_submitted'
			? data.initial.org_name
			: ''
	);
	const firstName = $derived(
		data.initial.state === 'ready' || data.initial.state === 'already_submitted'
			? data.initial.contact_first_name
			: ''
	);

	function pickScore(n: number) {
		if (phase !== 'choose') return;
		selectedScore = n;
		errorMessage = null;
		if (n >= 4) {
			void submit(n, null);
		} else {
			phase = 'comment';
		}
	}

	async function submit(score: number, body: string | null) {
		phase = 'submitting';
		errorMessage = null;
		try {
			const res = await fetch(`/api/r/${data.token}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ score, body })
			});
			if (res.status === 410) {
				phase = 'expired';
				return;
			}
			if (res.status === 429) {
				errorMessage = 'Too many attempts. Please try again later.';
				phase = score >= 4 ? 'choose' : 'comment';
				return;
			}
			if (!res.ok) {
				const j = (await res.json().catch(() => ({}))) as { error?: string };
				errorMessage = j.error ?? 'Something went wrong. Please try again.';
				phase = score >= 4 ? 'choose' : 'comment';
				return;
			}
			const j = (await res.json()) as {
				data: {
					state: 'recorded' | 'already_submitted';
					score?: number;
					path?: 'review' | 'feedback';
					google_review_link: string | null;
					submitted_score?: number;
				};
			};
			resultGoogleLink = j.data.google_review_link ?? null;
			const finalScore = j.data.score ?? j.data.submitted_score ?? score;
			selectedScore = finalScore;
			resultPath = j.data.path ?? (finalScore >= 4 ? 'review' : 'feedback');
			phase = 'done';

			// Positive path with a configured Google link: redirect after a brief
			// confirmation so the customer sees the thank-you, then completes the
			// public review on Google.
			if (resultPath === 'review' && resultGoogleLink) {
				const link = resultGoogleLink;
				setTimeout(() => {
					window.location.href = link;
				}, 1200);
			}
		} catch {
			errorMessage = 'Network error. Please try again.';
			phase = score >= 4 ? 'choose' : 'comment';
		}
	}

	function submitFeedback() {
		if (selectedScore === null) return;
		void submit(selectedScore, comment.trim() || null);
	}
</script>

<svelte:head>
	<title>{orgName ? `${orgName} — Rate your experience` : 'Rate your experience'}</title>
	<meta name="robots" content="noindex,nofollow" />
</svelte:head>

<main
	class="flex min-h-[100dvh] items-start justify-center bg-background px-4 py-10 sm:items-center"
>
	<div class="w-full max-w-md">
		{#if phase === 'not_found'}
			<section class="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
				<h1 class="text-xl font-semibold text-foreground">Link not found</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					This review link is invalid or has been removed.
				</p>
			</section>
		{:else if phase === 'expired'}
			<section class="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
				<h1 class="text-xl font-semibold text-foreground">Link expired</h1>
				<p class="mt-2 text-sm text-muted-foreground">
					This review link is no longer active. If you'd still like to share feedback, please
					contact {orgName || 'us'} directly.
				</p>
			</section>
		{:else if phase === 'done'}
			<section class="rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
				<h1 class="text-xl font-semibold text-foreground">
					Thank you{firstName ? `, ${firstName}` : ''}!
				</h1>
				{#if resultPath === 'review' && resultGoogleLink}
					<p class="mt-2 text-sm text-muted-foreground">Redirecting you to share this publicly…</p>
					<a
						href={resultGoogleLink}
						class="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
					>
						Continue to Google
					</a>
				{:else if resultPath === 'review'}
					<p class="mt-2 text-sm text-muted-foreground">
						We really appreciate the {selectedScore}-star rating.
					</p>
				{:else}
					<p class="mt-2 text-sm text-muted-foreground">
						We appreciate the honest feedback — someone from our team will be in touch.
					</p>
				{/if}
			</section>
		{:else}
			<section class="rounded-2xl border border-border bg-card p-6 shadow-sm">
				<header class="text-center">
					<h1 class="text-xl font-semibold text-foreground sm:text-2xl">
						How was your experience{orgName ? ` with ${orgName}` : ''}?
					</h1>
					<p class="mt-2 text-sm text-muted-foreground">
						Tap a star to rate{firstName ? `, ${firstName}` : ''}.
					</p>
				</header>

				<div
					class="mt-6 flex items-center justify-between gap-1"
					role="radiogroup"
					aria-label="Rating"
					tabindex="-1"
					onmouseleave={() => (hoverScore = null)}
				>
					{#each [1, 2, 3, 4, 5] as n (n)}
						{@const active = (hoverScore ?? selectedScore ?? 0) >= n}
						<button
							type="button"
							role="radio"
							aria-checked={selectedScore === n}
							aria-label={`${n} star${n > 1 ? 's' : ''}`}
							disabled={phase === 'submitting'}
							class={cn(
								'flex h-14 w-14 items-center justify-center rounded-xl transition-transform',
								'active:scale-95 disabled:opacity-60 sm:h-16 sm:w-16',
								phase !== 'submitting' && 'hover:bg-muted'
							)}
							onmouseenter={() => (hoverScore = n)}
							onfocus={() => (hoverScore = n)}
							onblur={() => (hoverScore = null)}
							onclick={() => pickScore(n)}
						>
							<Star
								class={cn(
									'h-9 w-9 sm:h-10 sm:w-10 transition-colors',
									active ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/35'
								)}
							/>
						</button>
					{/each}
				</div>

				{#if phase === 'comment'}
					<div class="mt-6 space-y-3">
						<label for="r-comment" class="block text-sm font-medium text-foreground">
							Sorry we missed the mark. What went wrong?
						</label>
						<textarea
							id="r-comment"
							bind:value={comment}
							rows="4"
							maxlength="2000"
							placeholder="Optional — share anything that would help us improve."
							class="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						></textarea>
						<button
							type="button"
							onclick={submitFeedback}
							class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground active:scale-[0.99]"
						>
							Send feedback
						</button>
						<p class="text-center text-xs text-muted-foreground">
							Your feedback goes privately to {orgName || 'the team'} — not posted publicly.
						</p>
					</div>
				{/if}

				{#if phase === 'submitting'}
					<p class="mt-6 text-center text-sm text-muted-foreground">Submitting…</p>
				{/if}

				{#if errorMessage}
					<p class="mt-4 text-center text-sm text-destructive">{errorMessage}</p>
				{/if}
			</section>
		{/if}
	</div>
</main>
