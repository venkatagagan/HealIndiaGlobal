**DRAFT — for review by qualified Indian legal counsel; not legal advice.**

> Placeholders appear as `[[...]]`. Paragraphs marked **Drafting note** are for counsel and the product team
> only and must be removed before publication. The refund tiers below mirror the platform setting
> `refund_policy` (PLAN §6.3); if finance changes that setting, this policy must change with it.

# Heal India Global — Refund & Cancellation Policy

| | |
|---|---|
| Version | `2026-10-21-draft.1` (part of the [Terms of Service](TERMS_OF_SERVICE.md); accepted with the `terms` consent) |
| Effective date | [[EFFECTIVE DATE]] |
| Source setting | `refund_policy = [{days_before: 14, refund_pct: 100}, {days_before: 7, refund_pct: 50}, {days_before: 0, refund_pct: 0}]` |

## Summary

| If you cancel a treatment booking… | You get back |
|---|---|
| **14 or more days** before your admission date | **100%** of what you paid for the booking |
| **7 to 13 days** before | **50%** |
| **Fewer than 7 days** before, or on or after the admission date | **No refund** |
| The **hospital or we** cancel (not because you broke our Terms) | **100%** |

- Refunds go back to the original payment method, in the currency you paid.
- We do not deduct our payment-processing fees from these refunds.
- Banks usually take **5–15 business days** to show a refund once we have sent it.

---

## 1. What this policy covers

1.1 This policy applies to payments made through the Heal India Global Platform for:

- (a) **treatment bookings** — deposits, balances, full payments and installments;
- (b) **teleconsultation fees**; and
- (c) **travel and local services** booked through the Platform (accommodation, airport transfers, local
  transport, translators, local guides).

1.2 It does not cover payments you make directly to a hospital or Service Provider outside the Platform, government
visa fees, or flights and hotels you book yourself. Those follow the terms of whoever you paid.

1.3 The policy in force when your booking is **confirmed** applies to that booking.

> **Drafting note:** 1.3 requires the backend to store the refund tiers on the booking at confirmation. At the
> moment `POST /bookings/{id}/cancel` reads the *current* `refund_policy` setting, so a later change by finance
> would apply retroactively (README, implementation item 9).

## 2. Cancelling a treatment booking

2.1 **How to cancel.** In the app, open the booking and choose **Cancel booking**, giving a reason. Your
coordinator or your agent (with your authorisation) can also cancel for you. Your cancellation takes effect on
the date we receive it.

2.2 **How we count days.** "Days before admission" means the number of calendar days from the date we receive your
cancellation to your scheduled admission date, both counted in India Standard Time (IST).

2.3 **Refund tiers.**

| Days before your admission date when we receive your cancellation | Refund |
|---|---|
| 14 days or more | 100% of the amounts paid for the booking |
| 7 to 13 days | 50% of the amounts paid for the booking |
| 0 to 6 days, or after the admission date has passed | No refund |

**Example.** Your admission date is 30 November. If we receive your cancellation on 16 November (14 days before),
you get 100%. On 20 November (10 days before), you get 50%. On 25 November (5 days before), there is no refund.

2.4 **What the percentage applies to.** The total you have paid through the Platform for that booking — deposit,
balance, full payment and installments — minus anything already refunded. [[We currently charge no patient
service fee; if one is introduced, state here whether it is refundable.]]

2.5 **Unpaid bookings.** A booking still "pending payment" can be cancelled at any time at no charge; there is
nothing to refund.

2.6 **Installment plans.** When you cancel, any installments not yet due are cancelled, and the refund tier applies
to the installments you have already paid.

2.7 Once you have been admitted, a booking can no longer be cancelled in the app. Section 4 explains what happens
if treatment does not go ahead or ends early.

> **Drafting note:** The 0% tier means a patient who prepaid the full amount (not just the 20% deposit) and
> cancels within 7 days loses everything, even though the hospital may not yet have incurred costs. Counsel to
> assess whether this forfeiture is reasonable under the Consumer Protection Act, 2019 (unfair contract terms,
> s.2(46)) and, for EU patients, the Unfair Contract Terms Directive. Options: cap the retention at the deposit,
> or at the hospital's documented non-recoverable costs. Also decide who keeps retained amounts (hospital,
> platform or both); the ledger currently has no posting for them (README, implementation item 10).

## 3. When you get a full refund regardless of timing

3.1 You receive 100% of the amounts paid through the Platform for the booking if:

- (a) the **hospital cancels** your booking or cannot provide the treatment on the agreed date, and you do not
  accept an alternative date or hospital offered to you;
