-- =============================================================================
-- BOOKING SCHEMA — canonical
-- Generated from live Supabase database introspection (source of truth).
-- This file documents the structure already present in production.
-- RLS policies live in a separate migration and are NOT included here.
-- =============================================================================

CREATE TYPE booking_source AS ENUM ('internal', 'booking_link');

-- -----------------------------------------------------------------------------
-- booking_links
-- -----------------------------------------------------------------------------

CREATE TABLE booking_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  slug text NOT NULL,
  title text NOT NULL DEFAULT 'Book an Appointment'::text,
  description text,
  appointment_type appointment_type NOT NULL DEFAULT 'estimate'::appointment_type,
  slot_duration_minutes integer NOT NULL DEFAULT 60,
  buffer_minutes integer NOT NULL DEFAULT 0,
  min_advance_hours integer NOT NULL DEFAULT 4,
  max_future_days integer NOT NULL DEFAULT 60,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_links ADD CONSTRAINT booking_links_pkey PRIMARY KEY (id);
ALTER TABLE booking_links ADD CONSTRAINT booking_links_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id);
ALTER TABLE booking_links ADD CONSTRAINT booking_links_slot_duration_minutes_check CHECK ((slot_duration_minutes > 0));
ALTER TABLE booking_links ADD CONSTRAINT booking_links_buffer_minutes_check CHECK ((buffer_minutes >= 0));
ALTER TABLE booking_links ADD CONSTRAINT booking_links_min_advance_hours_check CHECK ((min_advance_hours >= 0));
ALTER TABLE booking_links ADD CONSTRAINT booking_links_max_future_days_check CHECK ((max_future_days > 0));

CREATE INDEX idx_booking_links_org_id ON public.booking_links USING btree (org_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX idx_booking_links_org_slug ON public.booking_links USING btree (org_id, slug) WHERE (deleted_at IS NULL);

-- -----------------------------------------------------------------------------
-- availability_windows
-- -----------------------------------------------------------------------------

CREATE TABLE availability_windows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_link_id uuid NOT NULL,
  day_of_week smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE availability_windows ADD CONSTRAINT availability_windows_pkey PRIMARY KEY (id);
ALTER TABLE availability_windows ADD CONSTRAINT availability_windows_booking_link_id_fkey FOREIGN KEY (booking_link_id) REFERENCES booking_links(id) ON DELETE CASCADE;
ALTER TABLE availability_windows ADD CONSTRAINT availability_windows_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));
ALTER TABLE availability_windows ADD CONSTRAINT chk_availability_windows_end_after_start CHECK ((end_time > start_time));

CREATE INDEX idx_availability_windows_link_id ON public.availability_windows USING btree (booking_link_id);

-- -----------------------------------------------------------------------------
-- availability_overrides
-- -----------------------------------------------------------------------------

CREATE TABLE availability_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_link_id uuid NOT NULL,
  override_date date NOT NULL,
  is_blocked boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE availability_overrides ADD CONSTRAINT availability_overrides_pkey PRIMARY KEY (id);
ALTER TABLE availability_overrides ADD CONSTRAINT availability_overrides_booking_link_id_fkey FOREIGN KEY (booking_link_id) REFERENCES booking_links(id) ON DELETE CASCADE;
ALTER TABLE availability_overrides ADD CONSTRAINT availability_overrides_booking_link_id_override_date_key UNIQUE (booking_link_id, override_date);
ALTER TABLE availability_overrides ADD CONSTRAINT chk_override_hours_valid CHECK (((is_blocked = true) OR ((is_blocked = false) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time))));

CREATE INDEX idx_availability_overrides_link_date ON public.availability_overrides USING btree (booking_link_id, override_date);

-- =============================================================================
-- ALTER organizations — feature_online_booking
-- =============================================================================

ALTER TABLE organizations ADD COLUMN feature_online_booking boolean NOT NULL DEFAULT false;

-- =============================================================================
-- ALTER appointments — booking attribution columns
-- =============================================================================

ALTER TABLE appointments ADD COLUMN booked_via_link_id uuid;
ALTER TABLE appointments ADD COLUMN customer_name text;
ALTER TABLE appointments ADD COLUMN customer_phone text;
ALTER TABLE appointments ADD COLUMN customer_email text;
ALTER TABLE appointments ADD COLUMN customer_notes text;
ALTER TABLE appointments ADD COLUMN booking_source booking_source NOT NULL DEFAULT 'internal'::booking_source;
ALTER TABLE appointments ADD COLUMN booking_referrer text;

ALTER TABLE appointments ADD CONSTRAINT appointments_booked_via_link_id_fkey FOREIGN KEY (booked_via_link_id) REFERENCES booking_links(id);
