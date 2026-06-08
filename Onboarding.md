# Contractor Onboarding & Phone System Plan

# (Final — Production-Ready, Dynamic, Claude-Optimized)

---

## THE BIG PICTURE

When a contractor logs in for the first time, they do not see the dashboard.

They are guided through a **step-by-step onboarding wizard** to ensure  
their business profile is properly set up.

The onboarding is **dynamic and configuration-driven**:

- If SMS is **enabled** → Phone setup is shown (optional)
- If SMS is **disabled** → Phone setup is completely hidden

Goal:

> No friction. No irrelevant steps. Premium, adaptive experience.

---

## PART 1: ACCOUNT STATUS FLOW

Each contractor organization has a status:

1. `pending_setup` → Must complete onboarding
2. `active` → Full access
3. `suspended` → Locked (billing/policy)
4. `pending_deletion` → Scheduled removal
5. `deleted` → Permanently remove

**Rule:**  
If `pending_setup`, user is always redirected to onboarding (no bypass).

---

## PART 2: FEATURE FLAG (SYSTEM CONTROL)

In `/jafar/org`, Platform Owner controls:
Sms enable/disable by toggle button.

This flag affects:

- Onboarding steps
- UI visibility
- Messaging behavior
- Banner logic

---

## PART 3: ONBOARDING FLOW (DYNAMIC)

### ALWAYS SHOWN

#### Step 1 — Change Password (Forced)

- Required before proceeding

---

#### Step 2 — Business Profile

- Company name(Required)
- Trade type
- Address
- Country(Required)
- Timezone (required)

Country determines:

- Phone availability
- Compliance requirements

---

### CONDITIONAL (ONLY IF SMS is enabled)

#### Step 3 — Business Phone Setup (Optional)

User chooses:

**A) Get a Business Number (Recommended)**

- Enter ZIP / Postal code
- Select from available numbers (Twilio)
- System:
  - Creates subaccount
  - Purchases number
  - Assigns to org

**B) Skip for Now**

- No number created
- SMS features remain hidden
- Can complete later in Settings → Integrations

Limit: 1 number per organization

---

#### Step 4 — Carrier Approval (Only if Number Purchased)

**United States**

- 10DLC registration required
- Requires:
  - Legal business name
  - Address
  - EIN
  - Website
  - Messaging use case

**Canada**

- CWTA registration
- Requires:
  - Business name
  - Canadian address
  - Business Number

**Other Countries**

- No additional registration required (v1, subject to Twilio rules)
- SMS works immediately if supported
  **Approval Time**

- US: 3–7 days
- Canada: 3–5 days
- Others: Instant (if supported)

---

### FINAL STEP (ALWAYS SHOWN)

#### Step 5 — Branding (Optional)

- Logo
- Colors
- Business hours
- Skippable

---

## PART 4: POST-ONBOARDING STATES

### Case A — SMS Disabled

- No SMS UI shown
- No phone system active
- Clean CRM-only experience

---

### Case B — SMS Enabled + No Number

- No SMS features available
- Banner shown:
  "SMS is now available. Set up your business number."
- CTA → Settings → Integrations (mini onboarding)

---

### Case C — Number Purchased + Pending Approval

Can:

- Receive calls ✅
- Make calls ✅
- Receive SMS ✅

Cannot:

- Send outbound SMS ❌

---

### Case D — Fully Approved

- Full SMS functionality enabled
- Automations + manual messaging active

---

## PART 5: SMS TOGGLE BEHAVIOR (PO CONTROLLED)

### When SMS is TURNED ON

| Contractor State                    | Behavior                                         |
| ----------------------------------- | ------------------------------------------------ |
| No number                           | Show banner → "SMS now available" → CTA to setup |
| Has number + approved               | Silent resume (no banner)                        |
| Has number + pending approval       | Show "Approval still pending" banner             |
| Has number but system/balance issue | SMS remains blocked until resolved               |

---

### When SMS is TURNED OFF

| Contractor State | Behavior                                     |
| ---------------- | -------------------------------------------- |
| Any              | Outbound SMS fully blocked                   |
| Any              | Inbound SMS still received by system         |
| Any              | Inbound SMS is **stored but hidden from UI** |
| Any              | No data deleted                              |

When re-enabled:

- Messages resume normally
- Hidden inbound messages become visible again

---

## PART 6: RED BANNER LOGIC

### Show ONLY when ALL conditions are true:

- SMS enabled = true
- Number exists
- Approval pending (US/Canada)

Message:

"SMS Messaging Pending Approval. Your number is active for calls and incoming texts. Outbound SMS will be enabled after approval (5 - 10 business days)."

Behavior:

- Dismissible
- Reappears on refresh/login

---

### DO NOT SHOW when:

- No number exists → show setup banner instead
- SMS disabled → no banner at all
- SMS approved → no banner

---

## PART 7: SETTINGS → INTEGRATIONS (MINI ONBOARDING)

Reuses onboarding components.

### States:

**No Number**

- "Set up business number" CTA

---

**Number + Pending**

- Show number
- Status: Pending approval
- Banner active

---

**Number + Approved**

- Status: Active
- Full SMS unlocked

---

**SMS Disabled**

- "SMS is currently disabled. Contact your account manager."

---

**Unsupported Country**

- "SMS not available in your region"

---

## PART 8: RE-ENABLE EDGE CASE (CRITICAL)

If:

- SMS was ON → turned OFF → turned ON again

Then:

- If number exists → DO NOT show setup again
- Resume previous state:
  - Approved → full access
  - Pending → show pending banner
- If no number → show setup banner

---

## PART 9: GLOBAL COUNTRY RULES

| Country Type      | SMS Behavior                     | Compliance   |
| ----------------- | -------------------------------- | ------------ |
| USA               | Gated until 10DLC approved       | Required     |
| Canada            | Gated until CWTA approved        | Required     |
| UK, AU, etc.      | Works immediately (if supported) | Minimal      |
| Bangladesh, India | Availability varies              | Check Twilio |
| Unsupported       | Hidden                           | N/A          |

---

## PART 10: COMPLIANCE SYSTEM

- Consent tracking (required)
- STOP/UNSUBSCRIBE auto-handled
- Quiet hours enforced
- Transactional vs promotional logic

System enforces automatically.

---

## PART 11: MASTER BALANCE SAFETY

If Twilio balance is low:

- Outbound SMS paused globally
- Messages queued (not lost)
- Resume after recharge ( already built, we added a button there)

Note:  
SMS resumes only if:

- Balance restored
- Account in good standing

---

## KEY PRINCIPLES

- Do not force behavior
- Hide irrelevant complexity
- Use feature flags for control
- Design for edge cases
- Enable future monetization via SMS activation