- (b) **we cancel** your booking for a reason other than your breach of our Terms (for example because the
  hospital's listing is suspended);
- (c) you paid **twice by mistake**, or paid more than the amount due.

3.2 **Special circumstances** [[business decision — proposed default]]. We will refund 100% of the amounts paid,
minus documented non-recoverable costs the hospital has already incurred for you with your agreement (for example
a custom implant ordered for you), if before admission:

- (a) your **visa is refused** and you send us the refusal notice, provided you applied on time with complete
  documents;
- (b) the **treating doctor decides** that the treatment is not suitable for you (for example after a
  teleconsultation or after reviewing new reports); or
- (c) the patient **dies or becomes seriously ill** and cannot travel, supported by medical evidence.

3.3 **Events outside anyone's control.** If government travel bans, border closures, natural disasters, war or
epidemics prevent you from travelling, we will offer you [[a free change of date with the same hospital, or a
refund under 3.2]].

> **Drafting note:** The Consumer Protection (E-Commerce) Rules, 2020 prohibit cancellation charges on a consumer
> unless the e-commerce entity bears similar charges when it cancels unilaterally. Counsel to advise whether the
> hospital/platform must pay the patient a matching amount when *they* cancel (beyond the full refund in 3.1), and
> whether the platform is an "e-commerce entity" for these purposes (README Q6). The backend currently applies the
> tier calculation whoever cancels; full refunds under 3.1 and 3.2 need either a cancellation-reason flag or a
> manual finance refund (README, implementation item 8).

## 4. If treatment does not go ahead, or ends early, after admission

4.1 If, after examining you, the treating doctor decides that the treatment should not go ahead, or your treatment
ends earlier than planned, the hospital will bill only for the services actually provided. Once we receive the
hospital's final bill, we will refund the difference between what you paid through the Platform and that bill.

4.2 **Final bill reconciliation.** If the hospital's final bill for the agreed scope is lower than what you paid
through the Platform, we refund the difference. If it is higher because you agreed to additional treatment, the
hospital will tell you how to pay the difference.

4.3 We aim to decide refunds under this section within [[10 business days]] of receiving the hospital's final bill.

## 5. Changing your admission date

Please contact your coordinator **before** cancelling. We and the hospital will try to agree a new date. This
depends on availability and is not guaranteed. [[If a new date is agreed at least 14 days before the original
admission date, there is no charge.]] If no change can be agreed, the cancellation rules in section 2 apply.

## 6. Teleconsultation fees [[proposed defaults — business to confirm]]

| Situation | Refund |
|---|---|
| You cancel at least 24 hours before the scheduled time | 100% |
| You cancel less than 24 hours before, or do not join | No refund |
| The doctor or hospital cancels, does not join, or the consultation fails for a technical reason on our or the hospital's side | 100%, or a free new appointment — your choice |

> **Drafting note:** Consultation refunds are not driven by the `refund_policy` setting. They need a manual
> finance refund (`POST /payments/refunds`) or a dedicated rule in be-cases/be-payments.

## 7. Travel, accommodation and local services

7.1 These services are provided by independent Service Providers whose cancellation terms apply. We show those terms
with the quote before you confirm.

7.2 If you cancel, we refund whatever the Service Provider refunds to us for your booking [[minus any non-refundable
amount shown before you confirmed]].

7.3 If a service does not happen because of the Service Provider's fault, we will help you get a replacement or a
refund from them.

## 8. How refunds are paid

8.1 **To the original payment method.** Refunds go back to the card, UPI account, net-banking account, wallet or
bank account you paid from. For bank transfers, we refund to the account that sent the money and may ask you to
confirm its details. We cannot refund to anyone else's account unless the law requires it.

8.2 **If someone else paid.** If an agent, relative or employer paid for you, the refund goes back to them. An agent
who receives a refund for your booking must pass it on to you promptly under its agreement with us.

8.3 **Currency and exchange rates.** We calculate the refund in the booking currency (usually Indian rupees) and pay
it in the currency you paid, using the exchange rate recorded when you paid. So a 100% refund returns the same
amount, in your currency, that you were charged — before any charges your own bank applies. Your bank or card
issuer may use its own exchange rate and fees, so the amount credited in your home currency may differ from the
amount originally debited. We are not responsible for exchange-rate movements or for fees charged by your bank or
card issuer.

8.4 **Fees.** We do not deduct our payment-gateway processing fees from refunds under this policy. We cannot refund
fees charged by your own bank or card issuer (for example foreign-transaction or currency-conversion fees), or
charges deducted by intermediary or receiving banks on international bank transfers. [[We pay our own bank's
charges for sending a refund by international transfer.]]

> **Drafting note:** 8.3 and 8.4 must match the payments module: refunds computed in the booking currency and
> converted back using the original order's `fx_rate`; gateway fees absorbed as `EXPENSE:GATEWAY_FEES` (PLAN
> §6.4), not deducted. If finance decides to deduct gateway or bank charges, change both the code and this text.

## 9. How long refunds take

| Step | Timing |
|---|---|
| Refund under the tiers in section 2, or under 3.1 | We start it within [[2 business days]] of your cancellation |
| Refund that needs review (sections 3.2, 3.3, 4 and 6) | We decide within [[10 business days]] of receiving the documents we need, and start it within [[2 business days]] of approval |
| Card payments (Indian cards) | Usually 5–7 business days after we start the refund |
| International cards | Usually 7–21 business days; it can take up to one billing cycle to appear on your statement |
| UPI, net banking and wallets | Usually 3–7 business days |
| International bank transfers | Usually 5–15 business days |

You can follow progress in the app: **requested → approved → processing → processed**. If a refund fails (for
example because the card has been closed) or is rejected, we will tell you why and ask for alternative details.

**Failed payments.** If your account was debited but the payment failed, your bank or the payment provider normally
reverses it automatically within [[5–7]] business days. Contact us if it does not arrive.

## 10. Chargebacks and payment disputes

Please contact us before disputing a payment with your bank — we can usually resolve problems faster. If you raise a
chargeback while a refund is already being processed, the refund may be delayed, and if you receive both we will ask
you to return the duplicate amount. We will give your bank the booking and treatment records needed to respond to a
dispute.

## 11. Questions and complaints

Contact your coordinator or [[SUPPORT EMAIL]]. If you are not satisfied, contact our Grievance Officer
([[GRIEVANCE OFFICER NAME]], [[GRIEVANCE OFFICER EMAIL]], [[GRIEVANCE OFFICER PHONE]]). We acknowledge complaints
within 24 hours and resolve them within one month at the latest. This policy does not affect your statutory rights,
including the right to approach a consumer commission in India or the consumer protections of the country where you
live.

## 12. Changes to this policy

We may change this policy. A change applies only to bookings confirmed after it takes effect, unless it is in your
favour. We will publish each version with its date.
