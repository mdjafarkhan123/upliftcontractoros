# Project Structure

```
project root
  worker.ts                   ← Standalone worker process. Never touched by SvelteKit.
  tailwind.config.ts          ← Tailwind config — extends Shadcn Svelte defaults
  components.json             ← Shadcn Svelte CLI config (paths, aliases, style)

src/
src/
  lib/
    server/                   ← Server-only. Never imported in .svelte files.
      db/
        schema/               ← Drizzle schema files (one per domain)
        client.ts             ← Drizzle client
      auth/                   ← Session helpers
      permissions/            ← checkPermission utility + PermissionKey type
      queue/                  ← BullMQ connection + queue definitions
      workers/                ← outboxWorker, automationWorker, notificationWorker
      cron/                   ← Cron job registrations
      media/                  ← R2 upload/delete helpers
      org/                    ← Org deletion cascade
    components/               ← Feature components, one folder per domain
      shared/                 ← SkeletonLoader, EmptyState, PageWrapper, Badge, etc.
    styles/
      app.css                 ← Tailwind base imports + CSS custom properties (colors, spacing, bottom-nav height, touch target minimum)
    types/                    ← Shared TypeScript types
    utils/
      phone.ts                ← E.164 normalization
      format.ts               ← Currency, date, quote/invoice number formatters
      hash.ts                 ← SHA-256 helper
  routes/
    (app)/                    ← Protected contractor routes
    jafar/                    ← Super admin (fully isolated)
    api/                      ← All API server routes
    auth/                     ← Login, logout, forgot-password
    q/                        ← Public quote routes (no auth)
    change-password/

worker.ts                     ← Standalone worker process entry point (project root)
drizzle.config.ts             ← Points to schema/index.ts and DATABASE_URL

```
