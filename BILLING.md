# Billing Badges for the Jobs List

## Goal

The Jobs list should help contractors quickly identify which jobs need billing or payment attention.

Keep it simple.

Each job should display **at most one billing badge**. The badge should tell the contractor the **single most important next action**. Do not show multiple billing badges on the same job.

The badge is only for visibility. It is **not** the job status.

Job status and billing status are separate.

---

# Billing Badges

Use only these four billing badges.

## 1. Needs Invoice

**Purpose**

The contractor needs to create or send the next invoice.

This badge should be used for:

- Completed one-off jobs with no invoice yet.
- Progress billing when the next invoice can now be created.
- Milestone billing when the next invoice is due.
- Draft invoices that have not been sent yet.

The contractor should not need to know _why_ the invoice is needed. The important thing is:

> "I need to invoice this customer."

---

## 2. Awaiting Payment

**Purpose**

An invoice has been sent, but money is still outstanding.

This includes:

- No payment received.
- Partial payment received.
- Multiple invoices where money is still owed.

The contractor's next action is:

> "Wait for payment or follow up."

---

## 3. Overdue

**Purpose**

An invoice is overdue and still has an outstanding balance.

This badge should have the highest priority because overdue payments require immediate attention.

The contractor's next action is:

> "Follow up with the customer."

---

## 4. Paid

**Purpose**

The total amount for the job has been collected.

No further billing action is required.

---

# Payment Progress

Payment Progress is **not** a badge.

It is a small progress bar shown when any money has been collected but the job is not fully paid.

Example:

$4,000 of $10,000 collected

or

40% collected

This helps contractors instantly understand how much money has already been received.

Do not show the progress bar once the job is fully paid.

---

# Badge Priority

Only one billing badge should appear on a job.

If multiple conditions match, show the highest priority badge.

Priority order:

1. Overdue
2. Needs Invoice
3. Awaiting Payment
4. Paid

---

# When Each Badge Appears

| Situation                                              | Show             |
| ------------------------------------------------------ | ---------------- |
| Job is not ready for billing yet                       | Nothing          |
| Next invoice can now be created or sent                | Needs Invoice    |
| Invoice has been sent and payment is still outstanding | Awaiting Payment |
| Invoice is overdue                                     | Overdue          |
| Job is fully paid                                      | Paid             |

---

# Payment Progress Rules

| Situation                                 | Progress Bar |
| ----------------------------------------- | ------------ |
| No payment received                       | Hide         |
| Some payment received and balance remains | Show         |
| Fully paid                                | Hide         |

---

# One-off Jobs

One-off jobs use the billing badges normally.

Examples:

- Completed job with no invoice → Needs Invoice
- Invoice sent → Awaiting Payment
- Invoice overdue → Overdue
- Fully paid → Paid

---

# Recurring Jobs

Recurring jobs should follow the same badge system.

The badge should represent the **next billing action**, not the recurring schedule.

For example:

- A completed visit that needs an invoice → Needs Invoice
- Invoice sent → Awaiting Payment
- Invoice overdue → Overdue
- Fully paid for that billing cycle → Paid

Do not create different badge names just because the job is recurring.

---

# Cancelled Jobs

Cancelled jobs never show billing badges.

---

# Important Design Principles

- Keep the wording simple and contractor-friendly.
- Do not expose accounting terminology like "Milestone Due."
- Do not create separate badge names for one-off and recurring jobs.
- The badge should always describe the contractor's next action.
- Payment Progress gives additional detail but never replaces the badge.
- Keep the interface clean by showing only one billing badge per job.

---

# Contractor Experience

A contractor should be able to scan the Jobs list and immediately understand:

- Which jobs need an invoice.
- Which jobs are waiting for payment.
- Which customers are overdue.
- Which jobs are completely paid.

The contractor should never need to think about invoices, milestones, payment schedules, or accounting rules. Those are handled by the system. The Jobs list should simply tell them what needs attention next.
