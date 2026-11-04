# Pocket Ledger — Firebase + GitHub Pages

**Storage update v3:** Firebase now stores native fields in one document per record,
with monetary values in rupees. The website interface and calculations are unchanged.
For an existing installation, follow **UPGRADE-FIREBASE-STORAGE.md** first. Keep your
existing configured `docs/firebase-config.mjs` and publish the updated rules.

Your expense tracker has six screens: **Overview**, **Transactions**, **Monthly
Budget Reference**, **Money Lent and Borrowed**, **Investment**, and **Downloads**.
The website is static and runs on GitHub Pages. Records are saved privately in
Cloud Firestore under your Firebase sign-in account.

**One-time Firebase setup is required.** This ZIP contains the integration and
security rules, but not an already-created Firebase project or your account
settings. No real transactions, test balances, passwords or private keys are
included. Without configuration the site shows setup instructions and does not
pretend to save records.

## 1. Create your free Firebase project

1. Open [Firebase Console](https://console.firebase.google.com/) and create a
   project, for example `pocket-ledger`. Google Analytics is not needed.
2. Keep the project on the **Spark** plan. Do not link a Cloud Billing account
   or choose the Blaze plan. No payment method is required for this setup.
3. In **Project settings → General → Your apps**, register a **Web** app (`</>`).
   You do not need Firebase Hosting; GitHub Pages will host the website.
4. Copy the web app's Firebase configuration.
5. Open `docs/firebase-config.mjs` and fill in the four fields. Use the exact
   values shown for your project:

   ```js
   export const firebaseConfig = {
     apiKey: 'YOUR_WEB_API_KEY',
     authDomain: 'YOUR_PROJECT.firebaseapp.com',
     projectId: 'YOUR_PROJECT_ID',
     appId: 'YOUR_WEB_APP_ID'
   };
   export const ownerUid = 'YOUR_FIREBASE_USER_UID';
   ```

   Complete the UID after the next step. The web configuration identifies your
   project and is intended to be public. **Never put a service-account JSON,
   private key, account password or other secret in the repository.**

## 2. Create your sign-in account

1. In Firebase Console, open **Authentication → Get started → Sign-in method**.
2. Enable **Email/Password** (the ordinary password option).
3. In **Authentication → Users**, choose **Add user**. Enter an email you own
   and choose a password yourself. Do not put the password in the website code.
4. Open that user and copy its **User UID**.
5. Paste that UID into `ownerUid` in `docs/firebase-config.mjs`.
6. In **Authentication → Settings → Authorized domains**, add
   `YOUR-USERNAME.github.io` (or your custom Pages domain), without a path.
   Add `localhost` if you plan to test locally. The website has no registration
   screen; it signs in to this pre-created account.

Use the **same email and password on every device**. Different Firebase accounts
have different UIDs and cannot access this ledger. Sign out on shared devices;
email/password sign-in persistence is enabled in the browser.

## 3. Create Firestore and publish the private rules

1. In Firebase Console, open **Firestore Database → Create database**.
2. Select **Standard edition**, the default database, and **Production mode**.
   Choose a suitable region; the database location is a lasting choice.
3. Open the supplied `firestore.rules` in a text editor. Replace
   `REPLACE_WITH_YOUR_FIREBASE_USER_UID` with the **same UID** from step 2.
4. Copy the whole file into the database's **Rules** tab and click **Publish**.

The supplied rules allow only that signed-in UID to read or write records under
`users/YOUR_UID/ledger/`. Other paths are denied. Leaving the UID placeholder
unchanged intentionally denies access. Do not use public `allow read, write:
if true` rules or test-mode rules.

The app needs no Storage bucket, Cloud Functions, billing, server, paid API or
Firebase Hosting. PDFs are processed on your device; only the reviewed entries
you save are sent to Firestore.

Optional: exclude the large `data` field in the `ledger` collection group from
indexing. `firestore.indexes.json` and `firebase.json` are provided for anyone
using the Firebase CLI. The app does not query these fields or need a composite
index; this exemption is optional for running the site. Do not run a Firebase
Hosting deploy for this project.

## 4. Publish on GitHub Pages

1. Extract this ZIP. Create a dedicated **public** GitHub repository, for example
   `expense-tracker`, or update the repository where you host this tracker.
2. Upload the files and folders at the repository root. Keep `docs/` intact:
   the website entry must be `docs/index.html`, without an extra nested project
   folder. Keep your configured `docs/firebase-config.mjs`.
3. In GitHub, open **Settings → Pages**.
4. Choose **Deploy from a branch**, the `main` branch, and the **`/docs`** folder.
5. Click **Save** and use the website URL GitHub displays when deployment finishes.
   A usual project address is `https://YOUR-USERNAME.github.io/expense-tracker/`.
6. Sign in on the website. Add one small entry, wait for **Saved in Firebase**,
   and sign in on your phone or another browser. That entry should appear there.

All website asset paths are relative, so a dedicated repository path works.
You can host other websites in separate repositories under the same account.
The public repository contains the application source; financial records are
stored in your private Firebase database, not in GitHub.

## 5. What changed and how it works

### Overview

Cash and bank balances include retained income and expenses. Actual expenses
are displayed separately from the selected month's manually entered tentative
estimate. The formulas use complete labels:

**Total Savings = Total Cash + Total Bank Balance + Total Money Lent to Others
+ Total Investment − Other People’s Money Held by Me − This Month’s Tentative
Expenses**

**Savings without Investment = Total Cash + Total Bank Balance + Total Money
Lent to Others − Other People’s Money Held by Me − This Month’s Tentative
Expenses**

**Liquid Savings without Investment = Total Cash + Total Bank Balance − Other
People’s Money Held by Me − This Month’s Tentative Expenses**

Actual expenses already reduce cash or bank. The full tentative estimate is also
subtracted, as requested in the formula; it is not automatically reduced by
actual spending. Lending, borrowing and investment values are **current totals**,
including when viewing an earlier month. They are not historical valuations.

### Transactions and PDF imports

- **Description is optional. Category is mandatory for every saved entry**,
  including income, in both manual entry and PDF review.
- Date and positive amount are required for transactions. The date must fall
  within the selected month.
- Monthly cash, bank and tentative fields save when you finish editing and leave
  the field. Wait for the saved status before closing the page.
- Blank opening cash or bank balances use the previous closing balance, including
  across December and January. An explicit zero overrides that inherited value.
- Unchecking a saved transaction excludes it from account balances and category
  expenses. Checking it again restores it. Unchecked PDF review rows are discarded.
- Text-based PDFs are read locally with bundled PDF.js. Review dates, amounts,
  type, account and category before importing. Optional PDF passwords are used
  for reading only and are not stored. Scanned image PDFs need manual entry.
- Income has a required category but does not consume its expense allowance.
  Add a category such as Salary to the reference if useful.

### Monthly Budget Reference

This is one shared list, independent of the selected month. Switching months
never loads a different reference or changes it automatically.

Saving a category, adding one, or removing one updates the reference and applies
it to the **selected month's** budget. Earlier or other saved months keep their
own snapshots. New months use the saved reference. If an existing selected month
has a different snapshot, **Apply reference to [month]** lets you replace that
month's budget manually without changing the reference itself.

A category used by a transaction in the selected month cannot be removed from
that month's budget until the transaction is reassigned. Historical category
balances continue even after the category is removed from the shared reference.

### Continuous carry-forward and manual resets

There is **no automatic year-end reset**. All history remains available, and:

**Closing category carry-forward = Previous carry-forward + Monthly category
budget − Actual retained expenses in that category**

Skipped months after a saved month inherit its allowance. Budget does not accrue
before the first recorded month. Overspending produces a negative balance.
Carry-forward is a budget balance; it is not added to Total Savings.

In Transactions you can:

- Edit an individual category's selected-month closing balance. The edit stays
  saved and flows into later months. **Undo edit** restores the calculated value
  (or zero if that month has a manual reset).
- Choose **Reset carry-forward** to set all category closing balances in the
  selected month to zero. Earlier records remain; later calculated balances use
  that zero opening, subject to later saved overrides or resets. You can undo
  that month's reset.
- Choose **Reset selected month's data** to clear that month's transactions,
  cash/bank inputs, tentative estimate, carry-forward edits and reset flag, and
  use the shared reference. Lending, borrowing, investments and other months stay.
- Choose **Reset all data** to clear the entire ledger, including lending,
  borrowing and investments. The sign-in account remains. Type **RESET** to
  confirm either data reset. Full reset is permanent; category-only reset can be
  undone. Large full resets run in safe batches. If interrupted, reconnect or
  reload while signed in to finish the reset you already requested.

Merely selecting a month does not create database records. A month is saved when
you enter data, edit its budget or carry-forward, or explicitly reset it.

### Money Lent and Borrowed

Separate sections hold **Money Lent to Others** and **Money Borrowed from Others**.
Each entry requires a name and positive amount; date and description are optional.
Entries can be edited or removed.

The sum of all current lending entries fills **Money Lent to Others** in
Transactions automatically. The sum of all current borrowing entries fills
**Other People’s Money Held by Me** automatically. Those fields are read-only;
use **Manage entries** to edit the source records.

These entries represent outstanding balances, not a repayment transaction log.
After repayment, reduce the amount or remove the entry. Dates do not filter these
totals. Entering a lending or borrowing record does not also change cash/bank:
record the actual payment separately in Transactions if it is not already
reflected in your opening balances. This avoids counting a payment twice.

### Investment and Downloads

Investment keeps the existing types and current values and contributes to Total
Savings. No additional investment features were introduced.

All three Excel options remain: **Selected year**, **Selected month**, and
**Complete history**. They contain only category carry-forward rows:

| Column | Meaning |
| --- | --- |
| Month | The saved month |
| Expense category | Category name |
| Previous carry-forward | Opening category balance, including earlier years |
| Monthly budget | That month's saved allowance |
| Actual category expenses | Retained expenses for that category and month |
| Calculated carry-forward | Opening + allowance − expenses |
| Manual adjustment | Saved closing balance − calculated balance |
| Closing carry-forward | Actual closing category balance |
| Closing balance source | Calculated, Manual edit or Manual reset |

No individual transactions, account data, personal names from the loan list, or
investment records are exported. A report is not a restorable database backup.
Month/year exports calculate their opening balances using all earlier history.

## 6. Move older browser records into Firebase

The old website kept records in browser storage under its website path. On the
**same browser and the same website URL path**, the updated app detects those
records after sign-in. If the cloud ledger is empty, it offers **Import existing
records**. Use it before entering new cloud data. It never automatically replaces
a nonempty cloud ledger or overwrites the old browser copy.

Monthly transactions, budgets, manual carry-forward edits and investment values
are preserved. The latest nonblank old monthly lent/held amounts become one
opening lending and borrowing entry. Review those entries and assign the actual
people's names; old snapshots are not added together repeatedly. The shared
reference starts with the latest old month's budget. Old January carry-forward
now recalculates continuously rather than resetting.

Keep the same GitHub repository path during this upgrade if you need this
migration. The source ZIP itself does not contain your old browser records.

## 7. Free-plan limits, saving and connection status

This design uses only Firebase Authentication (Email/Password), Cloud Firestore
Standard edition and static GitHub Pages hosting. Spark and public-repository
GitHub Pages provide a no-cost setup within their limits.

Firestore's documented free quota is currently **1 GiB stored**, **50,000 document
reads/day**, **20,000 writes/day**, **20,000 deletes/day**, and **10 GiB outbound
transfer/month** for the one free database. Limits can change; check the official
links below and the Usage tab in your console. Keep Spark without a billing
account to avoid automatic usage charges. Reaching a free quota can temporarily
stop saves; the app shows the error and does not claim the change was saved.

Each financial record has its own Firestore document with native, clearly named
fields and numeric rupee values. Only changed records are written. Real-time updates load the
same ledger on your signed-in devices, and a revision check rejects a stale save
instead of silently overwriting another device's changes. Large imports and schema upgrades use private, resumable batches. The website
continues to use exact paise arithmetic internally; database conversion occurs at
the storage boundary. One document per record increases reads compared with the
old chunked format, so monitor Firestore Usage for long histories and reloads.

The ledger requires an internet connection for saving; there is no offline save
queue. Firestore uses memory caching, rather than a second persistent financial
ledger in browser storage. Authentication can remain signed in across reloads.
The Firebase SDK loads from Google's CDN; PDF.js and the Excel writer are bundled.
GitHub Pages hosting alone does not store or back up your financial records.

## 8. Mobile and desktop use

All screens support phone, tablet and desktop widths. On phones, six navigation
targets occupy two rows, forms stack vertically, transaction and carry-forward
rows become readable cards, and controls have larger touch areas. PDF selection,
review, editing, loan entry, manual reset and Excel downloads remain available.
The optional date picker and downloaded-file location depend on your browser.

## 9. Local development and verification

No app build or dependency installation is required. Serve `docs/` over HTTP;
opening `index.html` directly as a local file does not load browser modules.

```sh
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`. Add localhost to Firebase authorized domains when
using your configured project. Run the automated checks with a current Node.js:

```sh
npm test
```

The 35 tests cover calculations, cross-year balances, resets, stable shared
reference/historical snapshots, optional descriptions, mandatory categories,
lending/borrowing validation and totals, old-data migration, PDF parsing,
carry-only XLSX data, native rupee fields and per-record documents, safe migration
and interrupted-update recovery, server versus cached snapshots, failed or
offline saves, revision conflicts, sign-out, and a full reset exceeding one batch.

The database transport tests use a local test double, not a real Firebase account.
Browser QA used the actual screens, PDF reader and workbook generator with a
separate in-memory test transport. Phone widths (320 and 375), tablet (768) and
desktop (1280) were inspected. The Excel ZIP/XML contents and report scopes passed
validation; this preview browser did not provide a completed download event for
Blob links, so native download completion could not be confirmed here. The ZIP's
production configuration remains empty.
A real Firebase round-trip and deployed security-rule test still require your
own project configuration; complete the two-device check in step 4.

## Troubleshooting

- **Firebase setup required:** fill all four web config values and `ownerUid`,
  then update the hosted file and reload.
- **Access denied:** match the Authentication user's UID in both config and
  `firestore.rules`, and publish the rules in the correct Firebase project.
- **Email/password sign-in unavailable:** enable the ordinary Email/Password
  provider and create the user in Firebase Authentication.
- **Loading records / cannot reach Firebase:** check the internet connection,
  project ID, database creation, allowed browser network access, and any content
  blocker. Press Try again after correcting the issue.
- **Records changed on another device:** let the latest records load, review the
  affected entry and save again. An open entry changed elsewhere must be closed
  and reopened before editing.
- **Quota reached:** check Firestore Usage and wait for the applicable free quota
  to renew. Do not upgrade plans if you want to keep this setup strictly free.
- **PDF looks wrong:** review and correct extracted values, or use manual entry
  for unsupported/scanned statements. PDF layouts differ between banks.

## Official references

- [Firebase web setup](https://firebase.google.com/docs/web/setup)
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Firestore free quota and limits](https://firebase.google.com/docs/firestore/quotas)
- [Email/password authentication](https://firebase.google.com/docs/auth/web/password-auth)
- [Firestore security rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Create a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## Third-party software

Bundled PDF.js 5.6.205 is provided by Mozilla and contributors under Apache 2.0.
Its license is in `docs/vendor/PDFJS-LICENSE.txt`.
Firebase JavaScript SDK 12.10.0 is loaded as browser ES modules from Google's CDN
and is provided under Apache 2.0. See https://github.com/firebase/firebase-js-sdk.
