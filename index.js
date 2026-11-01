'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const admin=require('firebase-admin');
const crypto=require('node:crypto');
const {DEPOSIT_AMOUNTS,MIN_WITHDRAWAL,REQUIRED_WITHDRAWAL_DEPOSIT,MAX_CREDITS,integer,validDeposit,validWithdrawal,referralCode,operationId,sanitizeText}=require('./logic');
if(!admin.apps?.length)admin.initializeApp();
const db=admin.firestore();
const stamp=()=>admin.firestore.FieldValue.serverTimestamp();
const increment=n=>admin.firestore.FieldValue.increment(n);
const callable=(name,fn)=>onCall({region:'us-central1',timeoutSeconds:30},async request=>{
  try{return await fn(request)}catch(e){
    if(e instanceof HttpsError)throw e;
    console.error(`[RewardLab:${name}]`, {code:e?.code||'unknown',message:e?.message||String(e),stack:e?.stack});
    // The real stack trace is in Firebase Functions logs, never exposed to the browser.
    throw new HttpsError('internal',`Server error in ${name}. Check Firebase Functions logs.`);
  }
});
function needAuth(req){if(!req.auth?.uid)throw new HttpsError('unauthenticated','Sign in with Google first');return req.auth.uid}
async function activeUser(req){const uid=needAuth(req);let record;try{record=await admin.auth().getUser(uid)}catch(e){if(e?.code==='auth/user-not-found')throw new HttpsError('unauthenticated','Sign in again');throw e}if(record.disabled)throw new HttpsError('permission-denied','Account is disabled');
 const allowed=(process.env.ALLOWED_EMAILS||'').split(',').map(email=>email.trim().toLowerCase()).filter(Boolean);
 if(allowed.length&&!allowed.includes((record.email||'').toLowerCase()))throw new HttpsError('permission-denied','This Google account is not approved for private testing');
 if(!record.providerData?.some(p=>p.providerId==='google.com'))throw new HttpsError('permission-denied','Google sign-in is required');return uid}
async function adminUser(req){const uid=await activeUser(req);const record=await admin.auth().getUser(uid);if(record.customClaims?.admin!==true||req.auth.token?.admin!==true)throw new HttpsError('permission-denied','Administrator access required. Sign out and in if just granted.');return uid}
const users=()=>db.collection('users');
const txRef=(uid,id)=>users().doc(uid).collection('transactions').doc(id);
const audit=(t,actor,action,target,extra={})=>t.create(db.collection('adminAudit').doc(),{actor,action,target,...extra,createdAt:stamp()});
// Callable responses are JSON, so normalize Admin SDK Timestamp objects for the web client.
function jsonValue(value){
 if(value==null)return value;
 if(typeof value.toDate==='function')return {seconds:Math.floor(value.toDate().getTime()/1000)};
 if(Array.isArray(value))return value.map(jsonValue);
 if(typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,jsonValue(v)]));
 return value;
}
const asRow=d=>({id:d.id,...jsonValue(d.data())});

exports.registerUser=callable('registerUser',async req=>{
 const uid=await activeUser(req),referral=sanitizeText(req.data?.referral,20);
 if(referral&&!referralCode(referral))throw new HttpsError('invalid-argument','Referral code must contain five digits');
 const code=await db.runTransaction(async t=>{
  const u=users().doc(uid);const before=await t.get(u);if(before.exists){const existing=before.data().code;if(!referralCode(existing))throw new HttpsError('failed-precondition','Account data is incomplete. Contact the administrator.');return existing;}
  let code=null,codeDocument=null;
  for(let attempt=0;attempt<36;attempt++){
   const candidate=String(10000+crypto.randomInt(90000));const target=db.doc('codes/'+candidate);
   if(!(await t.get(target)).exists){code=candidate;codeDocument=target;break}
  }
  if(!code)throw new HttpsError('resource-exhausted','Could not allocate a member code. Try again.');
  let referrerRef=null;
  if(referral){
   const record=await t.get(db.doc('codes/'+referral));
   if(!record.exists)throw new HttpsError('invalid-argument','That referral code is not registered');
   if(record.data().uid===uid)throw new HttpsError('invalid-argument','You cannot refer your own account');
   const candidate=users().doc(record.data().uid),referrer=await t.get(candidate);
   if(!referrer.exists)throw new HttpsError('failed-precondition','Inviting account is not available');
   if(!integer(referrer.data().balance,0,MAX_CREDITS-10))throw new HttpsError('failed-precondition','Inviting account has reached the credit limit');
   referrerRef=candidate;
  }
  // Every transaction read happens before the first write.
  t.create(codeDocument,{uid,createdAt:stamp()});
  t.create(u,{code,balance:50,totalDeposited:0,referredBy:referrerRef?referral:null,createdAt:stamp(),updatedAt:stamp()});
  t.create(u.collection('transactions').doc('signup'),{type:'signup bonus',amount:50,status:'success',createdAt:stamp()});
  if(referrerRef){t.update(referrerRef,{balance:increment(10),updatedAt:stamp()});t.create(referrerRef.collection('referrals').doc(uid),{code,createdAt:stamp()});t.create(referrerRef.collection('transactions').doc('ref-'+uid),{type:'referral',amount:10,status:'success',referredUid:uid,createdAt:stamp()})}
  return code;
 });return {code};
});

