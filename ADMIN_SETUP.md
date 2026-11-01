# RewardLab Admin Console — secure setup

Admin console address after deployment: `https://YOUR_PROJECT.web.app/admin.html`

## Grant your own Google account admin access

1. First sign in to RewardLab once with the intended Google account, so it exists in Firebase Authentication.
2. Run the following commands on a **trusted terminal**, using Application Default Credentials or a service account accessible **only** to you. Never upload a service account JSON file to Firebase Hosting or share it with users.

```bash
cd functions
npm install
# For a securely stored service-account file, configure credentials in the terminal:
# export GOOGLE_APPLICATION_CREDENTIALS="/secure/private/service-account.json"
node set-admin.js "your-google-email@gmail.com" grant
```

You can also pass the Firebase Authentication UID as the first argument (not the five-digit RewardLab referral code). To revoke access use `revoke` instead of `grant`. The script preserves other custom claims.

3. Sign out of RewardLab and sign in again so the new ID token contains the admin claim.
4. Visit `/admin.html`. Only accounts with the server-verified `admin` custom claim can call Admin Functions; other Google accounts cannot open protected user data.

## What an admin can change

- Review members with email, Google Auth UID, RewardLab 5-digit code, account status and recent activity.
- Search by 5-digit RewardLab member code.
- Update `balance`, `totalDeposited` and a private admin note; balance changes create ledger entries and audit logs.
- Disable/enable users in Firebase Authentication and in their member profile. If the dual-system update fails, the backend attempts to revert the Firebase Authentication status. Check the user record after an error.
- Approve or cancel pending testing withdrawal requests once. Cancellation refunds the credits reserved by that request.

**Protected fields:** Member Auth UID, five-digit code, referral ownership and transaction IDs cannot be edited from the UI. Directly changing these would break links and the audit trail.

## If the admin page says permission denied

- Confirm the Google account you are signed in with is the one you granted access to.
- Sign out/in to refresh the ID token.
- If `ALLOWED_EMAILS` is configured in `functions/.env`, include the admin email there too.
- Confirm the Cloud Functions and Hosting use the same Firebase project and the most recent versions are deployed.
- Read Firebase Console > Functions > Logs for the failing admin Function.

**Privacy:** The Hosting login screen is reachable by URL. For a private installation, use the `ALLOWED_EMAILS` allowlist; merely keeping the address unshared is not an access-control mechanism. All credits are nonredeemable and no payment or payout service is connected.
