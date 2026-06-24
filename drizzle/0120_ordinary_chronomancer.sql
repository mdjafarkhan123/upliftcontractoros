CREATE TABLE "job_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"line_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"details" text,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit" varchar(50),
	"section_label" varchar(100),
	"unit_price" numeric(12, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"source_catalog_item_id" uuid,
	"total" numeric(12, 2) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "job_type" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "subtotal" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discount_type" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discount_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discount_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discount_label" varchar(60);--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tax_rate" numeric(5, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "total" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_line_items" ADD CONSTRAINT "job_line_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_line_items" ADD CONSTRAINT "job_line_items_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_line_items" ADD CONSTRAINT "job_line_items_source_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("source_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_job_line_items_job_id" ON "job_line_items" USING btree ("job_id");