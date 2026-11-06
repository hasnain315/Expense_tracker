// All stored money is integer paise. Monthly budgets are historical snapshots;
// budgetReference and outstanding loans are shared across the whole ledger.
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
  return {version:2, months:{}, budgetReference:defaultBudgets(), moneyEntries:[], investment:[
    {id:'gold',name:'Gold',amount:0}, {id:'mutual-funds',name:'Mutual funds',amount:0}
  ]};
}
export function checkMonth(key) {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(key)) throw new Error('Choose a month between 2000 and 2100.');
}
function nextMonth(key) {
  let y=Number(key.slice(0,4)), m=Number(key.slice(5));
  if (++m===13) {y++;m=1;}
  return `${y}-${String(m).padStart(2,'0')}`;
}
const blankMonth = budgets => ({cash:null,bank:null,tentative:null,budgets:copy(budgets),carryOverrides:{},carryReset:false,transactions:[]});
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
  if (month.transactions.some(t=>t.category && !state.budgetReference.some(b=>b.id===t.category))) {
    throw new Error('A transaction in this month uses a category missing from the reference. Reassign that transaction before applying the reference.');
  }
  month.budgets=copy(state.budgetReference);
  for (const t of month.transactions) if (t.category) t.categoryName=month.budgets.find(b=>b.id===t.category)?.name || t.categoryName;
}
export function loanTotals(state) {
  return state.moneyEntries.reduce((sum,e)=>{sum[e.kind==='lent'?'lent':'held']+=e.amount;return sum;},{lent:0,held:0});
}
export function totals(state,key) {
  checkMonth(key);
  const m=state.months[key];
  // Blank opening balances inherit the previous closing account balances, also
  // across December/January. An explicit zero is a saved manual opening value.
  let cash=0, bank=0;
  for (const k of Object.keys(state.months).filter(k=>k<=key).sort()) {
    const saved=state.months[k];
    if (saved.cash!==null && saved.cash!==undefined) cash=saved.cash;
    if (saved.bank!==null && saved.bank!==undefined) bank=saved.bank;
    for (const tx of saved.transactions.filter(t=>t.keep!==false)) {
      const delta=tx.type==='income'?tx.amount:-tx.amount;
      if (tx.wallet==='cash') cash+=delta;
      if (tx.wallet==='bank') bank+=delta;
    }
  }
  const {lent,held}=loanTotals(state);
  const kept=(m?.transactions||[]).filter(t=>t.keep!==false);
  const actual=kept.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const tentative=Number(m?.tentative||0);
  const investment=state.investment.reduce((s,i)=>s+i.amount,0);
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
      // A period-only reset keeps the next unselected month's opening balance.
      // Its adjustment is stored only on the last month of the reset period.
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
  const monthBudgets=key=>{
    const prior=keys.filter(k=>k<key).at(-1);
    return prior?state.months[prior].budgets:keys.length?state.months[keys[0]].budgets:state.budgetReference;
  };
  // Capture the outgoing balance at the end of each consecutive selected run
  // before changing anything. Missing months use their historical allowance,
  // so an unsaved month does not accidentally adopt today's budget reference.
  const boundaries=new Map();
  for(let index=0;index<numbers.length;index++) {
    if(numbers[index+1]===numbers[index]+1)continue;
    const key=keyFor(numbers[index]),original=state.months[key]||blankMonth(monthBudgets(key));
    const view={...state,months:{...state.months,[key]:original}};
    boundaries.set(key,keys.some(k=>k<=key&&!state.months[k].carryResetOnly)?Object.fromEntries(carryForward(view,key).map(row=>[
      row.id,row.balance+(original.carryBoundaryAdjustment?.[row.id]||0)
    ])):{});
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
    delete state.months[key].carryBoundaryAdjustment;
  }
  for(const [key,adjustment] of boundaries)state.months[key].carryBoundaryAdjustment=adjustment;
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
  s.investment=copy(legacy.investment);
  s.budgetReference=copy(keys.length?legacy.months[keys.at(-1)].budgets:s.budgetReference);
  for(const key of keys) {
    checkMonth(key);
    const {lent,held,...saved}=legacy.months[key];
    s.months[key]={...blankMonth(saved.budgets),...copy(saved)};
  }
  // Legacy lent/held fields were monthly snapshots, not separate loans. Use the
  // latest nonblank total once, so older copies do not multiply outstanding debt.
  for(const [field,kind,label] of [['lent','lent','Opening lending balance (migrated)'],['held','borrowed','Opening borrowing balance (migrated)']]) {
    const key=keys.filter(k=>legacy.months[k][field]!==null && legacy.months[k][field]!==undefined).at(-1);
    const amount=key?Number(legacy.months[key][field]):0;
    if(amount>0)s.moneyEntries.push({id:uid(),kind,name:label,amount,date:'',description:'Imported from the latest saved monthly total. Edit this entry to assign the amount to the correct person.'});
  }
  return s;
}
export function hasRecords(state) {
  return state.moneyEntries.length>0 || state.investment.some(i=>i.amount!==0) || state.budgetReference.some(b=>b.amount!==0) || Object.keys(state.months).length>0;
}
