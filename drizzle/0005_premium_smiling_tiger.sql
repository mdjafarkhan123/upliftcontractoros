ALTER TABLE "media" ADD COLUMN "scan_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "sha256_hash" text;--> statement-breakpoint
CREATE INDEX "idx_media_sha256_hash" ON "media" USING btree ("sha256_hash");--> statement-breakpoint
CREATE INDEX "idx_media_scan_status" ON "media" USING btree ("scan_status");