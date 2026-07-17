<script lang="ts">
	let {
		title,
		description,
		children,
		footer
	}: {
		title: string;
		description?: string;
		children: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	} = $props();
</script>

<main class="auth-layout">
	<!-- Decorative background blobs -->
	<div class="auth-layout__bg" aria-hidden="true">
		<div class="auth-layout__blob auth-layout__blob--top-left"></div>
		<div class="auth-layout__blob auth-layout__blob--bottom-right"></div>
		<div class="auth-layout__blob auth-layout__blob--center"></div>
		<div class="auth-layout__grid"></div>
	</div>

	<div class="auth-layout__container">
		<!-- Brand header -->
		<div class="auth-brand">
			<div class="auth-brand__logo">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="30"
					height="30"
					viewBox="0 0 24 24"
					fill="none"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M3 17 L12 8 L21 17"
						stroke="#13452D"
						stroke-width="2.6"
						opacity="0.55"
						transform="translate(0,3)"
					/>
					<path d="M3 17 L12 8 L21 17" stroke="white" stroke-width="2.6" opacity="0.95" />
					<circle cx="12" cy="8" r="1.6" fill="#17F700" />
				</svg>
			</div>
			<p class="auth-brand__name">Contractor OS</p>
		</div>

		<!-- Card -->
		<div class="auth-card">
			<div class="auth-card__header">
				<h1 class="auth-card__title">{title}</h1>
				{#if description}
					<p class="auth-card__description">{description}</p>
				{/if}
			</div>

			<div class="auth-card__body">
				{@render children()}
			</div>

			{#if footer}
				<div class="auth-card__footer">
					{@render footer()}
				</div>
			{/if}
		</div>

		<p class="auth-layout__copyright">
			© {new Date().getFullYear()} Contractor OS. All rights reserved.
		</p>
	</div>
</main>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.auth-layout {
		position: relative;
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: var(--color-bg-app);
		padding: $space-10 $space-4;
	}

	// ── Background decorative layer ──────────────────────────────────────────

	.auth-layout__bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 0;
	}

	.auth-layout__blob {
		position: absolute;
		border-radius: $radius-full;

		&--top-left {
			top: -80px;
			left: -80px;
			width: 420px;
			height: 420px;
			background: radial-gradient(closest-side, rgba(34, 125, 83, 0.55), transparent 70%);
			filter: blur(72px);
			opacity: 0.5;
		}

		&--bottom-right {
			bottom: -100px;
			right: -60px;
			width: 480px;
			height: 480px;
			background: radial-gradient(closest-side, rgba(23, 247, 0, 0.15), transparent 70%);
			filter: blur(80px);
			opacity: 0.4;
		}

		&--center {
			top: 50%;
			left: 50%;
			transform: translate(-50%, -50%);
			width: 520px;
			height: 520px;
			background: radial-gradient(closest-side, rgba(19, 69, 45, 0.7), transparent 70%);
			filter: blur(80px);
			opacity: 0.4;
		}
	}

	.auth-layout__grid {
		position: absolute;
		inset: 0;
		opacity: 0.04;
		background-image:
			linear-gradient(var(--color-text-primary) 1px, transparent 1px),
			linear-gradient(90deg, var(--color-text-primary) 1px, transparent 1px);
		background-size: 44px 44px;
	}

	// ── Centered content column ──────────────────────────────────────────────

	.auth-layout__container {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 420px;
	}

	.auth-layout__copyright {
		margin-top: $space-6;
		text-align: center;
		font-size: $fs-caption;
		color: var(--color-text-muted);
		opacity: 0.7;
	}

	// ── Brand mark ──────────────────────────────────────────────────────────

	.auth-brand {
		text-align: center;
		margin-bottom: $space-8;
	}

	.auth-brand__logo {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		border-radius: $radius-xl;
		background: linear-gradient(
			135deg,
			#{$brand-light} 0%,
			#{$brand-primary} 55%,
			#{$brand-deep} 100%
		);
		box-shadow:
			0 10px 30px -8px rgba(34, 125, 83, 0.55),
			inset 0 1px 0 rgba(23, 247, 0, 0.6);
		margin: 0 auto $space-5;
	}

	.auth-brand__name {
		font-size: $fs-caption;
		font-weight: $weight-semibold;
		text-transform: uppercase;
		letter-spacing: 0.28em;
		color: var(--color-text-secondary);
	}

	// ── Auth card ────────────────────────────────────────────────────────────

	.auth-card {
		position: relative;
		border-radius: $radius-2xl;
		border: 1px solid var(--color-border);
		background: var(--color-bg-surface);
		box-shadow: var(--shadow-xl);
		overflow: hidden;

		// Top hairline brand glow
		&::before {
			content: '';
			position: absolute;
			inset-inline: 0;
			top: 0;
			height: 1px;
			background: linear-gradient(90deg, transparent, rgba(23, 247, 0, 0.45), transparent);
			pointer-events: none;
		}
	}

	.auth-card__header {
		padding: $space-8 $space-8 $space-3;
	}

	.auth-card__title {
		font-family: $font-display;
		font-size: $fs-h2;
		font-weight: $weight-semibold;
		letter-spacing: -0.02em;
		color: var(--color-text-primary);
		line-height: $lh-h2;
	}

	.auth-card__description {
		margin-top: $space-1;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--color-text-secondary);
	}

	.auth-card__body {
		padding: $space-7 $space-8;
	}

	.auth-card__footer {
		display: flex;
		justify-content: center;
		border-top: 1px solid var(--color-border);
		background: var(--color-bg-surface-sunk);
		padding: $space-4 $space-8;
	}
</style>