exports.creditDeposit=callable('creditDeposit',async req=>{
 const uid=await activeUser(req),amount=req.data?.amount,id=req.data?.requestId;
 if(!validDeposit(amount)||!operationId(id))throw new HttpsError('invalid-argument','Invalid credit amount or request ID');
 return db.runTransaction(async t=>{
  const user=users().doc(uid),transaction=txRef(uid,id);
  const [us,old]=await Promise.all([t.get(user),t.get(transaction)]);
  if(!us.exists)throw new HttpsError('failed-precondition','Account not ready');
  if(old.exists){if(old.data().type==='deposit'&&old.data().amount===amount)return {ok:true,duplicate:true};throw new HttpsError('already-exists','Request ID was already used')}
  const data=us.data();if(!integer(data.balance,0,MAX_CREDITS-amount)||!integer(data.totalDeposited,0,MAX_CREDITS-amount))throw new HttpsError('resource-exhausted','Account credit limit reached');
  t.update(user,{balance:increment(amount),totalDeposited:increment(amount),updatedAt:stamp()});
  t.create(transaction,{type:'deposit',amount,status:'success',createdAt:stamp(),source:'practice'});
  return {ok:true,duplicate:false};
 });
});

exports.requestWithdrawal=callable('requestWithdrawal',async req=>{
 const uid=await activeUser(req),amount=req.data?.amount,id=req.data?.requestId;
 if(!integer(amount,MIN_WITHDRAWAL,100000)||!operationId(id))throw new HttpsError('invalid-argument','Enter at least 200 credits and a valid request ID');
 return db.runTransaction(async t=>{
  const user=users().doc(uid),transaction=txRef(uid,id);
  const [us,old]=await Promise.all([t.get(user),t.get(transaction)]);
  if(!us.exists)throw new HttpsError('failed-precondition','Account not ready');
  if(old.exists){if(old.data().type==='withdrawal'&&old.data().amount===amount)return {ok:true,duplicate:true};throw new HttpsError('already-exists','Request ID was already used')}
  const data=us.data();if(!integer(data.totalDeposited)||data.totalDeposited<REQUIRED_WITHDRAWAL_DEPOSIT)throw new HttpsError('failed-precondition','At least 100 credits in prior deposits required');
  if(!integer(data.balance)||data.balance<amount)throw new HttpsError('failed-precondition','Insufficient available credits');
  if(!validWithdrawal(amount,data))throw new HttpsError('failed-precondition','Withdrawal conditions not met');
  t.update(user,{balance:increment(-amount),updatedAt:stamp()});
  t.create(transaction,{type:'withdrawal',amount,status:'pending',createdAt:stamp(),source:'practice'});
  return {ok:true,duplicate:false};
 });
});

