import { ensureMonth, getMonth, totals } from './core.mjs?v=20261107-month-end-closure';

export const UNACCOUNTED_CATEGORY='month-end-unaccounted';
export const UNACCOUNTED_NAME='Unaccounted Amount';
const accounts=['cash','bank'];
export const adjustmentId=(key,account)=>`closure-unaccounted-${key}-${account}`;
export const isClosureAdjustment=tx=>tx.source==='Month-End Closure' && typeof tx.closureMonth==='string';
export const blankClosure=()=>({expectedSavings:null,expectedExpenses:null,actualCash:null,actualBank:null,status:'open',needsReview:false});
export const getClosure=(state,key)=>getMonth(state,key).closure||blankClosure();
const validAmount=value=>value===null || (Number.isSafeInteger(value)&&Math.abs(value)<=1e13);
function editable(state,key) {
  const closure=getClosure(state,key);
  if(closure.status==='closed')throw Error('Reopen this month before correcting its closure.');
  return closure;
}
export function saveClosureInputs(state,key,values,now=new Date().toISOString()) {
  editable(state,key);
  for(const [field,value] of Object.entries(values)) {
    if(!['expectedSavings','expectedExpenses','actualCash','actualBank'].includes(field)||!validAmount(value))throw Error('Enter a valid closing amount.');
    if(['expectedExpenses','actualCash'].includes(field)&&value!==null&&value<0)throw Error('Expected expenses and actual cash must be zero or greater.');
  }
  const m=ensureMonth(state,key);
  m.closure={...(m.closure||blankClosure()),...values,savedAt:now};
}
// Add back only our own posted adjustment to obtain the balance from ordinary
// records. Recomputing an adjustment replaces its total, never adds it twice.
export function closureSummary(state,key) {
  const m=getMonth(state,key),c=getClosure(state,key),t=totals(state,key);
  const adjustments=m.transactions.filter(tx=>isClosureAdjustment(tx)&&tx.closureMonth===key&&tx.keep!==false&&tx.type==='expense');
  const posted=account=>adjustments.filter(tx=>tx.wallet===account).reduce((sum,tx)=>sum+tx.amount,0);
  const recordedCash=posted('cash'),recordedBank=posted('bank');
  const calculatedCash=t.cash+recordedCash,calculatedBank=t.bank+recordedBank;
  const cashShortfall=c.actualCash===null?null:Math.max(0,calculatedCash-c.actualCash);
  const bankShortfall=c.actualBank===null?null:Math.max(0,calculatedBank-c.actualBank);
  const cashExcess=c.actualCash===null?null:Math.max(0,c.actualCash-calculatedCash);
  const bankExcess=c.actualBank===null?null:Math.max(0,c.actualBank-calculatedBank);
  const actualSavings=c.actualCash===null||c.actualBank===null?null:c.actualCash+c.actualBank+t.investment+t.lent-t.held;
  const savingsDifference=actualSavings===null||c.expectedSavings===null?null:actualSavings-c.expectedSavings;
  const unaccounted=cashShortfall===null||bankShortfall===null?null:cashShortfall+bankShortfall;
  const recordedUnaccounted=recordedCash+recordedBank;
  return {expectedSavings:c.expectedSavings,expectedExpenses:c.expectedExpenses,actualCash:c.actualCash,actualBank:c.actualBank,
    investment:t.investment,lent:t.lent,held:t.held,calculatedCash,calculatedBank,recordedCash,recordedBank,
    calculatedSavings:calculatedCash+calculatedBank+t.investment+t.lent-t.held,
    actualSavings,savingsDifference,cashShortfall,bankShortfall,cashExcess,bankExcess,unaccounted,recordedUnaccounted,
    remainingUnaccounted:unaccounted===null?null:unaccounted-recordedUnaccounted,
    expensesBeforeAdjustment:t.actual-recordedUnaccounted,actualExpenses:t.actual,
    expensesDifference:c.expectedExpenses===null?null:t.actual-c.expectedExpenses,
    target:savingsDifference===null?'not-set':savingsDifference===0?'achieved':savingsDifference>0?'exceeded':'missed'};
}
export function adjustmentsNeedSync(state,key) {
  const summary=closureSummary(state,key),m=getMonth(state,key);
  if(summary.unaccounted===null)return false;
  return accounts.some(account=>{
    const rows=m.transactions.filter(tx=>isClosureAdjustment(tx)&&tx.closureMonth===key&&tx.wallet===account);
    const amount=summary[account+'Shortfall'];
    return amount===0?rows.length>0:rows.length!==1 || rows[0].id!==adjustmentId(key,account) || rows[0].amount!==amount || rows[0].keep===false || rows[0].type!=='expense' || rows[0].category!==UNACCOUNTED_CATEGORY;
  });
}
export function recordUnaccountedExpense(state,key,reviewed=false) {
  editable(state,key);
  if(!reviewed)throw Error('Review missing transactions, transfers, lending, borrowing and investment movements first.');
  const summary=closureSummary(state,key);
  if(summary.unaccounted===null)throw Error('Save both actual closing balances before recording an adjustment.');
  const m=ensureMonth(state,key);
  const ids=new Set(accounts.map(account=>adjustmentId(key,account)));
  if(m.transactions.some(tx=>ids.has(tx.id)&&!isClosureAdjustment(tx)))throw Error('An adjustment identifier conflicts with an existing transaction. Existing records have been kept.');
  m.transactions=m.transactions.filter(tx=>!(isClosureAdjustment(tx)&&tx.closureMonth===key));
  if(summary.unaccounted>0&&!m.budgets.some(b=>b.id===UNACCOUNTED_CATEGORY))m.budgets.push({id:UNACCOUNTED_CATEGORY,name:UNACCOUNTED_NAME,amount:0});
  const date=`${key}-${new Date(Number(key.slice(0,4)),Number(key.slice(5)),0).getDate()}`;
  for(const account of accounts) {
    const amount=summary[account+'Shortfall'];
    if(amount>0)m.transactions.push({id:adjustmentId(key,account),date,description:`Unaccounted Amount · ${account==='cash'?'Cash':'Bank'} · month-end reconciliation`,
      amount,type:'expense',wallet:account,category:UNACCOUNTED_CATEGORY,categoryName:UNACCOUNTED_NAME,keep:true,source:'Month-End Closure',closureMonth:key});
  }
  return summary.unaccounted;
}
function stable(value) {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
// A compact deterministic change detector, not a security or authentication hash.
export function closureFingerprint(state,key) {
  const m=getMonth(state,key),c=getClosure(state,key),t=totals(state,key);
  const input=stable({transactions:m.transactions,investment:m.investment,moneyEntries:m.moneyEntries,
    openingCash:m.cash,openingBank:m.bank,calculatedCash:t.cash,calculatedBank:t.bank,
    expectedSavings:c.expectedSavings,expectedExpenses:c.expectedExpenses,actualCash:c.actualCash,actualBank:c.actualBank});
  let hash=14695981039346656037n;
  for(let index=0;index<input.length;index++)hash=BigInt.asUintN(64,(hash^BigInt(input.charCodeAt(index)))*1099511628211n);
  return hash.toString(16).padStart(16,'0');
}
export function closureNeedsReview(state,key) {
  const c=getClosure(state,key);
  return !!c.needsReview || !!(c.snapshot&&c.reviewFingerprint!==closureFingerprint(state,key));
}
export function flagClosureChanges(state) {
  for(const [key,m] of Object.entries(state.months))if(m.closure?.status==='closed'&&closureNeedsReview(state,key))m.closure.needsReview=true;
}
export function closeMonth(state,key,reviewed=false,now=new Date().toISOString()) {
  editable(state,key);
  const c=getClosure(state,key),summary=closureSummary(state,key);
  if(c.expectedSavings===null||c.expectedExpenses===null)throw Error('Manually enter and save both expected figures before closing the month.');
  if(summary.actualSavings===null)throw Error('Save both actual closing balances before closing the month.');
  if(!reviewed)throw Error('Review the account differences and closing investments, lending and borrowing before closing.');
  if(adjustmentsNeedSync(state,key))throw Error('Record or update the unaccounted expense before closing this month.');
  const m=ensureMonth(state,key);
  m.closure={...c,status:'closed',needsReview:false,closedAt:now,savedAt:now,snapshot:summary,reviewFingerprint:closureFingerprint(state,key)};
}
export function reopenMonth(state,key,now=new Date().toISOString()) {
  const m=state.months[key];
  if(!m?.closure||m.closure.status!=='closed')throw Error('This month is already open.');
  m.closure.status='open';m.closure.reopenedAt=now;
}
export function closureComparison(state,key) {
  const c=getClosure(state,key);
  const summary=c.status==='closed'&&c.snapshot?c.snapshot:closureSummary(state,key);
  return {...summary,month:key,status:c.status,needsReview:closureNeedsReview(state,key)};
}
