CREATE TABLE "quote_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"package_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "package_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_package_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_packages" ADD CONSTRAINT "quote_packages_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_packages" ADD CONSTRAINT "quote_packages_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_package_id_quote_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."quote_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quote_packages_quote_id" ON "quote_packages" USING btree ("quote_id");
