# Reputation Feature — Plain-English Gap Analysis

**Date:** 2026-07-25  
**Purpose:** Explain what Contractor OS already has, what is missing compared with leading contractor CRM products, why each gap matters, and what we should build next.

## 1. What “Reputation” means

Reputation is more than asking a customer for a Google review. A complete reputation feature helps a contractor:

1. Ask customers for honest feedback after work is completed.
2. Make it easy for customers to review the business publicly.
3. Follow up without annoying customers.
4. See reviews from different websites in one place.
5. Reply to reviews quickly and professionally.
6. Learn from unhappy customers before problems become larger.
7. Show positive reviews on the contractor’s website and sales materials.

Jobber, HighLevel, and Housecall Pro all cover several of these areas. Contractor OS currently covers the first few steps, but not the complete operating system.

## 2. What Contractor OS already has

The current implementation is not empty. It already includes a useful foundation:

- Review requests connected to completed jobs.
- A public customer review link.
- SMS sending through the worker and outbox system.
- Reminder and nudge messages.
- One review request per job.
- Customer star ratings.
- Private negative feedback.
- Review-request status tracking.
- Event history such as opened, rated, reminded, and attributed.
- Reputation summary cards and funnel reporting.
- Permission checks for viewing reviews, sending requests, and viewing negative feedback.

The main problem is that the current feature is narrowly focused on collecting reviews through one funnel. The leading products have expanded this into a broader reputation-management workspace.

## 3. Intentional product decision: route unhappy customers privately

### What the current flow does

The customer first chooses a rating:

- A 4–5 star rating sends the customer to Google.
- A 1–3 star rating stays inside Contractor OS as private feedback.

This is commonly called **review gating**. It means the business publicly asks only the happiest customers for a review.

### Why this is a business decision

This is the intended Reputation experience for Contractor OS:

- Happy customers are sent to the Google review route.
- Unhappy customers are sent to a private feedback and recovery route.

This protects the contractor from losing an opportunity to recover an unhappy customer. It also gives the team a chance to understand and solve the problem privately.

