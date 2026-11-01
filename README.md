# RewardLab — private testing build (V4)

A responsive multi-page-style rewards workspace with a protected admin console and Firebase Authentication, Firestore and callable Cloud Functions. **All balances are nonredeemable testing credits**. No QR checkout, bank transfer, UPI processing or real withdrawal exists. The five game tiles do not run gameplay or bets.

## Included

- `index.html`, `app.js`, `style.css`: member UI with Overview, Wallet, Games, Referrals and Profile sections.
- `admin.html`, `admin.js`, `admin.css`: administrator UI for users, transactions, referral records, notes, credit adjustments, disabling accounts and withdrawal decisions.
- `functions/index.js`, `functions/logic.js`: transactional server-side logic, unique 5-digit member codes, signup bonus (50), referral bonus (10), deposit and withdrawal checks, admin authorization and audit trail.
- `firestore.rules`, `firestore.indexes.json`: member-owned read access and server-only writes; withdrawal counter index.
- `functions/set-admin.js`: script to grant/revoke the admin custom claim; **never expose this script on Hosting**.
- `tests/smoke.test.cjs`, `tests/ui.test.cjs`: automated offline tests using local Firebase mocks.

## Initial setup

1. Create a new Firebase project and register a **Web app**. In **Authentication > Sign-in method**, enable **Google**. Add your eventual Hosting domain to **Authentication > Settings > Authorized domains**. Do not launch via `file://` or preview inside a file manager; use Firebase Hosting or a permitted local development origin.
2. Enable **Cloud Firestore** (select an appropriate region). This app's Cloud Functions use **us-central1**; both UI and backend use that region.
3. Copy the Firebase Web SDK configuration object from **Project settings > Your apps** into `firebase-config.js`, replacing `REPLACE_ME` values. These web config values are **not service account private keys**. Never put Firebase Admin SDK private keys in a public file.
4. For private access, copy `functions/.env.example` to `functions/.env` and replace `ALLOWED_EMAILS` with the Google emails allowed to register or administer (comma-separated). This optional setting is **strongly recommended**. Without it, anyone who knows your Hosting URL and has a Google account can register.
5. In a Node.js 22 environment, install Firebase CLI and deploy the project:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
cd ..
node --test tests/*.test.cjs
firebase deploy --only firestore,functions,hosting
```

The `firebase use --add` step will ask which of your projects to deploy to. If you deploy from a fresh directory, select the correct project. Deploying callable Cloud Functions generally requires the Firebase **Blaze** billing plan, even if your actual usage stays within free allowances.

6. Open the Hosting URL ending in `/index.html`. Set up admin privileges with `ADMIN_SETUP.md`, then open `/admin.html`.

## Reward rules

- Signup: 50 credits; each successful referral (new Google account) awards the referring user 10 credits exactly once.
- Only deposits of 100, 200, 300, 500 or 1,000 credits are allowed. They add testing credits without charging anyone.
- Withdrawal request: at least 200 available credits and at least 100 credits in cumulative deposits. A pending request reserves that amount immediately. Cancellation returns it exactly once; approval marks it complete without a cash payout.
- Entry eligibility indicators: Aviator 500 deposits; Color Bingo, Rummy, Ludo and Lucky Spin 300 deposits. These are placeholders, not playable titles.
- Wallet, deposits, referrals, requests, withdrawals, audit history and account records are stored in Firestore. Admin identity uses Firebase Auth custom claims, not an insecure client-side flag.

## Troubleshooting login or “internal” server errors

- A signed-in Google account must still call the deployed `registerUser` Function to create its profile. If setup fails, the page provides **Retry setup** and **Sign out**; invalid invitation links can be bypassed with **Continue without referral**.
- Check Firebase Console > Functions > `registerUser` > Logs for the precise underlying exception; an `internal` error is not a diagnosis by itself.
- Verify you deployed **Node 22** Functions and Firestore Rules to the **same** project as `firebase-config.js`; verify `us-central1` and authorized Google sign-in domains.
- A Firebase project might require creating a Firestore database and enabling billing before Cloud Functions can deploy. Legacy Functions deployed from earlier versions are not automatically fixed by replacing HTML files. Check old Functions and remove retired versions only after confirming their purpose.
- Browser notifications are not payment receipts. All operations are server-validated and logged for testing.

## Updates and safety

Always redeploy **Firestore, Functions and Hosting** together after changing interface contracts. This package does not delete existing users or balances; if you need a clean testing database, create a *new Firebase project* rather than deleting data blindly. Use a private URL, an email allowlist and a trusted admin machine. Code is tested locally using mocks, but production Firebase integration **cannot be verified without your project configuration and logs**.
