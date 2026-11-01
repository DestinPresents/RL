// Run only from a trusted machine with Google Application Default Credentials.
// Usage: node set-admin.js <firebase-auth-uid> [grant|revoke]
const admin=require('firebase-admin');admin.initializeApp();
(async()=>{const uid=process.argv[2],action=process.argv[3]||'grant';if(!uid||!['grant','revoke'].includes(action))throw Error('Usage: node set-admin.js <uid> [grant|revoke]');const user=await admin.auth().getUser(uid);await admin.auth().setCustomUserClaims(uid,{...(user.customClaims||{}),admin:action==='grant'?true:undefined});console.log('Admin claim updated for UID:',uid,'Action:',action);})().catch(e=>{console.error(e);process.exit(1)});