exports.adminOverview=callable('adminOverview',async req=>{
 await adminUser(req);const [count,pending,logs]=await Promise.all([
 users().count().get(),db.collectionGroup('transactions').where('type','==','withdrawal').where('status','==','pending').count().get(),db.collection('adminAudit').orderBy('createdAt','desc').limit(20).get()
 ]);
 return {totalUsers:count.data().count,pendingWithdrawals:pending.data().count,audit:logs.docs.map(asRow)};
});
exports.adminListUsers=callable('adminListUsers',async req=>{
 await adminUser(req);const cursor=sanitizeText(req.data?.cursor,128);let q=users().orderBy(admin.firestore.FieldPath.documentId()).limit(25);if(cursor)q=q.startAfter(cursor);
 const snap=await q.get();const list=await Promise.all(snap.docs.map(async d=>{
  const [account,counts]=await Promise.all([admin.auth().getUser(d.id).catch(()=>null),d.ref.collection('referrals').count().get()]);
  return {uid:d.id,...jsonValue(d.data()),name:account?.displayName||'',email:account?.email||'',disabled:account?.disabled??true,referralCount:counts.data().count};
 }));return {users:list,nextCursor:snap.docs.length===25?snap.docs.at(-1).id:null};
});
exports.adminFindUser=callable('adminFindUser',async req=>{
 await adminUser(req);const code=sanitizeText(req.data?.code,5);if(!referralCode(code))throw new HttpsError('invalid-argument','Enter a five-digit UID');
 const snap=await db.doc('codes/'+code).get();if(!snap.exists)throw new HttpsError('not-found','Member code not found');return {uid:snap.data().uid};
});
exports.adminGetUser=callable('adminGetUser',async req=>{
 await adminUser(req);const uid=sanitizeText(req.data?.uid,128);if(!uid||uid.includes('/'))throw new HttpsError('invalid-argument','Invalid member ID');
 const ref=users().doc(uid);const [snap,account,transactions,referrals]=await Promise.all([
  ref.get(),admin.auth().getUser(uid).catch(()=>null),ref.collection('transactions').orderBy('createdAt','desc').limit(100).get(),ref.collection('referrals').orderBy('createdAt','desc').limit(100).get()
 ]);
 if(!snap.exists)throw new HttpsError('not-found','Member not found');
 return {user:{uid,...jsonValue(snap.data()),name:account?.displayName||'',email:account?.email||'',disabled:account?.disabled??true},transactions:transactions.docs.map(asRow),referrals:referrals.docs.map(asRow)};
});
exports.adminEditUser=callable('adminEditUser',async req=>{
 const actor=await adminUser(req),uid=sanitizeText(req.data?.uid,128),patch=req.data?.patch;
 if(!uid||uid.includes('/')||!patch||typeof patch!=='object'||Array.isArray(patch))throw new HttpsError('invalid-argument','Invalid update request');
 const keys=Object.keys(patch);if(keys.length===0||keys.some(k=>!['balance','totalDeposited','note'].includes(k)))throw new HttpsError('invalid-argument','Only editable fields may be changed');
 for(const key of ['balance','totalDeposited'])if(key in patch&&!integer(patch[key]))throw new HttpsError('invalid-argument','Amounts must be whole positive credits');
 if('note'in patch){if(typeof patch.note!=='string')throw new HttpsError('invalid-argument','Admin note must be text');patch.note=sanitizeText(patch.note,500);}
 return db.runTransaction(async t=>{
  const user=users().doc(uid),snapshot=await t.get(user);if(!snapshot.exists)throw new HttpsError('not-found','Member not found');const old=snapshot.data();
  if(!integer(old.balance)||!integer(old.totalDeposited))throw new HttpsError('failed-precondition','Account data invalid. Review in Firestore.');
  const next={...patch,updatedAt:stamp()};t.update(user,next);
  if('balance'in patch&&patch.balance!==old.balance)t.create(user.collection('transactions').doc(),{type:'admin adjustment',amount:patch.balance-old.balance,status:'success',adminActor:actor,createdAt:stamp()});
  audit(t,actor,'editUser',uid,{before:Object.fromEntries(keys.map(k=>[k,old[k]??null])),after:patch});return {ok:true};
 });
});
exports.adminSetUserDisabled=callable('adminSetUserDisabled',async req=>{
 const actor=await adminUser(req),uid=sanitizeText(req.data?.uid,128),disabled=req.data?.disabled;
 if(!uid||uid.includes('/')||uid===actor||typeof disabled!=='boolean')throw new HttpsError('invalid-argument','Invalid account status request');
 const oldAccount=await admin.auth().getUser(uid);
 if(oldAccount.disabled===disabled)return {ok:true,duplicate:true};
 await admin.auth().updateUser(uid,{disabled});
 try{
  const batch=db.batch();
  batch.update(users().doc(uid),{disabled,updatedAt:stamp()});
  batch.create(db.collection('adminAudit').doc(),{actor,action:'setDisabled',target:uid,disabled,createdAt:stamp()});
  await batch.commit();
 }catch(e){
  // Firebase Auth and Firestore have no shared atomic transaction. Attempt recovery.
  console.error('Account status sync failed',e);
  try{await admin.auth().updateUser(uid,{disabled:oldAccount.disabled})}catch(revert){console.error('Could not revert Auth account status',revert)}
  throw new HttpsError('internal','Account status update failed. Refresh and check the member status.');
 }
 return {ok:true,duplicate:false};
});
exports.adminResolveWithdrawal=callable('adminResolveWithdrawal',async req=>{
 const actor=await adminUser(req),uid=sanitizeText(req.data?.uid,128),id=sanitizeText(req.data?.transactionId,128),status=req.data?.status;
 if(!uid||uid.includes('/')||!operationId(id)||!['success','cancelled'].includes(status))throw new HttpsError('invalid-argument','Invalid withdrawal decision');
 return db.runTransaction(async t=>{
  const u=users().doc(uid),transaction=txRef(uid,id);const [us,ts]=await Promise.all([t.get(u),t.get(transaction)]);
  if(!us.exists||!ts.exists)throw new HttpsError('not-found','Record not found');const current=ts.data();
  if(current.type!=='withdrawal')throw new HttpsError('failed-precondition','Not a withdrawal request');
  if(current.status===status)return {ok:true,duplicate:true};
  if(current.status!=='pending')throw new HttpsError('failed-precondition','Request already processed');
  if(!integer(current.amount,MIN_WITHDRAWAL,100000))throw new HttpsError('failed-precondition','Invalid pending request amount');
  if(status==='cancelled'){
   if(!integer(us.data().balance,0,MAX_CREDITS-current.amount))throw new HttpsError('failed-precondition','Refund would exceed account credit limit');
   t.update(u,{balance:increment(current.amount),updatedAt:stamp()});
  }
  t.update(transaction,{status,reviewedBy:actor,reviewedAt:stamp()});audit(t,actor,'withdrawalDecision',uid,{transactionId:id,status,amount:current.amount});return {ok:true,duplicate:false};
 });
});
exports.healthCheck=callable('healthCheck',async req=>{await activeUser(req);await users().limit(1).get();return {ok:true}});
