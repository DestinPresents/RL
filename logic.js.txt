'use strict';
const DEPOSIT_AMOUNTS=Object.freeze([100,200,300,500,1000]);
const MIN_WITHDRAWAL=200;
const REQUIRED_WITHDRAWAL_DEPOSIT=100;
const GAME_REQUIREMENTS=Object.freeze({aviator:500,'color-bingo':300,rummy:300,ludo:300,'lucky-spin':300});
const MAX_CREDITS=100000000;
function integer(n,min=0,max=MAX_CREDITS){return Number.isSafeInteger(n)&&n>=min&&n<=max}
function validDeposit(n){return DEPOSIT_AMOUNTS.includes(n)}
function validWithdrawal(amount,profile){return integer(amount,MIN_WITHDRAWAL,100000)&&Number.isSafeInteger(profile?.totalDeposited)&&profile.totalDeposited>=REQUIRED_WITHDRAWAL_DEPOSIT&&integer(profile?.balance)&&profile.balance>=amount}
function referralCode(s){return typeof s==='string'&&/^\d{5}$/.test(s)}
function operationId(id){return typeof id==='string'&&/^[a-zA-Z0-9_-]{12,80}$/.test(id)}
function sanitizeText(s,max=120){return typeof s==='string'?s.trim().slice(0,max):''}
function accountEligible(totalDeposited,game){return integer(totalDeposited)&&totalDeposited>=(GAME_REQUIREMENTS[game]??Infinity)}
module.exports={DEPOSIT_AMOUNTS,MIN_WITHDRAWAL,REQUIRED_WITHDRAWAL_DEPOSIT,GAME_REQUIREMENTS,MAX_CREDITS,integer,validDeposit,validWithdrawal,referralCode,operationId,sanitizeText,accountEligible};
