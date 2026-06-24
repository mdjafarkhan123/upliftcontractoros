CREATE TABLE "catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"unit_price" numeric(12, 2) NOT NULL,
	"unit" varchar(50),
	"unit_cost" numeric(12, 2),
	"category" varchar(100),
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "unit_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "source_catalog_item_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_created_by_org_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_catalog_items_org_id" ON "catalog_items" USING btree ("org_id");--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_source_catalog_item_id_catalog_items_id_fk" FOREIGN KEY ("source_catalog_item_id") REFERENCES "public"."catalog_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Tenant isolation: every tenant table enforces org scoping at the DB layer.
-- Only a SELECT policy for `authenticated` is needed — all writes go through the
-- server's privileged connection, which bypasses RLS. Guarded so re-running is a no-op.
ALTER TABLE "catalog_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies
		WHERE tablename = 'catalog_items'
		AND policyname = 'catalog_items: members select own org items'
	) THEN
		CREATE POLICY "catalog_items: members select own org items"
			ON "catalog_items" AS PERMISSIVE FOR SELECT TO "authenticated"
			USING (org_id = get_my_org_id());
	END IF;
END $$;