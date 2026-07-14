ALTER TABLE "automation_settings" ADD COLUMN "job_scheduled_confirmation_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_scheduled_sms_message" text NOT NULL DEFAULT 'Hi {contact_name}, your "{job_title}" with {org_name} is scheduled for {scheduled_datetime}. We''ll see you then!';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_scheduled_sms_message" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_scheduled_email_subject" text NOT NULL DEFAULT 'Your "{job_title}" is scheduled';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_scheduled_email_subject" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD COLUMN "job_scheduled_email_message" text NOT NULL DEFAULT E'Hi {contact_name},\n\nThis confirms your "{job_title}" with {org_name} is scheduled for {scheduled_datetime}.\n\nIf you need to make a change, just reply to this email.\n\nThanks,\n{org_name}';--> statement-breakpoint
ALTER TABLE "automation_settings" ALTER COLUMN "job_scheduled_email_message" DROP DEFAULT;
