<svelte:head>
	<title>Setting up</title>
</svelte:head>

<div class="setup">
	<i class="ri-loader-4-line animate-spin setup__spinner" aria-hidden="true"></i>
	<h1 class="setup__title">Your system is being set up</h1>
	<p class="setup__body">
		We're preparing your workspace. This usually takes less than a minute. You'll be redirected
		automatically when it's ready.
	</p>
</div>

<style lang="scss">
	@use '$lib/styles/tokens' as *;

	.setup {
		display: flex;
		min-height: calc(100vh - 8rem);
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: $space-4;
		padding: 0 $space-6;
		text-align: center;
	}

	.setup__spinner {
		font-size: 40px;
		line-height: 1;
		color: var(--color-brand);
	}

	.setup__title {
		font-size: $fs-h3;
		font-weight: $weight-semibold;
		color: var(--color-text-primary);
	}

	.setup__body {
		max-width: 28rem;
		font-size: $fs-body;
		line-height: $lh-body;
		color: var(--color-text-secondary);
	}
</style>
