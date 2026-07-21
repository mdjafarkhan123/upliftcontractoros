# Stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Framework        | SvelteKit 2 + Svelte 5 (runes)                       |
| Rendering        | CSR only — `ssr = false` globally                    |
| Database         | PostgreSQL via Supabase + Drizzle ORM + postgres.js  |
| Auth             | Supabase SSR + JWT + bcryptjs + otplib (TOTP)        |
| Queue            | BullMQ + ioredis (Redis)                             |
| Cron             | node-cron                                            |
| Email            | Resend                                               |
| SMS              | Twilio                                               |
| Storage          | Cloudflare R2 (S3-compatible — `@aws-sdk/client-s3`) |
| Image processing | Sharp                                                |
| PDF              | Puppeteer                                            |
| UI primitives    | Shadcn Svelte                                        |
| Validation       | Zod                                                  |
| Styling          | Tailwind CSS + Custom CSS                            |
