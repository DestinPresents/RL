'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {test}=require('node:test');
const logic=require('../functions/logic');
const original=Module._load;
const users=new Map();
const records=new Map();
let seq=0;
const now=()=>({toDate:()=>new Date('2026-11-01T09:00:00.000Z')});
const F={serverTimestamp:now,increment:(value)=>({__increment:value})};
const clone=v=>structuredClone(v);
function apply(base,next){const update={...base};for(const [k,v] of Object.entries(next)){update[k]=v&&typeof v==='object'&&'__increment'in v?(update[k]||0)+v.__increment:v}return update}
class Doc{
 constructor(path){this.path=path;this.id=path.split('/').at(-1)}
 collection(name){return new Col(this.path+'/'+name)}
 get(){return Promise.resolve(snapshot(this.path))}
 set(data,opt={}){const existing=records.get(this.path);records.set(this.path,opt.merge&&existing?apply(existing,data):clone(data));return Promise.resolve()}
}
function snapshot(p){return {id:p.split('/').at(-1),exists:records.has(p),data:()=>records.has(p)?records.get(p):undefined,ref:new Doc(p)}}
class Query {
 constructor(prefix,filters=[],sort=null,max=null,after=null,collectionGroup=false){Object.assign(this,{prefix,filters,sort,max,after,collectionGroup})}
 where(key,op,value){return new Query(this.prefix,[...this.filters,[key,op,value]],this.sort,this.max,this.after,this.collectionGroup)}
 orderBy(key,direction='asc'){return new Query(this.prefix,this.filters,[key,direction],this.max,this.after,this.collectionGroup)}
 limit(n){return new Query(this.prefix,this.filters,this.sort,n,this.after,this.collectionGroup)}
 startAfter(id){return new Query(this.prefix,this.filters,this.sort,this.max,id,this.collectionGroup)}
 count(){return {get:async()=>{const n=(await this.get()).docs.length;return {data:()=>({count:n})}}}}
 async get(){let selected=[...records.keys()].filter(p=>{
  const parts=p.split('/');if(this.collectionGroup)return parts.at(-2)===this.prefix;
  return p.startsWith(this.prefix+'/')&&p.slice(this.prefix.length+1).split('/').length===1;
 });
 for(const [field,,value] of this.filters)selected=selected.filter(p=>records.get(p)[field]===value);
 if(this.sort){const [key,direction]=this.sort;const v=p=>key==='__name__'?p.split('/').at(-1):records.get(p)[key]?.seconds||0;selected.sort((a,b)=>(v(a)>v(b)?1:v(a)<v(b)?-1:0)*(direction==='desc'?-1:1))}
 if(this.after)selected=selected.filter(p=>p.split('/').at(-1)>this.after);
 if(this.max)selected=selected.slice(0,this.max);
 return {docs:selected.map(p=>snapshot(p)),empty:selected.length===0};
 }
}
class Col extends Query {constructor(p){super(p)}doc(id){return new Doc(this.prefix+'/'+(id||'auto'+(++seq)))}}
const db={doc:p=>new Doc(p),collection:p=>new Col(p),collectionGroup:name=>new Query(name,[],null,null,null,true),batch:()=>{
 const acts=[];return {update:(r,d)=>acts.push(['update',r,d]),create:(r,d)=>acts.push(['create',r,d]),commit:async()=>applyActs(acts)}},
 runTransaction:async fn=>{
  const acts=[];
  const t={get:async r=>r.get(),create:(r,d)=>acts.push(['create',r,d]),update:(r,d)=>acts.push(['update',r,d])};
  const result=await fn(t);applyActs(acts);return result;
 }};
