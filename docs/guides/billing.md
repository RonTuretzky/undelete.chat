# Plans, trials, and billing

How the free trial works, what a subscription covers, and how to cancel.

<a id="trial"></a>

## Your free trial

Every new workspace starts with a free trial. No payment method is needed to connect accounts and keep deleted messages during the trial. Settings → Your plan shows the exact end date.

When the trial ends without a subscription, the watch pauses: hosted connections stop and new events wait at the collector. Deleted messages already in your archive stay available to read, search, and export, and nothing already kept is deleted by the pause. Retention settings still apply as usual.

<a id="subscribe"></a>

## Starting a subscription

1. Open Settings → Your plan and choose Start subscription, or Add payment method during the trial.
2. Complete checkout on Stripe’s secure page. undelete.chat never sees your card number; it receives only a customer reference and the subscription status.
3. Return to undelete.chat. The plan card updates once Stripe confirms the subscription, usually within a few seconds.
4. If any connection shows Capture stopped, open Connections and choose Resume capture.

> Adding a payment method during the trial does not shorten it. The first charge happens when the trial ends.

<a id="premium"></a>

## Premium: trusted execution environments

On the standard plan, stored messages are sealed to a key only you hold and the server cannot read them, but the collector that keeps your account linked runs on the server and sees each message for the instant it arrives. Premium is for people who need that last step covered too: the collectors run inside a confidential-computing enclave (a trusted execution environment) with keys sealed to attested hardware, so operators, backups, and the hosting provider cannot see messages even at the moment of capture.

Premium is arranged individually and can include dedicated capacity, more linked accounts, a longer watch window, priority support, and a written data-handling agreement. Email turetzkyron@gmail.com with the accounts you want to link and roughly how many people need it; expect a reply within two business days.

<a id="manage"></a>

## Invoices, payment methods, and cancellation

Manage billing opens Stripe’s customer portal, where you can download invoices, change the payment method, or cancel. A cancelled subscription keeps watching until the end of the paid period, shown as Access ends in Settings; you can reactivate before then.

If a payment fails, the watch continues for a short grace period while Stripe retries. Update the payment method from Manage billing to avoid a pause.

Deleting your account cancels the subscription and removes the archive; see the privacy guide for what deletion covers.

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
