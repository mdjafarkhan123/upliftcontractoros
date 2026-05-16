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
	<div
		class="relative flex min-h-[calc(100vh-env(safe-area-inset-top))] items-center justify-center overflow-hidden bg-background px-4 py-10"
	>
		<!-- Background grid -->
		<div
			class="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,hsl(var(--border)/0.5)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.5)_1px,transparent_1px)] [background-size:36px_36px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
			aria-hidden="true"
		></div>

		<!-- Ambient brand glow -->
		<div
			class="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-[hsl(var(--brand-primary)/0.18)] blur-3xl"
			aria-hidden="true"
		></div>

		<div class="relative z-10 w-full max-w-[460px]">
			<!-- Org brand mark -->
			<div class="mb-8 flex items-center justify-center gap-2.5">
				{#if org().logo_url}
					<img
						src={org().logo_url}
						alt={org().name}
						class="h-8 w-8 rounded-md object-cover ring-1 ring-border"
					/>
				{:else}
					<div
						class="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground"
						aria-hidden="true"
					>
						{org().name.charAt(0).toUpperCase()}
					</div>
				{/if}
				<span class="text-[14px] font-semibold tracking-tight text-foreground">
					{org().name}
				</span>
			</div>

			<!-- Main card -->
			<div
				class="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_0_hsl(var(--foreground)/0.04),0_8px_24px_-12px_hsl(0_0%_0%/0.5)]"
			>
				<!-- Top accent line -->
				<div
					class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--status-pending)/0.7)] to-transparent"
					aria-hidden="true"
				></div>

				<div class="px-7 pb-7 pt-9 sm:px-9 sm:pb-9 sm:pt-11">
					<!-- Status pill -->
					<div class="flex items-center justify-center">
						<div
							class="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--status-pending)/0.35)] bg-[hsl(var(--status-pending)/0.12)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--status-pending))]"
						>
							<span class="relative flex h-1.5 w-1.5">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--status-pending))] opacity-60"
								></span>
								<span
									class="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--status-pending))]"
								></span>
							</span>
							Suspended
						</div>
					</div>

					<!-- Headline -->
					<h1
						class="mt-6 text-center text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground sm:text-[28px]"
					>
						Account temporarily suspended
					</h1>
					<p
						class="mx-auto mt-4 max-w-[360px] text-center text-[14px] leading-relaxed text-muted-foreground"
					>
						Your organization's access has been temporarily restricted. Please contact support
						or resolve your billing issue to restore access.
					</p>
					<p class="mt-2 text-center text-[12px] text-muted-foreground/80">
						Your data has not been deleted.
					</p>

					<!-- Metadata block -->
					<div class="mt-8 overflow-hidden rounded-xl border border-border bg-muted/40">
						<dl class="divide-y divide-border text-[13px]">
							<div class="flex items-center justify-between px-4 py-3">
								<dt class="text-muted-foreground">Workspace</dt>
								<dd class="font-medium text-foreground">{org().name}</dd>
							</div>
							<div class="flex items-center justify-between px-4 py-3">
								<dt class="text-muted-foreground">Status</dt>
								<dd
									class="font-mono text-[12px] font-medium uppercase tracking-wide text-[hsl(var(--status-pending))]"
								>
									suspended
								</dd>
							</div>
							{#if deletionDate}
								<div class="flex items-center justify-between px-4 py-3">
									<dt class="text-muted-foreground">Scheduled deletion</dt>
									<dd class="font-mono text-[12px] font-medium text-destructive">
										{formatDate(deletionDate)}
									</dd>
								</div>
							{/if}
							<div class="flex items-center justify-between px-4 py-3">
								<dt class="text-muted-foreground">Data retention</dt>
								<dd class="text-[12.5px] font-medium text-[hsl(var(--status-active))]">
									Preserved
								</dd>
							</div>
						</dl>
					</div>

					{#if deletionDate}
						<div
							class="mt-4 flex items-start gap-2.5 rounded-lg border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.1)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[hsl(var(--destructive))]"
						>
							<svg
								class="mt-0.5 h-4 w-4 flex-shrink-0"
								viewBox="0 0 20 20"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									fill-rule="evenodd"
									d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
									clip-rule="evenodd"
								/>
							</svg>
							<div>
								<p class="font-semibold">Scheduled for deletion</p>
								<p class="mt-1 opacity-90">
									Your organization is scheduled for deletion on
									<span class="font-medium">{formatDate(deletionDate)}</span>
									if the suspension is not resolved.
								</p>
							</div>
						</div>
					{/if}

					<!-- Actions -->
					<div class="mt-7 flex flex-col gap-2">
						<a
							href="mailto:support@contractoros.com"
							class="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13.5px] font-medium text-primary-foreground shadow-[inset_0_1px_0_hsl(0_0%_100%/0.12)] transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
						>
							Contact support
							<svg
								class="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M3 8h10M9 4l4 4-4 4" />
							</svg>
						</a>
						<form method="POST" action="/auth/logout">
							<button
								type="submit"
								class="inline-flex h-11 w-full items-center justify-center rounded-lg border border-border bg-secondary text-[13.5px] font-medium text-secondary-foreground transition-all duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
							>
								Log out
							</button>
						</form>
					</div>
				</div>
			</div>

			<p class="mt-6 text-center text-[12px] text-muted-foreground/70">
				© {new Date().getFullYear()} Contractor OS
			</p>
		</div>
	</div>
{/if}