function applyActs(acts){for(const [kind,r,d] of acts){const prev=records.get(r.path);if(kind==='create'&&prev)throw Error('Already exists: '+r.path);if(kind==='update'&&!prev)throw Error('Missing: '+r.path);records.set(r.path,apply(prev||{},d))}}
const auth={
 getUser:async uid=>{if(!users.has(uid)){const e=Error('No user');e.code='auth/user-not-found';throw e}return users.get(uid)},
 updateUser:async(uid,patch)=>{const u=await auth.getUser(uid);Object.assign(u,patch);return u},
 getUserByEmail:async email=>[...users.values()].find(x=>x.email===email),
 setCustomUserClaims:async(uid,claims)=>{(await auth.getUser(uid)).customClaims=claims}
};
const admin={apps:[],initializeApp(){this.apps.push({})},auth:()=>auth,firestore:()=>db};
admin.firestore.FieldValue=F;admin.firestore.FieldPath={documentId:()=> '__name__'};
class HttpsError extends Error {constructor(code,message){super(message);this.code=code}}
Module._load=function(request,parent,isMain){
 if(request==='firebase-functions/v2/https')return {onCall:(_options,handler)=>handler,HttpsError};
 if(request==='firebase-admin')return admin;
 return original.call(this,request,parent,isMain);
};
const callable=require('../functions/index');
Module._load=original;
const req=(uid,data={},isAdmin=false)=>({auth:uid?{uid,token:{admin:isAdmin}}:null,data});
const makeUser=(uid,google=true,isAdmin=false)=>users.set(uid,{uid,email:uid+'@example.test',displayName:'Member '+uid,providerData:google?[{providerId:'google.com'}]:[{providerId:'password'}],disabled:false,customClaims:{admin:isAdmin}});
const call=(name,...params)=>callable[name](...params);
const id=n=>'operation_'+String(n).padStart(14,'0');

