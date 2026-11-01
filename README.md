# RewardLab — FINAL demo build

**All balances, deposits and withdrawals are simulated, non-redeemable testing credits.** No actual UPI QR, payment processor, or real-money games are present.

## What's included
- Responsive member site: Dashboard, Wallet, Games, Referrals, Profile.
- Google sign-in only; 5-digit unique referral codes; ₹50 simulated signup bonus and ₹10 simulated referral credits.
- Simulated deposits: ₹100/₹200/₹300/₹500/₹1000; withdrawal request minimum ₹200, requires ₹100 total demo deposits.
- Game cards only: Aviator requires ₹500, others ₹300 cumulative simulated deposits. Gameplay is not implemented.
- Admin console at `/admin.html`: user listing and 5-digit UID search, account details, balance and deposit editing, notes, disabled accounts, referral records, latest 100 transactions, withdrawal approvals/cancellations, audit activity.
- Firebase Firestore rules deny direct client writes; privileged changes use callable Cloud Functions with server-verified admin custom claims.

## Deployment (required before live use)
1. Create your Firebase project and register a **Web App**. Enable **Authentication > Google** and **Cloud Firestore**.
2. Put the Firebase Web App config into `firebase-config.js`. Use a real HTTPS Firebase Hosting domain and add it to Firebase Auth authorized domains.
3. Install Node.js 20+ and Firebase CLI on a trusted machine or supported cloud development environment: `npm install -g firebase-tools` then `firebase login`.
4. From this project folder run `firebase use --add` (select your project), then `cd functions && npm install && cd ..`.
5. Deploy: `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting`. Firebase Functions may require Blaze billing. Allow Firestore composite index to finish building.
6. Log in on the public site with your Google account; copy its **Firebase Auth UID** from Firebase Console > Authentication (not the 5-digit referral code).
7. Grant admin custom claim securely with Firebase Admin SDK credentials: `cd functions && node set-admin.js YOUR_AUTH_UID grant`. Configure Google Application Default Credentials and the correct Firebase project. **Never** upload credential JSON to public hosting.
8. Sign out, sign in again, then open `/admin.html`.

## Important limitations
- No Firebase project credentials were supplied. Therefore deployed Google sign-in, actual database transactions, and hosting cannot be tested in this environment. Local syntax and package integrity checks are included in `tests/TEST_REPORT.txt`.
- Admin balance edits create an adjustment record; cumulative deposit edits are separately audited. Do not directly edit Firestore ledger records.
- Referral code capacity is 90,000 unique codes; no anti-abuse identity verification. For private test accounts only.
- Admin transactions and referrals show up to the latest 100 records; user list is paginated in groups of 50.
- The admin audit panel shows the latest 20 events. The overview's pending count requires the deployed Firestore collection-group index.
- Never deploy this as a real-money service without professional security review and appropriate regulatory compliance.
