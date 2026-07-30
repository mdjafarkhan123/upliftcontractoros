Below, I have listed how we should improve our current invoice features. We will reuse any existing component that fits instead of duplicating or recreating. That's our goal. No guesswork.

---

Currently, we don't have a signature pad in our invoice, but top industry players do. We will add it.

In Jobber's Invoice draft mode, clicking the 'More' button (ours is the 3-dot menu) shows a popup (`ref/invoice/1.jpg`) with several options: Mark as sent, Create similar invoice, Preview as client, Collect signature (we don't need this; we will add the signature block directly to the details page), Print or Save PDF, Collect Payment (we don't need this option either; we will add a payment block directly on the invoice details page), and Delete. However, we currently don't offer any of these options until the invoice is sent, which is incorrect. We need to follow Jobber's logic.

When we click 'Mark as sent', the invoice status flips to 'Awaiting Payment' at that moment.

### Payment Section

We will add a payment block to our invoice, which by default looks like `ref/invoice/2.jpg`. You can see this is an empty state. When a client makes a payment, a list will appear here. We can also manually enter a payment item by clicking the 'Add payment' button. Clicking that button opens a popup like `ref/invoice/3.jpg`. We will add one extra field called 'Details', where we can provide additional information about this payment. Clicking the 'Payment type' option reveals a dropdown like `ref/invoice/4.jpg`, and we will include all of those options.

Once a payment record is created, the tab looks like `ref/invoice/5.jpg`, which includes a delete button to remove a record.

#### Payment Logic

The status should be marked as 'Paid' if the full invoice amount is paid. If the full amount is not paid, the status should not flip. If it is paid in full, it flips instantly.

I am confused about handling overpayment and will leave that decision to you. However, before implementing it, you must present your proposed approach to me. Here is my confusion: can an invoice's payment records total more than the original invoice amount? When a user adds a manual payment, they can enter any amount. Should the total of payment records be allowed to exceed the invoice amount? We have tip and overdue Fees. So analyze and brings a solutions to me.
