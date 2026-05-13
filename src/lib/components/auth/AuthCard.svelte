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

<main
	class="relative min-h-screen flex items-center justify-center overflow-hidden bg-background px-4 py-10"
>
	<!-- Brand gradient mesh -->
	<div class="pointer-events-none absolute inset-0 -z-10">
		<div
			class="absolute -top-32 -left-32 h-[420px] w-[420px] rounded-full opacity-50 blur-3xl"
			style="background: radial-gradient(closest-side, hsl(var(--brand-primary) / 0.55), transparent 70%);"
		></div>
		<div
			class="absolute -bottom-40 -right-24 h-[480px] w-[480px] rounded-full opacity-40 blur-3xl"
			style="background: radial-gradient(closest-side, hsl(var(--brand-light) / 0.35), transparent 70%);"
		></div>
		<div
			class="absolute top-1/2 left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
			style="background: radial-gradient(closest-side, hsl(var(--brand-deep) / 0.7), transparent 70%);"
		></div>
		<!-- subtle grid overlay -->
		<div
			class="absolute inset-0 opacity-[0.04]"
			style="background-image: linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px); background-size: 44px 44px;"
		></div>
	</div>

	<div class="w-full max-w-[420px]">
		<!-- Brand header -->
		<div class="text-center mb-8">
			<div
				class="relative mx-auto mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl"
				style="background: linear-gradient(135deg, hsl(var(--brand-light)) 0%, hsl(var(--brand-primary)) 55%, hsl(var(--brand-deep)) 100%); box-shadow: 0 10px 30px -8px hsl(var(--brand-primary) / 0.55), inset 0 1px 0 hsl(var(--brand-light) / 0.6);"
			>
				<!-- 3-tone brand mark: layered chevrons in deep / primary / light -->
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
						stroke="hsl(var(--brand-deep))"
						stroke-width="2.6"
						opacity="0.55"
						transform="translate(0,3)"
					/>
					<path
						d="M3 17 L12 8 L21 17"
						stroke="white"
						stroke-width="2.6"
						opacity="0.95"
					/>
					<circle cx="12" cy="8" r="1.6" fill="hsl(var(--brand-light))" />
				</svg>
			</div>
			<p
				class="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground"
			>
				Contractor OS
			</p>
		</div>

		<!-- Glass card -->
		<div
			class="relative rounded-2xl border border-white/5 bg-card/80 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden"
		>
			<!-- top hairline glow -->
			<div
				class="pointer-events-none absolute inset-x-0 top-0 h-px"
				style="background: linear-gradient(90deg, transparent, hsl(var(--brand-light) / 0.6), transparent);"
			></div>

			<div class="px-8 pt-8 pb-2">
				<h1 class="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
				{#if description}
					<p class="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
				{/if}
			</div>

			<div class="px-8 py-7">
				{@render children()}
			</div>

			{#if footer}
				<div class="flex justify-center border-t border-border/60 bg-muted/30 px-8 py-4">
					{@render footer()}
				</div>
			{/if}
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground/60">
			© {new Date().getFullYear()} Contractor OS. All rights reserved.
		</p>
	</div>
</main>
