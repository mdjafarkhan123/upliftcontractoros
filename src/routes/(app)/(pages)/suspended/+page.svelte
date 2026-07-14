<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getOrgContext } from '$lib/context/org';
	import { formatDate } from '$lib/utils/format';

	const org = getOrgContext();

	const isSuspended = $derived(org().status === 'suspended');
	const deletionDate = $derived(org().deletion_scheduled_at);

	onMount(() => {
		if (!isSuspended) {
			goto('/dashboard', { replaceState: true });
		}
	});
</script>

<svelte:head>
	<title>Account suspended — Contractor OS</title>
</svelte:head>

{#if isSuspended}
	<div class="suspended">
		<!-- Background grid -->
		<div class="suspended__grid" aria-hidden="true"></div>
		<!-- Ambient brand glow -->
		<div class="suspended__glow" aria-hidden="true"></div>

		<div class="suspended__col">
			<!-- Org brand mark -->
			<div class="suspended__brand">
				{#if org().logo_url}
					<img src={org().logo_url} alt={org().name} class="suspended__logo" />
				{:else}
					<div class="suspended__logo suspended__logo--fallback" aria-hidden="true">
						{org().name.charAt(0).toUpperCase()}
					</div>
				{/if}
				<span class="suspended__org">{org().name}</span>
			</div>

			<!-- Main card -->
			<div class="suspended__card">
				<div class="suspended__accent" aria-hidden="true"></div>

				<div class="suspended__body">
					<!-- Status pill -->
					<div class="suspended__pill-row">
						<div class="suspended__pill">
							<span class="suspended__ping">
								<span class="suspended__ping-wave"></span>
								<span class="suspended__ping-dot"></span>
							</span>
							Suspended
						</div>
					</div>

					<!-- Headline -->
					<h1 class="suspended__title">Account temporarily suspended</h1>
					<p class="suspended__lead">
						Your organization's access has been temporarily restricted. Please contact support or
						resolve your billing issue to restore access.
					</p>
					<p class="suspended__sub">Your data has not been deleted.</p>

					<!-- Metadata block -->
					<dl class="suspended__meta">
						<div class="suspended__row">
							<dt>Workspace</dt>
							<dd class="suspended__val">{org().name}</dd>
						</div>
						<div class="suspended__row">
							<dt>Status</dt>
							<dd class="suspended__val suspended__val--mono suspended__val--warn">suspended</dd>
						</div>
						{#if deletionDate}
							<div class="suspended__row">
								<dt>Scheduled deletion</dt>
								<dd class="suspended__val suspended__val--mono suspended__val--danger">
									{formatDate(deletionDate)}
								</dd>
							</div>
						{/if}
						<div class="suspended__row">
							<dt>Data retention</dt>
							<dd class="suspended__val suspended__val--ok">Preserved</dd>
						</div>
					</dl>

					{#if deletionDate}
						<div class="suspended__warn">
							<i class="ri-error-warning-fill suspended__warn-icon" aria-hidden="true"></i>
							<div>
								<p class="suspended__warn-title">Scheduled for deletion</p>
								<p class="suspended__warn-body">
									Your organization is scheduled for deletion on
									<strong>{formatDate(deletionDate)}</strong>
									if the suspension is not resolved.
								</p>
							</div>
						</div>
					{/if}

					<!-- Actions -->
					<div class="suspended__actions">
						<a href="mailto:support@contractoros.com" class="btn btn--primary suspended__support">
							Contact support
							<i class="ri-arrow-right-line" aria-hidden="true"></i>
						</a>
						<form method="POST" action="/auth/logout">
							<button type="submit" class="btn btn--secondary suspended__logout">Log out</button>
						</form>
					</div>
				</div>
			</div>

			<p class="suspended__copyright">© {new Date().getFullYear()} Contractor OS</p>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.suspended {
		position: relative;
		display: flex;
		min-height: 100vh;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: var(--color-bg-app);
		padding: $space-10 $space-4;
	}

	.suspended__grid {
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.5;
		background-image:
			linear-gradient(to right, var(--color-border) 1px, transparent 1px),
			linear-gradient(to bottom, var(--color-border) 1px, transparent 1px);
		background-size: 36px 36px;
		mask-image: radial-gradient(ellipse at center, #000 30%, transparent 75%);
	}

	.suspended__glow {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 680px;
		height: 420px;
		pointer-events: none;
		border-radius: $radius-full;
		background: radial-gradient(closest-side, rgba(34, 125, 83, 0.18), transparent 70%);
		filter: blur(64px);
	}

	.suspended__col {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 460px;
	}

	// ── Brand mark ────────────────────────────────────────────────────────────

	.suspended__brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: $space-2;
		margin-bottom: $space-8;
	}

	.suspended__logo {
		width: 32px;
		height: 32px;
		border-radius: $radius-md;
		object-fit: cover;
		box-shadow: 0 0 0 1px var(--color-border);

		&--fallback {
			display: flex;
			align-items: center;
			justify-content: center;
			background: var(--color-brand);
			color: #fff;
			font-size: 12px;
			font-weight: $weight-bold;
		}
	}

	.suspended__org {
		font-size: $fs-body;
		font-weight: $weight-semibold;
		letter-spacing: -0.01em;
		color: var(--color-text-primary);
	}

	// ── Card ──────────────────────────────────────────────────────────────────

	.suspended__card {
		position: relative;
		overflow: hidden;
		border-radius: $radius-2xl;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-xl);
	}

	.suspended__accent {
		position: absolute;
		inset-inline: 0;
		top: 0;
		height: 1px;
		background: linear-gradient(90deg, transparent, var(--warning-solid), transparent);
		opacity: 0.7;
	}

	.suspended__body {
		padding: $space-8 $space-7 $space-7;

		@media (min-width: $bp-mobile) {
			padding: $space-10 $space-8 $space-8;
		}
	}

	// ── Status pill ─────────────────────────────────────────────────────────

	.suspended__pill-row {
		display: flex;
		justify-content: center;
	}

	.suspended__pill {
		display: inline-flex;
		align-items: center;
		gap: $space-2;
		border-radius: $radius-full;
		border: 1px solid rgba(245, 158, 11, 0.35);
		background: var(--warning-bg);
		padding: $space-1 $space-3;
		font-size: $fs-caption;
		font-weight: $weight-semibold;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--warning-text);
	}

	.suspended__ping {
		position: relative;
		display: flex;
		width: 6px;
		height: 6px;
	}

	.suspended__ping-wave {
		position: absolute;
		inset: 0;
		border-radius: $radius-full;
		background: var(--warning-solid);
		opacity: 0.6;
		animation: suspended-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
	}

	.suspended__ping-dot {
		position: relative;
		width: 6px;
		height: 6px;
		border-radius: $radius-full;
		background: var(--warning-solid);
	}

	// ── Copy ──────────────────────────────────────────────────────────────────

	.suspended__title {
		margin-top: $space-6;
		text-align: center;
		font-size: $fs-h2;
		font-weight: $weight-semibold;
		line-height: 1.15;
		letter-spacing: -0.02em;
		color: var(--color-text-primary);
	}

	.suspended__lead {
		margin: $space-4 auto 0;
		max-width: 360px;
		text-align: center;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--color-text-secondary);
	}

	.suspended__sub {
		margin-top: $space-2;
		text-align: center;
		font-size: $fs-body;
		color: var(--color-text-muted);
	}

	// ── Metadata block ─────────────────────────────────────────────────────────

	.suspended__meta {
		margin-top: $space-8;
		overflow: hidden;
		border-radius: $radius-lg;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface-sunk);
		font-size: $fs-body;
	}

	.suspended__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: $space-3 $space-4;

		& + & {
			border-top: 1px solid var(--color-border);
		}

		dt {
			color: var(--color-text-secondary);
		}
	}

	.suspended__val {
		font-weight: $weight-medium;
		color: var(--color-text-primary);

		&--mono {
			font-family: ui-monospace, 'SF Mono', monospace;
			font-size: $fs-caption;
		}

		&--warn {
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color: var(--warning-text);
		}

		&--danger {
			color: var(--danger-text);
		}

		&--ok {
			color: var(--success-text);
		}
	}

	// ── Deletion warning ─────────────────────────────────────────────────────

	.suspended__warn {
		display: flex;
		align-items: flex-start;
		gap: $space-2;
		margin-top: $space-4;
		border-radius: $radius-md;
		border: 1px solid rgba(225, 29, 72, 0.3);
		background: var(--danger-bg);
		padding: $space-3 $space-4;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--danger-text);
	}

	.suspended__warn-icon {
		flex-shrink: 0;
		margin-top: 1px;
		font-size: 16px;
		line-height: 1;
	}

	.suspended__warn-title {
		font-weight: $weight-semibold;
	}

	.suspended__warn-body {
		margin-top: $space-1;
		opacity: 0.9;
	}

	// ── Actions ────────────────────────────────────────────────────────────────

	.suspended__actions {
		display: flex;
		flex-direction: column;
		gap: $space-2;
		margin-top: $space-7;
	}

	.suspended__support {
		width: 100%;
		height: 44px;

		i {
			font-size: 16px;
			line-height: 1;
			transition: transform $duration-base $ease-standard;
		}

		&:hover i {
			transform: translateX(2px);
		}
	}

	.suspended__logout {
		width: 100%;
		height: 44px;
	}

	.suspended__copyright {
		margin-top: $space-6;
		text-align: center;
		font-size: $fs-caption;
		color: var(--color-text-muted);
		opacity: 0.7;
	}

	@keyframes suspended-ping {
		75%,
		100% {
			transform: scale(2.2);
			opacity: 0;
		}
	}
</style>
