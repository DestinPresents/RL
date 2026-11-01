'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function evaluate(file){
 let source=fs.readFileSync(path.join(root,file),'utf8');
 source=source.replace(/^import .+;\r?\n/gm,'');
 source=source.slice(0,source.indexOf('if(configured){'));
 const element={innerHTML:'',addEventListener(){}};
 const sandbox={firebaseConfig:{apiKey:'a',authDomain:'b',projectId:'c',appId:'d'},document:{getElementById:()=>element},location:{search:'',pathname:'/index.html',href:'https://unit.test/index.html'},navigator:{},sessionStorage:{getItem:()=>'',setItem(){},removeItem(){}},window:{scrollTo(){}},URL,URLSearchParams,crypto,console};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);return {sandbox,element};
}
test('all five member pages render with member data and without executable HTML injection',()=>{
 const {sandbox}=evaluate('app.js');
 vm.runInContext("user={displayName:'<img src=x onerror=alert(1)>',email:'test@sample.com'};profile={code:'12345',balance:250,totalDeposited:300,createdAt:{seconds:1793523600}};referrals=[{code:'98765',createdAt:{seconds:1793523600}}];transactions=[{id:'operation_123456789012',type:'deposit',status:'success',amount:300,createdAt:{seconds:1793523600}}]",sandbox);
 for(const tab of ['home','wallet','games','refer','profile']){
  const html=vm.runInContext(`view='${tab}';mainPage()`,sandbox);
  assert.match(html,/RewardLab|REWARDLAB/);
  assert.doesNotMatch(html,/<img src=x onerror=alert\(1\)>/);
  assert.match(html,/12345/);
 }
 assert.match(vm.runInContext("view='games';mainPage()",sandbox),/Aviator/);
 assert.match(vm.runInContext("view='games';mainPage()",sandbox),/Color Bingo/);
 assert.match(vm.runInContext("view='games';mainPage()",sandbox),/Coming soon/);
 assert.match(vm.runInContext("setup='error';setupPage()",sandbox),/Retry setup/);
});
test('admin member page safely displays details and review actions',()=>{
 const {sandbox,element}=evaluate('admin.js');
 vm.runInContext("me={email:'admin@example.com'};initializing=false;users=[{uid:'a',code:'12345',name:'<script>alert(1)</script>',balance:99}];selected='a';detail={user:{uid:'a',code:'12345',name:'<script>alert(1)</script>',email:'a@example.com',balance:99,totalDeposited:100,disabled:false},referrals:[],transactions:[{id:'operation_123456789012',type:'withdrawal',amount:200,status:'pending'}]};overview={totalUsers:1,pendingWithdrawals:1,audit:[]};render()",sandbox);
 assert.match(element.innerHTML,/Admin|CONTROL CENTER/);
 assert.match(element.innerHTML,/Approve/);
 assert.match(element.innerHTML,/Disable member/);
 assert.doesNotMatch(element.innerHTML,/<script>alert\(1\)<\/script>/);
});
test('responsive design and deployment controls included',()=>{
 const siteCSS=fs.readFileSync(path.join(root,'style.css'),'utf8');
 const adminCSS=fs.readFileSync(path.join(root,'admin.css'),'utf8');
 assert.match(siteCSS,/@media\(max-width:680px\)/);
 assert.match(siteCSS,/\.table-scroll\{overflow-x:auto/);
 assert.match(adminCSS,/@media\(max-width:540px\)/);
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'functions/package.json')));
 assert.equal(pkg.engines.node,'22');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/viewport-fit=cover/);
 assert.doesNotMatch(html,/\bdemo\b/i);
});
