// All stored money is integer paise. Monthly budgets are historical snapshots;
// budgetReference is shared; investments and outstanding loans belong to a month.
export const FIELDS = ['cash', 'bank', 'lent', 'held', 'tentative'];
export const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function money(value) {
  const number = Number(String(value ?? '').replace(/[,₹\s]/g, ''));
  if (!Number.isFinite(number) || Math.abs(number) > 1e11) throw new Error('Enter a valid amount below ₹1,00,00,00,00,000.');
  return Math.round((number + Number.EPSILON) * 100);
}
export const rupees = paise => (Number(paise || 0) / 100).toFixed(2);
export const formatMoney = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
export const monthNow = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
export const monthName = month => new Date(`${month}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const copy = value => structuredClone(value);
const defaultBudgets = () => [['food','Food & groceries'],['transport','Transport'],['bills','Bills & utilities'],['health','Health'],['shopping','Shopping'],['other','Other']].map(([id,name]) => ({id,name,amount:0}));
export function createState() {
  return {version:3, months:{}, budgetReference:defaultBudgets()};
}
export function checkMonth(key) {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(key)) throw new Error('Choose a month between 2000 and 2100.');
}
function nextMonth(key) {
  let y=Number(key.slice(0,4)), m=Number(key.slice(5));
  if (++m===13) {y++;m=1;}
  return `${y}-${String(m).padStart(2,'0')}`;
}
const blankMonth = budgets => ({cash:null,bank:null,tentative:null,budgets:copy(budgets),carryOverrides:{},carryReset:false,transactions:[],investment:[],moneyEntries:[]});
// Reading a month is deliberately side-effect free. Viewing an unsaved month
// must never create records, copy another month's entries, or activate resets.
export function getMonth(state,key) {
  checkMonth(key);
  return state.months[key] || blankMonth(state.budgetReference);
}
export function migrateMonthlyRecords(previous) {
  if(previous?.version===3)return copy(previous);
  if(previous?.version!==2||!previous.months||!Array.isArray(previous.investment)||!Array.isArray(previous.moneyEntries))throw new Error('The older monthly records could not be read. Existing records have been kept.');
  const {investment,moneyEntries,...state}=copy(previous);
  state.version=3;
  for(const [key,m] of Object.entries(state.months)) {
    checkMonth(key);
    m.investment??=[];m.moneyEntries??=[];
  }
  // The old app stored one shared set, with no historical month information.
  // Preserve it once in a fixed month before any screen or month is selected.
  // Reset-only placeholders must not claim older financial records.
  if(investment.length||moneyEntries.length) {
    const key=Object.keys(state.months).filter(k=>!state.months[k].carryResetOnly).sort().at(-1)||monthNow();
    const m=state.months[key]||=blankMonth(state.budgetReference);
    if(m.investment.length||m.moneyEntries.length)throw new Error('Older shared entries conflict with saved monthly entries. Existing records have been kept.');
    m.investment=investment;m.moneyEntries=moneyEntries;
    delete m.carryResetOnly;
  }
  return state;
}
export function ensureMonth(state,key) {
  checkMonth(key);
  if (!state.months[key]) {
    const prior=Object.keys(state.months).filter(k=>k<key).sort().at(-1);
    // Skipped months inherit the last saved allowance. The requested new month
    // uses the shared reference; existing months are never rewritten here.
    if (prior) for (let k=nextMonth(prior);k<key;k=nextMonth(k)) {
      const previous=Object.keys(state.months).filter(p=>p<k).sort().at(-1);
      if (!state.months[k]) state.months[k]=blankMonth(state.months[previous].budgets);
    }
    state.months[key]=blankMonth(state.budgetReference);
  }
  // Explicitly entering or editing data activates a month previously created
  // only to remember a manual carry-forward reset. Selecting it never does.
  delete state.months[key].carryResetOnly;
  return state.months[key];
}
export function applyBudgetReference(state,key) {
  const month=ensureMonth(state,key);
  const closureBudget=month.budgets.find(b=>b.id==='month-end-unaccounted');
  if (month.transactions.some(t=>t.category && !state.budgetReference.some(b=>b.id===t.category) && !(t.source==='Month-End Closure'&&t.category===closureBudget?.id))) {
    throw new Error('A transaction in this month uses a category missing from the reference. Reassign that transaction before applying the reference.');
  }
  month.budgets=copy(state.budgetReference);
  if(closureBudget&&!month.budgets.some(b=>b.id===closureBudget.id))month.budgets.push(copy(closureBudget));
  for (const t of month.transactions) if (t.category) t.categoryName=month.budgets.find(b=>b.id===t.category)?.name || t.categoryName;
}
export function loanTotals(state,key) {
  return getMonth(state,key).moneyEntries.reduce((sum,e)=>{sum[e.kind==='lent'?'lent':'held']+=e.amount;return sum;},{lent:0,held:0});
}
export function budgetReferenceTotal(state) {
  return state.budgetReference.reduce((sum,budget)=>sum+budget.amount,0);
}
export function totals(state,key) {
  checkMonth(key);
  const m=state.months[key];
  // Unsaved months and reset-only placeholders display zero account balances.
  // Saved months keep the existing opening-balance and transaction calculation,
  // including inheritance when a saved opening value was left blank.
  let cash=0, bank=0;
  for (const k of Object.keys(state.months).filter(k=>m&&!m.carryResetOnly&&k<=key).sort()) {
    const saved=state.months[k];
    if (saved.cash!==null && saved.cash!==undefined) cash=saved.cash;
    if (saved.bank!==null && saved.bank!==undefined) bank=saved.bank;
    for (const tx of saved.transactions.filter(t=>t.keep!==false)) {
      const delta=tx.type==='income'?tx.amount:-tx.amount;
      if (tx.wallet==='cash') cash+=delta;
      if (tx.wallet==='bank') bank+=delta;
    }
  }
  const {lent,held}=loanTotals(state,key);
  const kept=(m?.transactions||[]).filter(t=>t.keep!==false);
  const actual=kept.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  // Blank or zero manual amounts use the total shown on Monthly Budget
  // Reference. Other saved amounts keep their existing behavior. Reading this
  // default never changes saved monthly budgets or any other records.
  const manual=m?.tentative;
  const tentative=manual==null||manual===0?budgetReferenceTotal(state):manual;
  const investment=(m?.investment||[]).reduce((s,i)=>s+i.amount,0);
  const withoutInvestment=cash+bank+lent-held-tentative;
  return {cash,bank,lent,held,tentative,actual,investment,savings:withoutInvestment+investment,withoutInvestment,liquid:cash+bank-held-tentative};
}
export function carryForward(state,key) {
  checkMonth(key);
  const existing=Object.keys(state.months).filter(k=>k<=key).sort();
  const firstAccruing=Object.keys(state.months).filter(k=>!state.months[k].carryResetOnly).sort()[0];
  if (!existing.length||(!state.months[key]&&(!firstAccruing||key<firstAccruing))) return state.budgetReference.map(b=>({...b,opening:0,allowance:b.amount,spent:0,calculated:b.amount,balance:b.amount,edited:false,reset:false,adjustment:0}));
  const months=[];let inherited=state.months[existing[0]].budgets;
  for (let k=existing[0];k<=key;k=nextMonth(k)) {
    const inactive=!firstAccruing||k<firstAccruing;
    const m=state.months[k] || blankMonth(inactive?[]:k===key?state.budgetReference:inherited);
    inherited=m.budgets;months.push([k,m]);
  }
  const ids=new Map();
  for (const [,m] of months) {
    for (const b of m.budgets) ids.set(b.id,{id:b.id,name:b.name});
    for (const t of m.transactions) if(t.category && !ids.has(t.category)) ids.set(t.category,{id:t.category,name:t.categoryName||'Archived category'});
    for (const id of Object.keys(m.carryOverrides||{})) if(!ids.has(id)) ids.set(id,{id,name:'Archived category'});
    for (const id of Object.keys(m.carryBoundaryAdjustment||{})) if(!ids.has(id)) ids.set(id,{id,name:'Archived category'});
  }
  return [...ids.values()].map(category=>{
    let prior=0,result;
    for (const [k,m] of months) {
      if(!firstAccruing||k<=firstAccruing)prior=0;
      const allowance=m.budgets.find(b=>b.id===category.id)?.amount||0;
      const spent=m.transactions.filter(t=>t.keep!==false && t.type==='expense' && t.category===category.id).reduce((s,t)=>s+t.amount,0);
      const calculated=prior+allowance-spent;
      const edited=Object.hasOwn(m.carryOverrides||{},category.id);
      const balance=edited?m.carryOverrides[category.id]:m.carryReset?0:calculated;
      if(k===key) result={...category,opening:prior,allowance,spent,calculated,balance,edited,reset:!!m.carryReset,adjustment:balance-calculated};
      // Read compensation saved by older versions until a new reset removes
      // it from that point onward. New resets carry the actual closing balance.
      prior=balance+(m.carryBoundaryAdjustment?.[category.id]||0);
    }
    return result;
  });
}
export function resetYearCarryForward(state,year) {
  resetMonthsCarryForward(state,year,Array.from({length:12},(_,index)=>index+1));
}
export function resetMonthsCarryForward(state,year,selectedMonths) {
  year=String(year);
  if(!/^(20\d{2}|2100)$/.test(year))throw new Error('Choose a year between 2000 and 2100.');
  if(!Array.isArray(selectedMonths)||!selectedMonths.length||selectedMonths.some(value=>!/^(0?[1-9]|1[0-2])$/.test(String(value))))throw new Error('Select one or more valid months within the selected year.');
  const numbers=[...new Set(selectedMonths.map(Number))].sort((a,b)=>a-b);
  const keys=Object.keys(state.months).sort(),keyFor=number=>`${year}-${String(number).padStart(2,'0')}`;
  const selected=new Set(numbers.map(keyFor)),first=keyFor(numbers[0]);
  const monthBudgets=key=>{
    const prior=keys.filter(k=>k<key).at(-1);
    return prior?state.months[prior].budgets:keys.length?state.months[keys[0]].budgets:state.budgetReference;
  };
  // Preserve the amount of later manual adjustments, rather than pinning their
  // old absolute closing balances and blocking the updated opening balance.
  const laterEdits=new Map();
  for(const key of keys.filter(key=>key>first&&!selected.has(key))) {
    if(Object.keys(state.months[key].carryOverrides||{}).length) {
      laterEdits.set(key,new Map(carryForward(state,key).filter(row=>row.edited).map(row=>[row.id,row.adjustment])));
    }
  }
  for(const number of numbers) {
    const key=keyFor(number);
    if(!state.months[key]) {
      // Do not use ensureMonth here: filling a gap could create records in
      // other years. Existing monthly budget snapshots are never rewritten.
      state.months[key]={...blankMonth(monthBudgets(key)),carryResetOnly:true};
    }
    state.months[key].carryReset=true;
    state.months[key].carryOverrides={};
  }
  // Historical compensation must not restore an old balance in a succeeding
  // month. Earlier months, budgets and all non-carry records remain untouched.
  for(const [key,month] of Object.entries(state.months))if(key>=first)delete month.carryBoundaryAdjustment;
  // Process later edits in date order so each one uses the preceding month's
  // recalculated closing balance, including across gaps and year boundaries.
  for(const [key,adjustments] of laterEdits) {
    for(const row of carryForward(state,key))if(adjustments.has(row.id)) {
      state.months[key].carryOverrides[row.id]=row.calculated+adjustments.get(row.id);
    }
  }
}
function checkDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) throw new Error('Enter a valid date.');
  const parsed=new Date(date+'T12:00:00Z');
  if(!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==date) throw new Error('Enter a valid date.');
}
export function validateTransaction(tx,month,budgets) {
  checkDate(tx.date);
  if(tx.date.slice(0,7)!==month) throw new Error('Transaction date must be in the selected month.');
  if(!Number.isSafeInteger(tx.amount) || tx.amount<=0) throw new Error('Amount must be greater than zero.');
  if(!['income','expense'].includes(tx.type) || !['cash','bank'].includes(tx.wallet)) throw new Error('Choose a transaction type and account.');
  const category=budgets.find(b=>b.id===tx.category);
  if(!category) throw new Error('Choose a category before saving this transaction.');
  return {...tx,description:String(tx.description||'').trim().slice(0,300),category:category.id,categoryName:category.name};
}
export function validateLoan(entry) {
  const name=String(entry.name||'').trim();
  if(!name) throw new Error('Enter the person’s name.');
  if(!Number.isSafeInteger(entry.amount) || entry.amount<=0) throw new Error('Amount must be greater than zero.');
  if(!['lent','borrowed'].includes(entry.kind)) throw new Error('Choose lending or borrowing.');
  if(entry.date) checkDate(entry.date);
  return {...entry,name:name.slice(0,100),date:entry.date||'',description:String(entry.description||'').trim().slice(0,300)};
}
export function carryHistory(state,mode='all',selected='') {
  return Object.keys(state.months).sort().filter(k=>mode==='all'||(mode==='year'?k.startsWith(selected+'-'):k===selected)).flatMap(k=>carryForward(state,k).map(row=>({...row,month:k})));
}
export function history(state,mode='all',selected='') {
  return Object.keys(state.months).sort().filter(k=>mode==='all'||(mode==='year'?k.startsWith(selected+'-'):k===selected)).flatMap(k=>state.months[k].transactions.filter(t=>t.keep!==false).map(t=>({...t,month:k}))).sort((a,b)=>a.date.localeCompare(b.date));
}
export function migrateLegacy(legacy) {
  if(legacy?.version!==1 || !legacy.months || !Array.isArray(legacy.investment)) throw new Error('The older browser records could not be read.');
  const s=createState(),keys=Object.keys(legacy.months).sort();
  s.budgetReference=copy(keys.length?legacy.months[keys.at(-1)].budgets:s.budgetReference);
  for(const key of keys) {
    checkMonth(key);
    const {lent,held,...saved}=legacy.months[key];
    s.months[key]={...blankMonth(saved.budgets),...copy(saved)};
    for(const [amount,kind,label] of [[lent,'lent','Opening lending balance (migrated)'],[held,'borrowed','Opening borrowing balance (migrated)']]) {
      if(Number(amount)>0)s.months[key].moneyEntries.push({id:uid(),kind,name:label,amount:Number(amount),date:'',description:'Imported from this month’s saved total. Edit this entry to assign the amount to the correct person.'});
    }
  }
  if(legacy.investment.length) {
    const key=keys.at(-1)||monthNow();
    const m=s.months[key]||=blankMonth(s.budgetReference);
    m.investment=copy(legacy.investment);
  }
  return s;
}
export function hasRecords(state) {
  return state.budgetReference.some(b=>b.amount!==0) || Object.keys(state.months).length>0;
}
