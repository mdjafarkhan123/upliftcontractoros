ALTER TABLE "automation_settings" ADD COLUMN "job_on_my_way_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_on_my_way_sms_message" text NOT NULL DEFAULT 'Hi {contact_name}, this is {org_name} — we''re on our way to you now for your "{job_title}". See you soon!';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_on_my_way_sms_message" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_on_my_way_email_subject" text NOT NULL DEFAULT 'We''re on our way — {job_title}';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_on_my_way_email_subject" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_on_my_way_email_message" text NOT NULL DEFAULT E'Hi {contact_name},\n\nJust a heads up that we''re on our way to you now for your "{job_title}".\n\nSee you soon!\n\nThanks,\n{org_name}';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_on_my_way_email_message" DROP DEFAULT;
