# Hospital walkthrough - screen checklist

Video: `hospital-walkthrough.mp4` (5:43). Each row is a screen shown in the video.

| # | Time | Screen | Screenshot |
|---|---|---|---|
| 1 | 0:00 | Intro | - |
| 2 | 0:11 | Sign in (website door) | [01-login.png](screenshots/01-login.png) |
| 3 | 0:20 | Dashboard - hero | [02-dashboard.png](screenshots/02-dashboard.png) |
| 4 | 0:27 | Dashboard - stats & charts | - |
| 5 | 0:36 | Dashboard - recent enquiries | [03-dashboard-recent.png](screenshots/03-dashboard-recent.png) |
| 6 | 0:41 | Enquiries & cases - list with status tabs | [04-cases-list.png](screenshots/04-cases-list.png) |
| 7 | 0:49 | Enquiries & cases - filters (New) | [05-cases-filter-new.png](screenshots/05-cases-filter-new.png) |
| 8 | 0:58 | Case detail - patient | - |
| 9 | 1:04 | Case detail - AI screening summary | [06-case-detail.png](screenshots/06-case-detail.png) |
| 10 | 1:15 | Case detail - confirmed AI report readings | [07-case-report-readings.png](screenshots/07-case-report-readings.png) |
| 11 | 1:27 | Case detail - medical documents | [08-case-documents.png](screenshots/08-case-documents.png) |
| 12 | 1:32 | Decline enquiry dialog (cancelled) | [09-case-decline-dialog.png](screenshots/09-case-decline-dialog.png) |
| 13 | 1:41 | Quote builder - itemised quote | [10-quote-builder.png](screenshots/10-quote-builder.png) |
| 14 | 2:03 | Quote sent - case moves to Quoted | [12-case-quoted.png](screenshots/12-case-quoted.png) |
| 15 | 2:10 | Bookings - list with status tabs | [13-bookings-list.png](screenshots/13-bookings-list.png) |
| 16 | 2:17 | Bookings - search | [14-bookings-search.png](screenshots/14-bookings-search.png) |
| 17 | 2:21 | Bookings - admissions calendar | [15-bookings-calendar.png](screenshots/15-bookings-calendar.png) |
| 18 | 2:27 | Booking detail - treatment & payment | [16-booking-detail.png](screenshots/16-booking-detail.png) |
| 19 | 2:36 | Booking detail - admit dialog (cancelled); discharge action | [17-booking-admit-dialog.png](screenshots/17-booking-admit-dialog.png) |
| 20 | 2:46 | Booking detail - itinerary | [19-booking-itinerary.png](screenshots/19-booking-itinerary.png) |
| 21 | 2:53 | Booking detail - visa invitation letter & transfers | [20-booking-visa.png](screenshots/20-booking-visa.png) |
| 22 | 3:01 | Booking detail - completed (discharged) booking | [21-booking-completed.png](screenshots/21-booking-completed.png) |
| 23 | 3:08 | Doctors - list with registration badges | [22-doctors.png](screenshots/22-doctors.png) |
| 24 | 3:19 | Doctor form (cancelled) | [23-doctor-form.png](screenshots/23-doctor-form.png) |
| 25 | 3:28 | Doctor availability calendar | [24-doctor-availability.png](screenshots/24-doctor-availability.png) |
| 26 | 3:35 | Procedures & pricing | [25-procedures.png](screenshots/25-procedures.png) |
| 27 | 3:43 | Procedure drawer with packages | [26-procedure-packages.png](screenshots/26-procedure-packages.png) |
| 28 | 3:49 | Hospital profile - profile & contact | [27-hospital-profile.png](screenshots/27-hospital-profile.png) |
| 29 | 3:59 | Hospital profile - accreditations | [28-hospital-accreditations.png](screenshots/28-hospital-accreditations.png) |
| 30 | 4:06 | Hospital profile - KYC documents | [29-hospital-kyc.png](screenshots/29-hospital-kyc.png) |
| 31 | 4:14 | Team members | [30-team.png](screenshots/30-team.png) |
| 32 | 4:20 | Invite team member dialog (cancelled) | [31-team-invite-dialog.png](screenshots/31-team-invite-dialog.png) |
| 33 | 4:27 | Reviews | [32-reviews.png](screenshots/32-reviews.png) |
| 34 | 4:34 | Finance - settlement items | [33-finance-settlement-items.png](screenshots/33-finance-settlement-items.png) |
| 35 | 4:44 | Finance - payouts | [34-finance-payouts.png](screenshots/34-finance-payouts.png) |
| 36 | 4:49 | Finance - statements with totals | [35-finance-statements.png](screenshots/35-finance-statements.png) |
| 37 | 4:56 | Finance - payout account | [36-finance-payout-account.png](screenshots/36-finance-payout-account.png) |
| 38 | 4:59 | Messages - case conversation | [37-messages.png](screenshots/37-messages.png) |
| 39 | 5:09 | Notifications | [38-notifications.png](screenshots/38-notifications.png) |
| 40 | 5:14 | Top bar - active hospital (switcher appears with 2+ hospitals) | - |
| 41 | 5:22 | Sidebar collapse / expand | [39-sidebar-collapsed.png](screenshots/39-sidebar-collapsed.png) |
| 42 | 5:27 | Dark mode toggle | [40-dark-mode.png](screenshots/40-dark-mode.png) |
| 43 | 5:31 | Outro | - |

## Notes - reachable screens not shown, or shown in part

- **Hospital switcher**: not shown as a dropdown. `owner.sanjeevani-gurugram` belongs to one hospital, so the top bar shows the
  hospital name only (row 40). The narration explains that owners of several hospitals get a switcher there.
- **Discharge & complete**: no Sanjeevani booking is currently *admitted*, and real seed data was not changed. The admit dialog
  is opened and cancelled (row 19), the narration covers the discharge action, and a completed or discharged booking is shown (row 22).
- **Visa invitation letter**: the *Upload invitation letter* action is shown but not used, so the seeded visa request stays as it was.
- **Dialogs opened and cancelled**: decline enquiry, admit patient, add itinerary item, edit doctor, invite team member.
- **Real actions performed** (on data created for this video only): an itemised quote (INR 22,55,000) is sent on enquiry
  HIG-C-2026-000114 (Hamed Al-Rawahi, Oman), and a message is sent in its case conversation.
- **Onboarding wizard** (`/onboarding`): not shown separately. It is the same step UI as Hospital profile (rows 28-30),
  and this hospital is already approved.
- **Payouts tab**: shown in its empty state. No payout has been made yet; the only settlement item is still in its hold period.
- Demo data: `docs/demo/scripts/setup-hospital-data.mjs` creates the enquiry, the AI screening and the echocardiogram. AI document reading is
  not configured locally, so `fill-demo-analysis.py` runs the real pipeline with a fixed AI reading. The patient then confirms it
  through the API, editing one medication, which is shown as "Edited by patient".
- Test records named "E2E ..." from the parallel Playwright suite are visible in some list views (bookings, calendar, dashboard).
