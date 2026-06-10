-- Stage 3: flexible/apex sending domain. The sending prefix is now optional —
-- when NULL the org sends from the root domain (info@theirbusiness.com) instead
-- of a forced `contact.` subdomain. The receiving prefix stays NOT NULL: Brevo
-- inbound MX cannot live on the apex without hijacking the contractor's real
-- mailbox, so replies always route through a dedicated sibling subdomain.
ALTER TABLE "email_domains" ALTER COLUMN "sending_prefix" DROP NOT NULL;
