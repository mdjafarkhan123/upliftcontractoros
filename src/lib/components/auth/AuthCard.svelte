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

<main class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40 flex items-center justify-center p-4">
	<div class="w-full max-w-[420px]">
		<!-- Brand header -->
		<div class="text-center mb-8">
			<div
				class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary shadow-lg shadow-primary/25 mb-5"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="26"
					height="26"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-white"
				>
					<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-7H4a2 2 0 0 0-2 2z" />
					<path d="M14 2v6h6" />
					<path d="M12 12v6" />
					<path d="M9 15l3-3 3 3" />
				</svg>
			</div>
			<p class="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground/70">
				Contractor OS
			</p>
		</div>

		<!-- Card -->
		<div
			class="bg-white rounded-2xl shadow-xl shadow-slate-200/80 border border-slate-200/60 overflow-hidden"
		>
			<div class="px-8 pt-8 pb-2">
				<h1 class="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
				{#if description}
					<p class="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
				{/if}
			</div>

			<div class="px-8 py-8">
				{@render children()}
			</div>

			{#if footer}
				<div class="px-8 pb-6 -mt-3 flex justify-center border-t border-slate-100 pt-5">
					{@render footer()}
				</div>
			{/if}
		</div>

		<p class="text-center text-xs text-muted-foreground/50 mt-6">
			© {new Date().getFullYear()} Contractor OS. All rights reserved.
		</p>
	</div>
</main>
