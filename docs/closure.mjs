import { ensureMonth, getMonth, totals } from './core.mjs?v=20261107-closure-balances-v2';

export const UNACCOUNTED_CATEGORY='month-end-unaccounted';
export const UNACCOUNTED_NAME='Unaccounted Amount';
const accounts=['cash','bank'];
export const adjustmentId=(key,account)=>`closure-unaccounted-${key}-${account}`;
export const isClosureAdjustment=tx=>tx.source==='Month-End Closure' && typeof tx.closureMonth==='string';
export const COMPONENT_FIELDS=['openingInvestment','closingInvestment','openingLent','closingLent','openingHeld','closingHeld'];
export const blankClosure=()=>({expectedSavings:null,expectedExpenses:null,actualCash:null,actualBank:null,
  ...Object.fromEntries(COMPONENT_FIELDS.map(field=>[field,null])),cashFinancialAdjustment:0,bankFinancialAdjustment:0,inputVersion:2,status:'open',needsReview:false});
export const getClosure=(state,key)=>getMonth(state,key).closure||blankClosure();
export function componentValues(state,key) {
  const c=getClosure(state,key),t=totals(state,key);
  return Object.fromEntries(COMPONENT_FIELDS.map(field=>{
    const fallback=c.inputVersion===2||field.startsWith('opening')?null:
      field==='closingInvestment'?(c.snapshot?.investment??t.investment):field==='closingLent'?(c.snapshot?.lent??t.lent):(c.snapshot?.held??t.held);
    return [field,c[field]??fallback];
  }));
}
const validAmount=value=>value===null || (Number.isSafeInteger(value)&&Math.abs(value)<=1e13);
function editable(state,key) {
  const closure=getClosure(state,key);
  if(closure.status==='closed')throw Error('Reopen this month before correcting its closure.');
  return closure;
}
export function saveClosureInputs(state,key,values,now=new Date().toISOString()) {
  editable(state,key);
  for(const [field,value] of Object.entries(values)) {
    if(field==='expectedExpenses')throw Error('Expected Expenses is automatic. Update This Month’s Tentative Expenses through Monthly Budget Reference.');
    if(!['expectedSavings','actualCash','actualBank','cashFinancialAdjustment','bankFinancialAdjustment',...COMPONENT_FIELDS].includes(field)||!validAmount(value))throw Error('Enter a valid closing amount.');
    if((field==='actualCash'||COMPONENT_FIELDS.includes(field))&&value!==null&&value<0)throw Error('Cash and component values must be zero or greater.');
    if(field.endsWith('FinancialAdjustment')&&value===null)throw Error('Enter zero when no financial movement adjustment is needed.');
  }
  const existing=getClosure(state,key),components=componentValues(state,key);
  const m=ensureMonth(state,key);
  m.closure={...blankClosure(),...existing,...components,...values,inputVersion:2,expectedExpenses:totals(state,key).tentative,savedAt:now};
}
export function copyMonthlyComponents(state,key,stage) {
  if(!['opening','closing'].includes(stage))throw Error('Choose opening or closing figures.');
  const t=totals(state,key);
  saveClosureInputs(state,key,{[stage+'Investment']:t.investment,[stage+'Lent']:t.lent,[stage+'Held']:t.held});
}
// Add back only our own posted adjustment to obtain the balance from ordinary
// records. Recomputing an adjustment replaces its total, never adds it twice.
export function closureSummary(state,key) {
  const m=getMonth(state,key),c=getClosure(state,key),t=totals(state,key);
  const adjustments=m.transactions.filter(tx=>isClosureAdjustment(tx)&&tx.closureMonth===key&&tx.keep!==false&&tx.type==='expense');
  const posted=account=>adjustments.filter(tx=>tx.wallet===account).reduce((sum,tx)=>sum+tx.amount,0);
  const recordedCash=posted('cash'),recordedBank=posted('bank');
  const calculatedCash=t.cash+recordedCash,calculatedBank=t.bank+recordedBank;
  const components=componentValues(state,key),{closingInvestment:investment,closingLent:lent,closingHeld:held}=components;
  const cashFinancialAdjustment=c.cashFinancialAdjustment??0,bankFinancialAdjustment=c.bankFinancialAdjustment??0;
  const netFinancialAdjustment=cashFinancialAdjustment+bankFinancialAdjustment;
  const cashGap=c.actualCash===null?null:calculatedCash-c.actualCash-cashFinancialAdjustment;
  const bankGap=c.actualBank===null?null:calculatedBank-c.actualBank-bankFinancialAdjustment;
  const calculatedAccounts=calculatedCash+calculatedBank;
  const actualAccounts=c.actualCash===null||c.actualBank===null?null:c.actualCash+c.actualBank;
  const unaccounted=actualAccounts===null?null:Math.max(0,calculatedAccounts-actualAccounts-netFinancialAdjustment);
  // Allocate the combined shortfall to the affected account. An offset between
  // cash and bank (for example a missing own-account transfer) is not spending.
  const cashShortfall=unaccounted===null?null:Math.min(Math.max(0,cashGap),unaccounted);
  const bankShortfall=unaccounted===null?null:unaccounted-cashShortfall;
  const cashExcess=cashGap===null?null:Math.max(0,-cashGap),bankExcess=bankGap===null?null:Math.max(0,-bankGap);
  const actualSavings=actualAccounts===null||[investment,lent,held].some(value=>value===null)?null:actualAccounts+investment+lent-held;
  const savingsDifference=actualSavings===null||c.expectedSavings===null?null:actualSavings-c.expectedSavings;
  const recordedUnaccounted=recordedCash+recordedBank;
  const expectedExpenses=t.tentative;
  const change=(opening,closing)=>opening===null||closing===null?null:closing-opening;
  return {expectedSavings:c.expectedSavings,expectedExpenses,actualCash:c.actualCash,actualBank:c.actualBank,
    ...components,investment,lent,held,investmentDifference:change(components.openingInvestment,investment),
    lentDifference:change(components.openingLent,lent),heldDifference:change(components.openingHeld,held),
    cashFinancialAdjustment,bankFinancialAdjustment,netFinancialAdjustment,calculatedAccounts,actualAccounts,
    calculatedCash,calculatedBank,recordedCash,recordedBank,
    calculatedSavings:[investment,lent,held].some(value=>value===null)?null:calculatedAccounts+investment+lent-held,
    actualSavings,savingsDifference,cashShortfall,bankShortfall,cashExcess,bankExcess,unaccounted,recordedUnaccounted,
    remainingUnaccounted:unaccounted===null?null:unaccounted-recordedUnaccounted,
    expensesBeforeAdjustment:t.actual-recordedUnaccounted,actualExpenses:t.actual,
    expensesDifference:t.actual-expectedExpenses,
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
    expectedSavings:c.expectedSavings,expectedExpenses:c.expectedExpenses,actualCash:c.actualCash,actualBank:c.actualBank,
    ...(c.inputVersion===2?{inputVersion:2,overviewExpectedExpenses:t.tentative,...componentValues(state,key),
      cashFinancialAdjustment:c.cashFinancialAdjustment??0,bankFinancialAdjustment:c.bankFinancialAdjustment??0}:{})});
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
  if(c.expectedSavings===null)throw Error('Manually enter and save Expected Closing Savings before closing the month.');
  if(c.actualCash===null||c.actualBank===null)throw Error('Save both actual closing balances before closing the month.');
  if(COMPONENT_FIELDS.some(field=>componentValues(state,key)[field]===null))throw Error('Save all six opening and closing component figures, including zero where appropriate, before closing.');
  if(!reviewed)throw Error('Review the account differences and closing investments, lending and borrowing before closing.');
  if(adjustmentsNeedSync(state,key))throw Error('Record or update the unaccounted expense before closing this month.');
  const m=ensureMonth(state,key);
  // Upgrade only an explicitly edited/closed record, leaving older snapshots
  // and their original expected-expense fields intact until then.
  m.closure={...blankClosure(),...c,...componentValues(state,key),inputVersion:2,expectedExpenses:summary.expectedExpenses,
    status:'closed',needsReview:false,closedAt:now,savedAt:now,snapshot:summary};
  m.closure.reviewFingerprint=closureFingerprint(state,key);
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
