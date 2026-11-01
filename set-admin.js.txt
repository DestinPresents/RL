'use strict';
// Run only from a trusted admin environment using Application Default Credentials.
// Usage: node set-admin.js <Firebase-Auth-UID-or-email> [grant|revoke]
const admin=require('firebase-admin');
if(!admin.apps.length)admin.initializeApp();
(async()=>{
 const identity=process.argv[2],action=process.argv[3]||'grant';
 if(!identity||!['grant','revoke'].includes(action))throw Error('Usage: node set-admin.js <auth-uid-or-email> [grant|revoke]');
 const user=identity.includes('@')?await admin.auth().getUserByEmail(identity):await admin.auth().getUser(identity);
 const claims={...(user.customClaims||{})};if(action==='grant')claims.admin=true;else delete claims.admin;
 await admin.auth().setCustomUserClaims(user.uid,claims);
 console.log(`Admin ${action} completed for UID ${user.uid}. Sign out and in again to refresh claims.`);
})().catch(e=>{console.error('Admin setup failed:',e.message);process.exitCode=1});