HighLevel documents similar sentiment-based workflow patterns: positive feedback can enter review, testimonial, or advocacy workflows, while negative feedback can trigger support escalation and follow-up actions. See [HighLevel’s customer-feedback workflow examples](https://help.gohighlevel.com/support/solutions/articles/155000005885-workflow-action-intent-detection).

### Important platform risk

Google’s policy says businesses must not discourage negative reviews or selectively ask only for positive reviews. Google expects reviews to represent genuine and unbiased customer experiences. Violating this policy can lead to reviews being removed or a Business Profile being restricted.

See Google’s official guidance:

- [Prohibited and restricted content](https://support.google.com/contributionpolicy/answer/7400114)
- [Rating manipulation](https://support.google.com/contributionpolicy/answer/16597280)
- [Tips to get more Google reviews](https://support.google.com/business/answer/3474122)

### Our intentional direction

We will keep the intentional two-route funnel:

1. Ask the customer for a private satisfaction rating.
2. Route unhappy customers to private feedback and recovery.
3. Route happy customers to the configured Google review destination.

This decision must be treated as a deliberate product/business trade-off. It should not be described as Google-policy compliant. The implementation should also make the routing transparent to the organization owner and preserve clear audit history for the customer’s rating, route, and follow-up actions.

## 4. Gap 1 — Only one review destination

### What leading products do

HighLevel supports multiple review destinations and can balance requests between them. Housecall Pro supports distributions such as Google, Facebook, and the contractor’s own review page. Jobber focuses on Google but connects directly to the Google Business Profile.

Sources:

- [HighLevel review-link balancing](https://help.gohighlevel.com/support/solutions/articles/155000004137-review-request-balancing-across-platforms)
- [Housecall Pro review distribution](https://help.housecallpro.com/en/articles/11481139-reviews-faqs)

### What we do today

Contractor OS stores one Google review link in automation settings. The public flow sends the customer to that single link.

### Why it matters

Different contractors depend on different platforms. A business may need Google, Facebook, Yelp, an industry-specific site, or its own testimonial page. Supporting only one destination limits the feature and makes future integrations harder.

### Recommended direction

Create a review-platform model where each organization can configure destinations such as:

- Google Business Profile.
- Facebook.
- Website testimonials.
- Other supported platforms later.

The first version does not need every platform. It should be designed so adding another platform does not require redesigning the entire feature.

## 5. Gap 2 — No connected review synchronization

### What leading products do

Jobber connects to Google Business Profile and imports review information into its dashboard. HighLevel connects review platforms and displays reviews inside the CRM.

### What we do today

Our `reviews` table stores review records, but the main workflow does not pull reviews directly from Google or another provider. The organization’s Google review count is manually entered and compared with the previous count.

### Why it matters

Manual counting is slow and unreliable. It also means the contractor cannot see the actual review text, reviewer, platform, reply status, or external review identifier inside the CRM.

### Recommended direction

Add provider-ready synchronization with:

- External platform name.
- External review ID.
- Reviewer display name.
- Review score and text.
- Review creation time.
- Reply status.
- Last synchronization time.
- Organization or location connected to the review.

The existing manual attribution system can remain as a temporary fallback, but it should not be the long-term primary method.

## 6. Gap 3 — No unified review inbox or response workflow

### What leading products do

HighLevel lets users view and respond to reviews from the Reputation area. Its newer tools can suggest or automatically draft replies, with controls for tone and timing.

Google itself recommends replying professionally and promptly to both positive and negative reviews. [Google review-management guidance](https://support.google.com/business/answer/3474050)

### What we do today

Contractor OS displays internal review records and private feedback, but it does not provide a complete workflow for replying to public reviews on the source platform.

### Why it matters

A review is not the end of the process. A public response shows future customers that the contractor pays attention. Negative reviews are especially important because a calm, helpful response can protect trust.

### Recommended direction

Add review actions such as:

- Reply manually.
- Save a reply draft.
- Mark a review as handled.
- Flag a review for an owner or manager.
- Generate an optional response suggestion later.
- Never automatically publish AI responses without a clear approval setting in the first version.

## 7. Gap 4 — Limited request triggers

### What leading contractor products do

Jobber supports review requests after a completed visit, closed job, or paid invoice. Housecall Pro supports sending after a job is finished or after the job is fully paid.

Sources:

- [Jobber Reviews](https://help.getjobber.com/hc/en-us/articles/20621046897559-Reviews-Marketing-Tools)
- [Housecall Pro Reviews FAQs](https://help.housecallpro.com/en/articles/11481139-reviews-faqs)

### What we do today

Our automated flow is primarily connected to job completion. Manual requests can be sent for eligible completed jobs.

### Why it matters

Different trades define the best moment differently. A cleaning company may ask after a visit. A remodeling company may wait until the job is closed. A contractor may want to wait until the final invoice is fully paid.

### Recommended direction

Allow the organization to choose a trigger:

- Visit completed.
- Job completed or closed.
- Invoice fully paid.
- Manual request only.

The system must prevent duplicate requests when a job has multiple visits or invoices.

## 8. Gap 5 — SMS-first delivery without a complete fallback

### What leading products do

Housecall Pro sends by SMS and email. If a customer has no mobile number, it uses email instead. Jobber also allows text and email settings for review asks and follow-ups.

### What we do today

Contractor OS’s review-request workflow is centered on SMS and checks SMS opt-out.

### Why it matters

Some customers do not have a mobile number, do not consent to SMS, or prefer email. Without a fallback, the contractor loses a review opportunity.

### Recommended direction

Support a clear delivery policy:

- SMS when an eligible mobile number exists and the customer has not opted out.
- Email when SMS is unavailable or disabled.
- Both channels only when explicitly configured.
- Separate delivery history for each channel.

Every delivery must still go through the outbox and worker system so messages remain reliable and auditable.

## 9. Gap 6 — Fixed follow-up timing

### What leading products do

Jobber sends follow-ups several days after the original request and allows the business to configure the follow-up messages and channel. HighLevel allows request cadence, retry timing, and templates to be configured.

### What we do today

Our system has a standard reminder and two nudge paths, with timing and message fields defined in the current settings.

### Why it matters

A contractor may want one reminder, two reminders, or no reminder. A high-volume business may need strict limits. A premium service may use email instead of repeated SMS.

### Recommended direction

Represent a review-request campaign as a small sequence of configurable steps:

- Delay after the selected trigger.
- Channel.
- Message template.
- Maximum number of attempts.
- Allowed sending hours.
- Stop conditions such as completed review, opt-out, or resolved request.

The first implementation can keep a simple fixed sequence while making the data model ready for configuration.

## 10. Gap 7 — No customer-level review-request preference

### What leading products do

Jobber lets an organization disable review asks for an individual client.

### What we do today

Contractor OS respects SMS opt-out, but that is not the same as “do not ask me for reviews.”

### Why it matters

A customer may want to continue receiving appointment texts but not receive review requests. These are separate preferences.

### Recommended direction

Add a customer-level review-request preference with clear choices:

- Allow review requests.
- Do not send review requests.
- Ask again later, if the business intentionally supports this.

The preference must be checked by automated and manual sends.

## 11. Gap 8 — No setup wizard or health checklist

### What leading products do

HighLevel provides a guided setup wizard that helps users connect review platforms, configure links, send a first request, enable review-response tools, and create widgets.

### What we do today

The organization can configure a Google review link and review-funnel settings, but the user is not guided through a complete setup process.

### Why it matters

Reputation features fail silently when the link is missing, the sending channel is not configured, or the review feature is disabled. A novice user needs to know exactly what is ready and what is missing.

### Recommended direction

Add a setup checklist showing:

- Review feature enabled.
- At least one review destination configured.
- SMS configured.
- Email configured.
- At least one request trigger selected.
- Message templates ready.
- First review request sent.

## 12. Gap 9 — No public review showcase or widget system

### What leading products do

HighLevel provides review widgets that can display connected Google and Facebook reviews on websites. Jobber also allows selected customer reviews to appear in quotes.

Sources:

- [HighLevel review widgets](https://help.gohighlevel.com/support/solutions/articles/48001222766-reputation-management-customizing-displaying-the-review-widget)
- [Jobber reviews in quotes](https://help.getjobber.com/hc/en-us/articles/7760313735575/Quotes-in-the-Jobber-App)

### What we do today

Contractor OS can display review information inside the application, but Reputation is not yet a complete public proof system.

### Why it matters

Reviews help win new work. Contractors should be able to reuse trustworthy reviews on their website, quote pages, and other customer-facing surfaces.

### Recommended direction

Later, add a controlled review showcase with:

- Only approved reviews.
- Platform and date information.
- Organization branding.
- A public embed or hosted page.
- Removal or hiding controls without deleting the source review.

This should come after synchronization and response workflows.

## 13. Gap 10 — Attribution is useful but not enough

### What we do today

The attribution engine compares a manually entered Google review count with the previous count and probabilistically links new reviews to recent engaged requests.

### Why it is useful

It gives us a reasonable fallback when direct provider synchronization is unavailable.

### Why it is not enough

It cannot reliably identify:

- Which exact customer left the review.
- The review text.
- The external review ID.
- Whether the business replied.
- Whether the review was edited or removed.
- Which platform it came from.

The UI must continue to describe these matches as probable, not certain. Direct provider synchronization should eventually become the source of truth.

## 14. Recommended build order

### Phase 1 — Formalize and strengthen the intentional funnel

- Keep the intentional positive-to-public and negative-to-private routing.
- Clearly label the workflow as a reputation-risk decision during setup.
- Preserve private feedback and recovery as the primary unhappy-customer path.
- Record the customer rating and selected route in the event history.
- Add customer-level review-request opt-out.
- Add email fallback.
- Add configurable trigger selection.
- Preserve outbox, worker, permission, tenant, and deduplication rules.

### Phase 2 — Make Reputation operational

- Add review-platform configuration.
- Add provider-ready review records and external IDs.
- Add Google synchronization.
- Add a unified review inbox.
- Add manual public-response tracking.

### Phase 3 — Make Reputation a growth tool

- Add setup wizard and health checklist.
- Add review widgets and approved testimonials.
- Add optional AI reply suggestions with human approval.
- Add multi-location support.
- Add deeper reporting and competitor insights.

## 15. Plain-English glossary

| Term | Meaning |
| --- | --- |
| Review request | A message asking a customer to leave feedback or a public review. |
| Review funnel | The steps from sending the request to opening, rating, and reviewing. |
| Review gating | Sending only happy customers to a public review site. This is the risky behavior we should remove. |
| Provider | A review platform such as Google or Facebook. |
| Synchronization | Regularly importing current review information from a provider. |
| Attribution | Trying to determine which review request led to a new public review. |
| Outbox | A safe internal queue that records work before an external message is sent. |
| Fallback channel | A second delivery method, such as email when SMS cannot be used. |
| Unified inbox | One screen showing reviews from multiple platforms. |

## Conclusion

Contractor OS has a good technical foundation for review requests, but its Reputation feature is currently focused on one Google-oriented feedback funnel. To match leading contractor CRMs, we should first make the flow unbiased and compliant, then add delivery flexibility, configurable triggers, provider synchronization, public response management, and review reuse.

The safest product direction is: **ask every customer honestly, help the contractor resolve unhappy experiences, make public reviews easy, and manage every platform from one place.**
