<script lang="ts">
	import type { FunnelInitialState } from './+page';
	import { Button } from '$lib/components/ui/button';

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

<main class="pub pub--center">
	<div class="pub__shell pub__shell--narrow">
		{#if phase === 'not_found'}
			<section class="pub-card pub-card--center">
				<h1 class="pub-card__title">Link not found</h1>
				<p class="pub-card__text">This review link is invalid or has been removed.</p>
			</section>
		{:else if phase === 'expired'}
			<section class="pub-card pub-card--center">
				<h1 class="pub-card__title">Link expired</h1>
				<p class="pub-card__text">
					This review link is no longer active. If you'd still like to share feedback, please
					contact {orgName || 'us'} directly.
				</p>
			</section>
		{:else if phase === 'done'}
			<section class="pub-card pub-card--center">
				<h1 class="pub-card__title">
					Thank you{firstName ? `, ${firstName}` : ''}!
				</h1>
				{#if resultPath === 'review' && resultGoogleLink}
					<p class="pub-card__text">Redirecting you to share this publicly…</p>
					<Button variant="default" class="btn--full pub-review__continue" href={resultGoogleLink}>
						Continue to Google
					</Button>
				{:else if resultPath === 'review'}
					<p class="pub-card__text">
						We really appreciate the {selectedScore}-star rating.
					</p>
				{:else}
					<p class="pub-card__text">
						We appreciate the honest feedback — someone from our team will be in touch.
					</p>
				{/if}
			</section>
		{:else}
			<section class="pub-card pub-review">
				<header class="pub-review__header">
					<h1 class="pub-review__title">
						How was your experience{orgName ? ` with ${orgName}` : ''}?
					</h1>
					<p class="pub-review__subtitle">
						Tap a star to rate{firstName ? `, ${firstName}` : ''}.
					</p>
				</header>

				<div
					class="pub-review__stars"
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
							class="pub-review__star"
							class:pub-review__star--active={active}
							onmouseenter={() => (hoverScore = n)}
							onfocus={() => (hoverScore = n)}
							onblur={() => (hoverScore = null)}
							onclick={() => pickScore(n)}
						>
							<i class={active ? 'ri-star-fill' : 'ri-star-line'} aria-hidden="true"></i>
						</button>
					{/each}
				</div>

				{#if phase === 'comment'}
					<div class="pub-review__comment">
						<label for="r-comment" class="pub-review__comment-label">
							Sorry we missed the mark. What went wrong?
						</label>
						<textarea
							id="r-comment"
							bind:value={comment}
							rows="4"
							maxlength="2000"
							placeholder="Optional — share anything that would help us improve."
							class="field__textarea"
						></textarea>
						<Button type="button" variant="default" class="btn--full" onclick={submitFeedback}>
							Send feedback
						</Button>
						<p class="pub-review__note">
							Your feedback goes privately to {orgName || 'the team'} — not posted publicly.
						</p>
					</div>
				{/if}

				{#if phase === 'submitting'}
					<p class="pub-review__status">Submitting…</p>
				{/if}

				{#if errorMessage}
					<p class="pub-review__error">{errorMessage}</p>
				{/if}
			</section>
		{/if}
	</div>
</main>