// Run in a single ordered test so state transitions also exercise the actual callable exports.
test('registration, referrals, credits, withdrawals, admin permissions and history',async()=>{
 assert.deepEqual(logic.DEPOSIT_AMOUNTS,[100,200,300,500,1000]);
 assert.equal(logic.accountEligible(499,'aviator'),false);
 assert.equal(logic.accountEligible(500,'aviator'),true);
 assert.equal(logic.accountEligible(299,'ludo'),false);
 assert.equal(logic.accountEligible(300,'ludo'),true);
 assert.equal(logic.validWithdrawal(200,{balance:200,totalDeposited:100}),true);
 assert.equal(logic.validWithdrawal(199,{balance:999,totalDeposited:100}),false);
 makeUser('alice');makeUser('bob');makeUser('admin',true,true);makeUser('nongoogle',false);
 await assert.rejects(call('registerUser',req('nongoogle')),{code:'permission-denied'});
 await assert.rejects(call('registerUser',req(null)),{code:'unauthenticated'});
 await assert.rejects(call('registerUser',req('alice',{referral:'999999'})),{code:'invalid-argument'});
 const a=await call('registerUser',req('alice'));
 assert.match(a.code,/^\d{5}$/);
 assert.deepEqual(await call('registerUser',req('alice')),{code:a.code});
 assert.equal(records.get('users/alice').balance,50);
 await assert.rejects(call('registerUser',req('bob',{referral:'00000'})),{code:'invalid-argument'});
 const b=await call('registerUser',req('bob',{referral:a.code}));
 assert.match(b.code,/^\d{5}$/);
 assert.notEqual(a.code,b.code);
 assert.equal(records.get('users/alice').balance,60);
 assert.equal(records.get('users/bob').balance,50);
 assert.equal(records.get('users/bob').referredBy,a.code);
 assert.equal(records.get('users/alice/referrals/bob').code,b.code);
 await call('registerUser',req('bob',{referral:a.code}));
 assert.equal(records.get('users/alice').balance,60,'Signup retries must not reaward referrals');
 await assert.rejects(call('creditDeposit',req('alice',{amount:149,requestId:id(1)})),{code:'invalid-argument'});
 await call('creditDeposit',req('alice',{amount:300,requestId:id(2)}));
 assert.equal(records.get('users/alice').balance,360);
 await call('creditDeposit',req('alice',{amount:300,requestId:id(2)}));
 assert.equal(records.get('users/alice').balance,360,'Duplicate request must not re-credit');
 await assert.rejects(call('creditDeposit',req('alice',{amount:500,requestId:id(2)})),{code:'already-exists'});
 await assert.rejects(call('requestWithdrawal',req('bob',{amount:200,requestId:id(3)})),{code:'failed-precondition'});
 await assert.rejects(call('requestWithdrawal',req('alice',{amount:199,requestId:id(3)})),{code:'invalid-argument'});
 await call('requestWithdrawal',req('alice',{amount:200,requestId:id(4)}));
 assert.equal(records.get('users/alice').balance,160);
 assert.equal(records.get('users/alice/transactions/'+id(4)).status,'pending');
 await call('requestWithdrawal',req('alice',{amount:200,requestId:id(4)}));
 assert.equal(records.get('users/alice').balance,160,'Duplicate withdrawal must not reserve twice');
 await assert.rejects(call('adminResolveWithdrawal',req('bob',{uid:'alice',transactionId:id(4),status:'cancelled'})),{code:'permission-denied'});
 await call('adminResolveWithdrawal',req('admin',{uid:'alice',transactionId:id(4),status:'cancelled'},true));
 assert.equal(records.get('users/alice').balance,360,'Cancelled withdrawal must refund');
 await call('adminResolveWithdrawal',req('admin',{uid:'alice',transactionId:id(4),status:'cancelled'},true));
 assert.equal(records.get('users/alice').balance,360,'Repeated cancellation must not refund twice');
 await assert.rejects(call('adminResolveWithdrawal',req('admin',{uid:'alice',transactionId:id(4),status:'success'},true)),{code:'failed-precondition'});
 await call('requestWithdrawal',req('alice',{amount:200,requestId:id(5)}));
 await call('adminResolveWithdrawal',req('admin',{uid:'alice',transactionId:id(5),status:'success'},true));
 assert.equal(records.get('users/alice').balance,160,'Approved withdrawals stay deducted');
 assert.equal(records.get('users/alice/transactions/'+id(5)).status,'success');
 await assert.rejects(call('adminEditUser',req('admin',{uid:'alice',patch:{code:'22222'}},true)),{code:'invalid-argument'});
 await call('adminEditUser',req('admin',{uid:'alice',patch:{balance:500,note:'Verified member'}},true));
 assert.equal(records.get('users/alice').balance,500);
 assert.equal(records.get('users/alice').note,'Verified member');
 const detail=await call('adminGetUser',req('admin',{uid:'alice'},true));
 assert.equal(detail.user.code,a.code);
 assert.ok(detail.transactions.find(x=>x.type==='admin adjustment'));
 assert.ok(detail.transactions.find(x=>x.type==='withdrawal'&&x.status==='success'));
 const overview=await call('adminOverview',req('admin',{},true));
 assert.equal(overview.totalUsers,2);
 assert.equal(overview.pendingWithdrawals,0);
 const listing=await call('adminListUsers',req('admin',{},true));
 assert.equal(listing.users.length,2);
 assert.equal(listing.users.find(x=>x.uid==='alice').referralCount,1);
 assert.equal(((await call('adminFindUser',req('admin',{code:a.code},true))).uid),'alice');
 await call('adminSetUserDisabled',req('admin',{uid:'bob',disabled:true},true));
 assert.equal(users.get('bob').disabled,true);
 assert.equal(records.get('users/bob').disabled,true);
 await assert.rejects(call('creditDeposit',req('bob',{amount:100,requestId:id(6)})),{code:'permission-denied'});
 await assert.rejects(call('adminSetUserDisabled',req('admin',{uid:'admin',disabled:true},true)),{code:'invalid-argument'});
 await call('adminSetUserDisabled',req('admin',{uid:'bob',disabled:false},true));
 assert.equal(users.get('bob').disabled,false);
 assert.equal(records.get('users/bob').disabled,false);
 const check=await call('healthCheck',req('alice'));
 assert.equal(check.ok,true);
});
