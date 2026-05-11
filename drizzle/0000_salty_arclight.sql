-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TYPE "public"."address_label" AS ENUM('billing', 'service', 'mailing', 'other');--> statement-breakpoint
CREATE TYPE "public"."appointment_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."appointment_type" AS ENUM('estimate', 'job_start', 'follow_up', 'inspection', 'other');--> statement-breakpoint
CREATE TYPE "public"."automation_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."automation_job_type" AS ENUM('missed_call_textback', 'speed_to_lead', 'quote_followup', 'invoice_reminder', 'review_request', 'appointment_reminder');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('lead', 'customer', 'archived');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('sms', 'missed_call', 'email', 'webchat');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."growth_feed_type" AS ENUM('gbp_post', 'seo', 'social', 'website', 'blog', 'review_response', 'monthly_summary');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."lead_source_type" AS ENUM('website_form', 'live_chat', 'missed_call', 'manual', 'referral', 'other');--> statement-breakpoint
CREATE TYPE "public"."media_purpose_tag" AS ENUM('job_photo', 'before', 'after', 'marketing_asset', 'quote_attachment', 'invoice_attachment');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('photo', 'pdf', 'attachment');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'manager', 'member');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('sms', 'email', 'webchat');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'delivered', 'failed', 'received', 'queued', 'bounced');--> statement-breakpoint
CREATE TYPE "public"."org_status" AS ENUM('active', 'suspended', 'pending_deletion', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."outbox_event_status" AS ENUM('pending', 'processing', 'processed', 'failed', 'dead_lettered');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('stripe', 'cash', 'check', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."review_request_status" AS ENUM('pending', 'sent', 'responded', 'failed', 'no_response');--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"title" text NOT NULL,
	"value" numeric(12, 2),
	"assigned_to" uuid,
	"lost_reason" text,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"trade_type" text NOT NULL,
	"twilio_phone_number" text NOT NULL,
	"status" "org_status" DEFAULT 'active' NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"stripe_restricted_key" text,
	"stripe_publishable_key" text,
	"stripe_webhook_secret" text,
	"stripe_account_id" text,
	"stripe_connected_at" timestamp with time zone,
	"logo_url" text,
	"primary_color" text,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"suspended_at" timestamp with time zone,
	"deletion_scheduled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_setup_complete" boolean DEFAULT false NOT NULL,
	CONSTRAINT "organizations_slug_key" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "automation_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"missed_call_textback_enabled" boolean DEFAULT true NOT NULL,
	"missed_call_textback_message" text DEFAULT 'Hi! We missed your call. We''ll be in touch shortly — or reply here and we''ll get back to you right away.' NOT NULL,
	"quote_followup_enabled" boolean DEFAULT true NOT NULL,
	"quote_followup_delay_1_hours" integer DEFAULT 24 NOT NULL,
	"quote_followup_delay_2_hours" integer DEFAULT 72 NOT NULL,
	"quote_followup_message" text DEFAULT 'Hi {contact_name}, just following up on the quote we sent. Any questions? We''re happy to help.' NOT NULL,
	"invoice_reminder_enabled" boolean DEFAULT true NOT NULL,
	"invoice_reminder_delay_days" integer DEFAULT 3 NOT NULL,
	"invoice_reminder_message" text DEFAULT 'Hi {contact_name}, just a reminder that your invoice is due. Please don''t hesitate to reach out if you have any questions.' NOT NULL,
	"review_funnel_enabled" boolean DEFAULT true NOT NULL,
	"review_funnel_delay_hours" integer DEFAULT 2 NOT NULL,
	"review_funnel_message" text DEFAULT 'Hi {contact_name}, thank you for choosing us! How did we do today? Reply with a number from 1–5.' NOT NULL,
	"appointment_reminder_enabled" boolean DEFAULT true NOT NULL,
	"appointment_reminder_hours_before" integer DEFAULT 24 NOT NULL,
	"appointment_reminder_message" text DEFAULT 'Hi {contact_name}, just a reminder about your appointment tomorrow. Reply STOP to opt out.' NOT NULL,
	"speed_to_lead_enabled" boolean DEFAULT true NOT NULL,
	"speed_to_lead_message" text DEFAULT 'Hi {contact_name}, thanks for reaching out! We''ll get back to you shortly.' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"label" "address_label" DEFAULT 'service' NOT NULL,
	"address_line_1" text NOT NULL,
	"address_line_2" text,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"zip" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_addresses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pipeline_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"position" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supabase_user_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"avatar_url" text,
	"role" "member_role" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"can_view_dashboard" boolean DEFAULT false NOT NULL,
	"can_view_revenue" boolean DEFAULT false NOT NULL,
	"can_view_pipeline_snapshot" boolean DEFAULT false NOT NULL,
	"can_view_all_conversations" boolean DEFAULT false NOT NULL,
	"can_view_assigned_conversations" boolean DEFAULT false NOT NULL,
	"can_send_messages" boolean DEFAULT false NOT NULL,
	"can_delete_conversations" boolean DEFAULT false NOT NULL,
	"can_view_all_contacts" boolean DEFAULT false NOT NULL,
	"can_create_contacts" boolean DEFAULT false NOT NULL,
	"can_edit_contacts" boolean DEFAULT false NOT NULL,
	"can_delete_contacts" boolean DEFAULT false NOT NULL,
	"can_view_full_pipeline" boolean DEFAULT false NOT NULL,
	"can_move_pipeline_stages" boolean DEFAULT false NOT NULL,
	"can_create_opportunities" boolean DEFAULT false NOT NULL,
	"can_view_all_quotes" boolean DEFAULT false NOT NULL,
	"can_create_quotes" boolean DEFAULT false NOT NULL,
	"can_send_quotes" boolean DEFAULT false NOT NULL,
	"can_edit_quotes" boolean DEFAULT false NOT NULL,
	"can_delete_quotes" boolean DEFAULT false NOT NULL,
	"can_view_all_invoices" boolean DEFAULT false NOT NULL,
	"can_create_invoices" boolean DEFAULT false NOT NULL,
	"can_send_invoices" boolean DEFAULT false NOT NULL,
	"can_record_payments" boolean DEFAULT false NOT NULL,
	"can_delete_invoices" boolean DEFAULT false NOT NULL,
	"can_view_all_appointments" boolean DEFAULT false NOT NULL,
	"can_view_assigned_appointments" boolean DEFAULT false NOT NULL,
	"can_create_appointments" boolean DEFAULT false NOT NULL,
	"can_reschedule_appointments" boolean DEFAULT false NOT NULL,
	"can_view_reviews" boolean DEFAULT false NOT NULL,
	"can_send_review_requests" boolean DEFAULT false NOT NULL,
	"can_view_negative_feedback" boolean DEFAULT false NOT NULL,
	"can_view_growth_feed" boolean DEFAULT false NOT NULL,
	"can_view_all_files" boolean DEFAULT false NOT NULL,
	"can_upload_files" boolean DEFAULT false NOT NULL,
	"can_delete_files" boolean DEFAULT false NOT NULL,
	"can_view_team_members" boolean DEFAULT false NOT NULL,
	"can_create_team_members" boolean DEFAULT false NOT NULL,
	"can_edit_team_members" boolean DEFAULT false NOT NULL,
	"can_delete_team_members" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text NOT NULL,
	"tags" text[] DEFAULT '{""}' NOT NULL,
	"status" "contact_status" DEFAULT 'lead' NOT NULL,
	"assigned_to" uuid,
	"sms_opt_out" boolean DEFAULT false NOT NULL,
	"sms_opt_out_at" timestamp with time zone,
	"sms_opt_out_source" text,
	"sms_opted_in_at" timestamp with time zone,
	"lead_source" "lead_source_type" DEFAULT 'manual' NOT NULL,
	"notes" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contact_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "job_status" DEFAULT 'scheduled' NOT NULL,
	"assigned_to" uuid,
	"notes" text,
	"scope_of_work" text,
	"service_address_line_1" text,
	"service_address_line_2" text,
	"service_address_city" text,
	"service_address_state" text,
	"service_address_zip" text,
	"scheduled_start" timestamp with time zone,
	"scheduled_end" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"subject" text,
	"assigned_to" uuid,
	"last_message_at" timestamp with time zone,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"tags" text[] DEFAULT '{""}' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"channel" "message_channel" NOT NULL,
	"body" text,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"media_urls" text[],
	"status" "message_status" NOT NULL,
	"twilio_message_sid" text,
	"sent_by" uuid,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"opportunity_id" uuid,
	"issued_by" uuid,
	"quote_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deposit_required" boolean DEFAULT false NOT NULL,
	"deposit_amount" numeric(12, 2),
	"notes" text,
	"internal_notes" text,
	"public_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"declined_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"ip_hash" text,
	"user_agent_hash" text,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"notification_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "quote_template_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_template_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"job_id" uuid,
	"opportunity_id" uuid,
	"quote_id" uuid,
	"issued_by" uuid,
	"invoice_number" integer NOT NULL,
	"title" text NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax_rate" numeric(5, 4) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_due" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"due_date" date,
	"stripe_payment_link_url" text,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"stripe_payment_intent_id" text,
	"notes" text,
	"recorded_by" uuid,
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"job_id" uuid,
	"assigned_to" uuid,
	"type" "appointment_type" NOT NULL,
	"status" "appointment_status" DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone,
	"location" text,
	"notes" text,
	"reminder_24h_sent" boolean DEFAULT false NOT NULL,
	"reminder_1h_sent" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" "review_request_status" DEFAULT 'pending' NOT NULL,
	"sent_by_automation" boolean DEFAULT false NOT NULL,
	"sent_by_member_id" uuid,
	"response_score" integer,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_requests_response_score_check" CHECK ((response_score >= 1) AND (response_score <= 5))
);
--> statement-breakpoint
ALTER TABLE "review_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"review_request_id" uuid,
	"score" integer NOT NULL,
	"platform" text,
	"body" text,
	"review_url" text,
	"google_review_link_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_score_check" CHECK ((score >= 4) AND (score <= 5))
);
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "private_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"review_request_id" uuid,
	"score" integer NOT NULL,
	"body" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_feedback_score_check" CHECK ((score >= 1) AND (score <= 3))
);
--> statement-breakpoint
ALTER TABLE "private_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"job_id" uuid,
	"quote_id" uuid,
	"invoice_id" uuid,
	"r2_key" text NOT NULL,
	"thumbnail_key" text,
	"web_key" text,
	"original_filename" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"media_type" "media_type" NOT NULL,
	"mime_type" text NOT NULL,
	"purpose_tag" "media_purpose_tag" NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_must_have_parent" CHECK ((job_id IS NOT NULL) OR (quote_id IS NOT NULL) OR (invoice_id IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "growth_feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "growth_feed_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"is_monthly_summary" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "growth_feed_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "internal_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "internal_activity_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"type" "automation_job_type" NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"bull_job_id" text NOT NULL,
	"status" "automation_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_event_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"sequence" serial NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone,
	"last_error" text,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_counters" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"next_quote_number" integer DEFAULT 1 NOT NULL,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_settings" ADD CONSTRAINT "automation_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_addresses" ADD CONSTRAINT "contact_addresses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stages" ADD CONSTRAINT "pipeline_stages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_views" ADD CONSTRAINT "quote_views_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_views" ADD CONSTRAINT "quote_views_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_templates" ADD CONSTRAINT "quote_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_template_line_items" ADD CONSTRAINT "quote_template_line_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_template_line_items" ADD CONSTRAINT "quote_template_line_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."quote_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_sent_by_member_id_fkey" FOREIGN KEY ("sent_by_member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_review_request_id_fkey" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_feedback" ADD CONSTRAINT "private_feedback_review_request_id_fkey" FOREIGN KEY ("review_request_id") REFERENCES "public"."review_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "growth_feed_items" ADD CONSTRAINT "growth_feed_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_activity_log" ADD CONSTRAINT "internal_activity_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_counters" ADD CONSTRAINT "org_counters_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_opportunities_assigned_to" ON "opportunities" USING btree ("assigned_to" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_opportunities_contact_id" ON "opportunities" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_opportunities_org_id" ON "opportunities" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_opportunities_stage_id" ON "opportunities" USING btree ("stage_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_organizations_status" ON "organizations" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_organizations_twilio_phone" ON "organizations" USING btree ("twilio_phone_number" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_automation_settings_org_id" ON "automation_settings" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_contact_addresses_contact_id" ON "contact_addresses" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_contact_addresses_org_id" ON "contact_addresses" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contact_addresses_primary" ON "contact_addresses" USING btree ("contact_id" uuid_ops) WHERE ((is_primary = true) AND (deleted_at IS NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_stages_one_default" ON "pipeline_stages" USING btree ("org_id" uuid_ops) WHERE ((is_default = true) AND (deleted_at IS NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_stages_one_lost" ON "pipeline_stages" USING btree ("org_id" uuid_ops) WHERE ((is_lost = true) AND (deleted_at IS NULL));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_stages_one_won" ON "pipeline_stages" USING btree ("org_id" uuid_ops) WHERE ((is_won = true) AND (deleted_at IS NULL));--> statement-breakpoint
CREATE INDEX "idx_pipeline_stages_org_id" ON "pipeline_stages" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_stages_position" ON "pipeline_stages" USING btree ("org_id" int4_ops,"position" int4_ops) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_members_org_email" ON "org_members" USING btree ("org_id" uuid_ops,"email" text_ops) WHERE (deleted_at IS NULL);--> statement-breakpoint
CREATE INDEX "idx_org_members_org_id" ON "org_members" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_members_supabase_user_id" ON "org_members" USING btree ("supabase_user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_contacts_org_id" ON "contacts" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_contacts_org_phone" ON "contacts" USING btree ("org_id" uuid_ops,"phone" text_ops);--> statement-breakpoint
CREATE INDEX "idx_contacts_status" ON "contacts" USING btree ("org_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_contacts_tags" ON "contacts" USING gin ("tags" array_ops);--> statement-breakpoint
CREATE INDEX "idx_contact_notes_contact_id" ON "contact_notes" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_contact_notes_org_id" ON "contact_notes" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jobs_assigned_to" ON "jobs" USING btree ("assigned_to" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jobs_contact_id" ON "jobs" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_jobs_opportunity_id" ON "jobs" USING btree ("opportunity_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jobs_org_id" ON "jobs" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jobs_scheduled_start" ON "jobs" USING btree ("org_id" uuid_ops,"scheduled_start" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_jobs_status" ON "jobs" USING btree ("org_id" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_assigned_to" ON "conversations" USING btree ("assigned_to" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_contact_id" ON "conversations" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_last_message_at" ON "conversations" USING btree ("org_id" timestamptz_ops,"last_message_at" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_conversations_open_contact_channel" ON "conversations" USING btree ("contact_id" enum_ops,"channel" uuid_ops) WHERE ((deleted_at IS NULL) AND (status = 'open'::conversation_status));--> statement-breakpoint
CREATE INDEX "idx_conversations_org_id" ON "conversations" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_conversations_status" ON "conversations" USING btree ("org_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_direction_read" ON "messages" USING btree ("conversation_id" timestamptz_ops,"direction" uuid_ops,"read_at" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_messages_org_id" ON "messages" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_messages_twilio_sid" ON "messages" USING btree ("twilio_message_sid" text_ops) WHERE (twilio_message_sid IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_quotes_contact_id" ON "quotes" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quotes_opportunity_id" ON "quotes" USING btree ("opportunity_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quotes_org_id" ON "quotes" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_quotes_org_number" ON "quotes" USING btree ("org_id" uuid_ops,"quote_number" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quotes_status" ON "quotes" USING btree ("org_id" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_quotes_token_hash" ON "quotes" USING btree ("public_token_hash" text_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_line_items_org_id" ON "quote_line_items" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_line_items_quote_id" ON "quote_line_items" USING btree ("quote_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_views_org_id" ON "quote_views" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_views_quote_id" ON "quote_views" USING btree ("quote_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_templates_org_id" ON "quote_templates" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_template_line_items_org_id" ON "quote_template_line_items" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_quote_template_line_items_template_id" ON "quote_template_line_items" USING btree ("template_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_invoices_contact_id" ON "invoices" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_invoices_due_date" ON "invoices" USING btree ("org_id" date_ops,"due_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_invoices_job_id" ON "invoices" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_invoices_org_id" ON "invoices" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_invoices_org_number" ON "invoices" USING btree ("org_id" uuid_ops,"invoice_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("org_id" uuid_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice_id" ON "invoice_line_items" USING btree ("invoice_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_org_id" ON "invoice_line_items" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_payments_invoice_id" ON "payments" USING btree ("invoice_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_payments_org_id" ON "payments" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_payments_stripe_intent" ON "payments" USING btree ("stripe_payment_intent_id" text_ops) WHERE (stripe_payment_intent_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_appointments_assigned_to" ON "appointments" USING btree ("assigned_to" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_contact_id" ON "appointments" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_job_id" ON "appointments" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_org_id" ON "appointments" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_reminders" ON "appointments" USING btree ("scheduled_start" timestamptz_ops) WHERE ((reminder_24h_sent = false) OR (reminder_1h_sent = false));--> statement-breakpoint
CREATE INDEX "idx_appointments_scheduled_start" ON "appointments" USING btree ("org_id" uuid_ops,"scheduled_start" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_review_requests_contact_id" ON "review_requests" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_review_requests_job_id" ON "review_requests" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_review_requests_org_id" ON "review_requests" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_reviews_contact_id" ON "reviews" USING btree ("contact_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_reviews_job_id" ON "reviews" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_reviews_org_id" ON "reviews" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_private_feedback_job_id" ON "private_feedback" USING btree ("job_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_private_feedback_org_id" ON "private_feedback" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_media_invoice" ON "media" USING btree ("invoice_id" uuid_ops) WHERE (invoice_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_media_job" ON "media" USING btree ("job_id" uuid_ops) WHERE (job_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_media_org_id" ON "media" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_media_purpose_tag" ON "media" USING btree ("org_id" enum_ops,"purpose_tag" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_media_quote" ON "media" USING btree ("quote_id" uuid_ops) WHERE (quote_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_media_uploaded_by" ON "media" USING btree ("uploaded_by" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_growth_feed_org_id" ON "growth_feed_items" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_growth_feed_published_at" ON "growth_feed_items" USING btree ("org_id" timestamptz_ops,"published_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_internal_activity_log_created_at" ON "internal_activity_log" USING btree ("org_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_internal_activity_log_org_id" ON "internal_activity_log" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_automation_jobs_org_id" ON "automation_jobs" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_automation_jobs_resource" ON "automation_jobs" USING btree ("resource_type" text_ops,"resource_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_automation_jobs_status" ON "automation_jobs" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_automation_jobs_type" ON "automation_jobs" USING btree ("type" enum_ops,"status" enum_ops);--> statement-breakpoint
CREATE INDEX "idx_outbox_events_dead_lettered" ON "outbox_events" USING btree ("org_id" uuid_ops,"dead_lettered_at" uuid_ops) WHERE (status = 'dead_lettered'::outbox_event_status);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_outbox_events_idempotency_key" ON "outbox_events" USING btree ("idempotency_key" text_ops);--> statement-breakpoint
CREATE INDEX "idx_outbox_events_org_id" ON "outbox_events" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_outbox_events_worker_poll" ON "outbox_events" USING btree ("status" timestamptz_ops,"available_at" enum_ops) WHERE (status = 'pending'::outbox_event_status);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_org_counters_org_id" ON "org_counters" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_created_at" ON "notifications" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_notifications_idempotency_key" ON "notifications" USING btree ("idempotency_key" text_ops) WHERE (idempotency_key IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_notifications_member_id" ON "notifications" USING btree ("member_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_org_id" ON "notifications" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_unread" ON "notifications" USING btree ("member_id" timestamptz_ops,"read_at" uuid_ops) WHERE (read_at IS NULL);--> statement-breakpoint
CREATE POLICY "opportunities: full pipeline access" ON "opportunities" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_full_pipeline
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true)));--> statement-breakpoint
CREATE POLICY "opportunities: assigned member access" ON "opportunities" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "organizations: members select own org" ON "organizations" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "automation_settings: members select own org settings" ON "automation_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "contact_addresses: members select own org addresses" ON "contact_addresses" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "pipeline_stages: members select own org stages" ON "pipeline_stages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "org_members: members select own org roster" ON "org_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (is_active = true) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "contacts: members select own org contacts" ON "contacts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "contact_notes: members select own org notes" ON "contact_notes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "jobs: full job list access" ON "jobs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_full_pipeline
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true)));--> statement-breakpoint
CREATE POLICY "jobs: assigned member access" ON "jobs" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "conversations: full inbox access" ON "conversations" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_all_conversations
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true)));--> statement-breakpoint
CREATE POLICY "conversations: assigned member access" ON "conversations" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "messages: members select own org messages" ON "messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "quotes: members select own org quotes" ON "quotes" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "quote_line_items: members select own org line items" ON "quote_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "quote_views: members select own org quote views" ON "quote_views" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "quote_templates: members select own org templates" ON "quote_templates" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "quote_template_line_items: members select own org template item" ON "quote_template_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "invoices: members select own org invoices" ON "invoices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "invoice_line_items: members select own org line items" ON "invoice_line_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "payments: members select own org payments" ON "payments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "appointments: full appointment list access" ON "appointments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL) AND (( SELECT org_members.can_view_all_appointments
   FROM org_members
  WHERE ((org_members.supabase_user_id = auth.uid()) AND (org_members.is_active = true) AND (org_members.deleted_at IS NULL))
 LIMIT 1) = true)));--> statement-breakpoint
CREATE POLICY "appointments: assigned member access" ON "appointments" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "review_requests: members select own org review requests" ON "review_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "reviews: members select own org reviews" ON "reviews" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "private_feedback: members select own org feedback" ON "private_feedback" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "media: members select own org media metadata" ON "media" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((org_id = get_my_org_id()) AND (deleted_at IS NULL)));--> statement-breakpoint
CREATE POLICY "growth_feed_items: members select own org feed" ON "growth_feed_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((org_id = get_my_org_id()));--> statement-breakpoint
CREATE POLICY "notifications: members select own notifications only" ON "notifications" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((member_id = get_my_member_id()));
*/