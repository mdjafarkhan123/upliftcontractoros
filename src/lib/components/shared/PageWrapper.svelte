<script lang="ts">
	import { cn } from '$lib/utils/cn';
	import { goto } from '$app/navigation';
	import { ArrowLeft, Search } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/shared/ThemeToggle.svelte';
	import NotificationBell from '$lib/components/notifications/NotificationBell.svelte';
	import UserMenu from '$lib/components/app-shell/UserMenu.svelte';
	import { getOrgContext } from '$lib/context/org';
	import { getMemberContext } from '$lib/context/member';
	import { commandPalette } from '$lib/stores/commandPalette.svelte';
	import type { Org, OrgMember } from '$lib/types';

	let {
		title,
		subtitle,
		actions,
		back,
		children,
		class: className
	}: {
		title?: string;
		subtitle?: string;
		actions?: import('svelte').Snippet;
		/** Show a back button to the left of the title. `true` uses history.back(); a string is a route to goto. */
		back?: boolean | string;
		children?: import('svelte').Snippet;
		class?: string;
	} = $props();

	// The global AppHeader is hidden at md+, so the page header is the single top bar
	// on desktop and hosts the global controls (theme, notifications, user menu).
	// Read org/member from the (app) layout context; fall back to null so PageWrapper
	// still renders if ever used outside that tree (e.g. auth/onboarding).
	function readContext<T>(read: () => () => T): (() => T) | null {
		try {
			return read();
		} catch {
			return null;
		}
	}
	const org = readContext(getOrgContext);
	const member = readContext(getMemberContext);
	const showControls = Boolean(org && member);

	function handleBack() {
		if (typeof back === 'string') {
			void goto(back);
		} else if (typeof history !== 'undefined' && history.length > 1) {
			history.back();
		} else {
			void goto('/');
		}
	}

	const hasTitleRow = $derived(Boolean(title || actions || back));
</script>

<div class={cn('mx-auto w-full max-w-screen-xl px-4 py-4 md:px-6 md:py-6', className)}>
	{#if hasTitleRow || showControls}
		<header
			class={cn(
				'-mx-4 mb-5 min-h-14 flex-col gap-3 border-b border-border/60 bg-background px-4 pb-4 md:-mx-6 md:sticky md:top-0 md:z-30 md:mb-6 md:min-h-16 md:flex-row md:items-center md:justify-between md:px-6 md:py-3',
				hasTitleRow ? 'flex' : 'hidden md:flex'
			)}
		>
			<div class="flex min-w-0 items-center gap-3">
				{#if back}
					<button
						type="button"
						onclick={handleBack}
						aria-label="Go back"
						class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-card text-foreground shadow-card transition-all duration-150 ease-out hover:-translate-x-0.5 hover:border-primary/30 hover:bg-card-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<ArrowLeft class="h-4 w-4" />
					</button>
				{/if}
				<div class="flex min-w-0 flex-col gap-1">
					{#if title}
						<h1
							class="truncate text-xl font-semibold leading-tight tracking-tight text-foreground md:text-2xl"
						>
							{title}
						</h1>
					{/if}
					{#if subtitle}
						<p class="max-w-3xl text-sm text-muted-foreground">{subtitle}</p>
					{/if}
				</div>
			</div>

			<div class="flex shrink-0 items-center gap-2.5">
				{#if actions}
					<div class="flex flex-wrap items-center gap-2">
						{@render actions()}
					</div>
				{/if}
				{#if showControls && org && member}
					<!-- Desktop-only global controls; mobile gets these from the AppHeader -->
					<div class="hidden items-center gap-2.5 md:flex">
						{#if actions}
							<div class="h-8 w-px bg-border/60" aria-hidden="true"></div>
						{/if}
						<div
							class="flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/70 p-1 shadow-card"
						>
							<button
								type="button"
								onclick={() => (commandPalette.open = true)}
								class="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								aria-label="Search (⌘K)"
							>
								<Search class="h-4 w-4" />
							</button>
							<ThemeToggle />
							<NotificationBell />
						</div>
						<div
							class="flex items-center rounded-full border border-border/60 bg-card-raised/90 p-[3px] shadow-card transition-shadow duration-200 hover:shadow-dropdown"
						>
							<UserMenu member={member()} org={org()} />
						</div>
					</div>
				{/if}
			</div>
		</header>
	{/if}
	{@render children?.()}
</div>
