import { createState, checkMonth, migrateMonthlyRecords } from './core.mjs?v=20261107-savings-comparison-v3';

// The website continues to use integer paise internally. ONLY the persistence
// boundary converts money to/from rupees; all Firestore fields are native values.
export const STORAGE_VERSION=3;
export const INFORMATION_DOCUMENT='database_information';
const encoder=new TextEncoder();
const safeId=value=>encodeURIComponent(String(value));
const clone=value=>structuredClone(value);
export function stableJSON(value) {
  if(Array.isArray(value))return '['+value.map(stableJSON).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJSON(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function toRupees(paise) {
  if(paise===null)return null;
  if(!Number.isSafeInteger(paise))throw new Error('A stored monetary value is invalid. No records have been overwritten.');
  const number=Number((paise/100).toFixed(2));
  if(fromRupees(number)!==paise)throw new Error('A monetary value is too large to convert safely.');
  return number;
}
export function fromRupees(value) {
  if(value===null)return null;
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>=1e13)throw new Error('A Firebase rupee amount is invalid.');
  const fixed=value.toFixed(2);
  if(Number(fixed)!==value)throw new Error('Firebase monetary amounts must have at most two decimal places.');
  const paise=Number(fixed.replace('.',''));
  if(!Number.isSafeInteger(paise))throw new Error('A Firebase rupee amount is too large.');
  return paise;
}
const formatted=paise=>paise===null?'Not entered':`${paise<0?'-':''}₹${(Math.abs(paise)/100).toFixed(2)}`;
const amountFields=paise=>({amountInRupees:toRupees(paise),amountFormatted:formatted(paise)});
const base=recordType=>({storageVersion:STORAGE_VERSION,recordType,currency:'INR'});
const requiredClosureAmounts=['expectedSavings','expectedExpenses','actualCash','actualBank'];
const closureAmounts={expectedSavings:'expectedClosingSavingsInRupees',expectedExpenses:'expectedExpensesInRupees',actualCash:'actualClosingCashInRupees',actualBank:'actualClosingBankBalanceInRupees',
  openingInvestment:'investmentValueAtStartOfMonthInRupees',closingInvestment:'investmentValueAtEndOfMonthInRupees',
  openingLent:'moneyLentOutstandingAtStartOfMonthInRupees',closingLent:'moneyLentOutstandingAtEndOfMonthInRupees',
  openingHeld:'moneyBorrowedOrHeldAtStartOfMonthInRupees',closingHeld:'moneyBorrowedOrHeldAtEndOfMonthInRupees',
  cashFinancialAdjustment:'cashFinancialMovementAdjustmentInRupees',bankFinancialAdjustment:'bankFinancialMovementAdjustmentInRupees'};
const snapshotAmounts={...closureAmounts,investment:'closingInvestmentsInRupees',lent:'closingMoneyLentInRupees',held:'closingMoneyBorrowedOrHeldInRupees',
  expectedSavingsEnd:'expectedClosingSavingsCalculatedAtEndOfMonthInRupees',theoreticalSavingsDifference:'theoreticalSavingsDifferenceInRupees',
  calculatedCash:'calculatedCashBeforeAdjustmentInRupees',calculatedBank:'calculatedBankBeforeAdjustmentInRupees',recordedCash:'cashAdjustmentInRupees',recordedBank:'bankAdjustmentInRupees',
  calculatedSavings:'calculatedClosingSavingsInRupees',actualSavings:'actualClosingSavingsInRupees',savingsDifference:'savingsDifferenceInRupees',
  cashShortfall:'cashShortfallInRupees',bankShortfall:'bankShortfallInRupees',cashExcess:'cashExcessInRupees',bankExcess:'bankExcessInRupees',
  unaccounted:'unaccountedAmountInRupees',recordedUnaccounted:'recordedUnaccountedExpenseInRupees',remainingUnaccounted:'remainingUnaccountedInRupees',
  expensesBeforeAdjustment:'recordedExpensesBeforeAdjustmentInRupees',actualExpenses:'actualExpensesInRupees',expensesDifference:'expensesDifferenceInRupees',
  investmentDifference:'changeInInvestmentValueInRupees',lentDifference:'changeInMoneyLentOutstandingInRupees',heldDifference:'changeInMoneyBorrowedOrHeldInRupees',
  netFinancialAdjustment:'netFinancialMovementAdjustmentInRupees',calculatedAccounts:'calculatedClosingCashAndBankBalanceInRupees',actualAccounts:'actualClosingCashAndBankBalanceInRupees'};
function encodeAmounts(value,mapping) {
  const result={...value};
  for(const [key,field] of Object.entries(mapping))if(Object.hasOwn(result,key)){result[field]=toRupees(result[key]);delete result[key];}
  return result;
}
function decodeAmounts(value,mapping) {
  const result={...value};
  for(const [key,field] of Object.entries(mapping))if(Object.hasOwn(result,field)){result[key]=fromRupees(result[field]);delete result[field];}
  return result;
}
export function encodeState(state) {
  if(state.version!==3)throw new Error('Unsupported website ledger version.');
  const records=new Map();
  const add=(id,fields)=>{
    if(records.has(id))throw new Error('Two records have the same identifier. No changes have been saved.');
    if(encoder.encode(JSON.stringify(fields)).length>700000)throw new Error('A record is too large to save. Shorten its description.');
    records.set(id,fields);
  };
  add(INFORMATION_DOCUMENT,{...base('databaseInformation'),websiteStateVersion:3,moneyUnit:'rupees',decimalPlaces:2,
    note:'Each document is one record. Amount fields ending InRupees are numeric INR values. Formatted fields show two decimal places.'});
  state.budgetReference.forEach((row,position)=>{
    const {id,amount,...rest}=row;
    add(`budget-reference__${safeId(id)}`,{...rest,...base('budgetReference'),categoryId:id,position,...amountFields(amount)});
  });
  for(const [key,m] of Object.entries(state.months).sort(([a],[b])=>a.localeCompare(b))) {
    checkMonth(key);
    const {cash,bank,tentative,budgets,carryOverrides,carryReset,carryBoundaryAdjustment,transactions,investment,moneyEntries,closure,...extra}=m;
    add(`month__${key}`,{...extra,...base('monthlyBalances'),month:key,
      openingCashInRupees:toRupees(cash),openingCashFormatted:formatted(cash),
      openingBankBalanceInRupees:toRupees(bank),openingBankBalanceFormatted:formatted(bank),
      tentativeExpensesInRupees:toRupees(tentative),tentativeExpensesFormatted:formatted(tentative),
      carryForwardResetToZero:!!carryReset,
      ...(carryBoundaryAdjustment?{carryForwardBoundaryAdjustmentInRupees:Object.fromEntries(
        Object.entries(carryBoundaryAdjustment).map(([id,amount])=>[id,toRupees(amount)])
      )}:{})});
    if(closure) {
      const {snapshot,...inputs}=closure;
      add(`month-end-closure__${key}`,{...base('monthEndClosure'),month:key,...encodeAmounts(inputs,closureAmounts),
        ...(snapshot?{snapshot:encodeAmounts(snapshot,snapshotAmounts)}:{})});
    }
    investment.forEach((row,position)=>{
      const {id,amount,...rest}=row;
      add(`investment__${key}__${safeId(id)}`,{...rest,...base('investment'),month:key,investmentId:id,position,...amountFields(amount)});
    });
    moneyEntries.forEach((row,position)=>{
      const {id,kind,amount,...rest}=row;
      if(!['lent','borrowed'].includes(kind))throw new Error('A lending or borrowing entry has an invalid type.');
      add(`money-${kind}__${key}__${safeId(id)}`,{...rest,...base(kind==='lent'?'moneyLent':'moneyBorrowed'),month:key,entryId:id,position,...amountFields(amount)});
    });
    budgets.forEach((row,position)=>{
      const {id,amount,...rest}=row;
      add(`category-budget__${key}__${safeId(id)}`,{...rest,...base('monthlyCategoryBudget'),month:key,categoryId:id,position,...amountFields(amount)});
    });
    for(const [categoryId,amount] of Object.entries(carryOverrides||{})) {
      add(`carry-forward-edit__${key}__${safeId(categoryId)}`,{...base('carryForwardEdit'),month:key,categoryId,
        categoryName:budgets.find(b=>b.id===categoryId)?.name||state.budgetReference.find(b=>b.id===categoryId)?.name||'Archived category',...amountFields(amount)});
    }
    transactions.forEach((row,position)=>{
      const {id,amount,wallet,category,keep,...rest}=row;
      add(`transaction__${key}__${safeId(id)}`,{...rest,...base('transaction'),transactionId:id,month:key,position,
        account:wallet,categoryId:category,includedInCalculations:keep!==false,...amountFields(amount)});
    });
  }
  return records;
}
function clean(fields) {
  const {storageVersion,recordType,currency,amountInRupees,amountFormatted,position,...rest}=fields;
  return rest;
}
function ordered(rows) {
  return rows.sort((a,b)=>a.position-b.position).map(r=>r.value);
}
export function decodeState(records) {
  if(!records.size)return createState();
  if(!records.has(INFORMATION_DOCUMENT))throw new Error('Database information is missing. Existing records have not been overwritten.');
  const info=records.get(INFORMATION_DOCUMENT);
  if(info.storageVersion!==3||![2,3].includes(info.websiteStateVersion)||info.moneyUnit!=='rupees'||info.currency!=='INR')throw new Error('Unsupported Firebase storage format.');
  const legacy=info.websiteStateVersion===2;
  const state=createState(),reference=[],investments=new Map(),entries=new Map(),sharedInvestments=[],sharedEntries=[],monthlyBudgets=new Map(),transactions=new Map();
  state.budgetReference=[];
  for(const fields of records.values()) {
    if(!fields||typeof fields!=='object'||fields.storageVersion!==3||fields.currency!=='INR')throw new Error('A Firebase record uses an unsupported format.');
    if(fields.recordType==='monthlyBalances') {
      const {month,openingCashInRupees,openingCashFormatted,openingBankBalanceInRupees,openingBankBalanceFormatted,tentativeExpensesInRupees,tentativeExpensesFormatted,carryForwardResetToZero,carryForwardBoundaryAdjustmentInRupees,...extra}=clean(fields);
      checkMonth(month);
      if(state.months[month])throw new Error('A month appears more than once in Firebase.');
      state.months[month]={...extra,cash:fromRupees(openingCashInRupees),bank:fromRupees(openingBankBalanceInRupees),tentative:fromRupees(tentativeExpensesInRupees),budgets:[],carryOverrides:{},carryReset:!!carryForwardResetToZero,transactions:[],investment:[],moneyEntries:[]};
      if(carryForwardBoundaryAdjustmentInRupees!==undefined) {
        if(!carryForwardBoundaryAdjustmentInRupees||typeof carryForwardBoundaryAdjustmentInRupees!=='object'||Array.isArray(carryForwardBoundaryAdjustmentInRupees))throw new Error('A carry-forward reset is invalid. Existing records have been kept.');
        state.months[month].carryBoundaryAdjustment=Object.fromEntries(Object.entries(carryForwardBoundaryAdjustmentInRupees).map(([id,amount])=>{
          if(amount===null)throw new Error('A carry-forward reset amount is invalid.');
          return [id,fromRupees(amount)];
        }));
      }
    }
  }
  for(const [documentId,fields] of records) {
    const type=fields.recordType,position=fields.position??0;
    if(['databaseInformation','monthlyBalances'].includes(type))continue;
    if(!Number.isSafeInteger(position)||position<0)throw new Error('A Firebase record has an invalid ordering field.');
    const rest=clean(fields);
    if(type==='monthEndClosure') {
      const {month,snapshot,...inputs}=rest;
      checkMonth(month);
      if(!state.months[month]||state.months[month].closure)throw new Error('A closure is missing its month or is duplicated. Existing records have been kept.');
      const closure=decodeAmounts(inputs,closureAmounts);
      if(!['open','closed'].includes(closure.status)||requiredClosureAmounts.some(key=>!Object.hasOwn(closure,key)))throw new Error('A month-end closure is incomplete. Existing records have been kept.');
      if(snapshot)closure.snapshot=decodeAmounts(snapshot,snapshotAmounts);
      state.months[month].closure=closure;
    } else if(type==='budgetReference') {
      const {categoryId,...details}=rest;
      reference.push({position,value:{...details,id:categoryId,amount:fromRupees(fields.amountInRupees)}});
    } else if(type==='investment') {
      const {investmentId,month,...details}=rest;
      const row={position,value:{...details,id:investmentId,amount:fromRupees(fields.amountInRupees)}};
      if(legacy&&month===undefined)sharedInvestments.push(row);
      else {
        checkMonth(month);
        if(!state.months[month])throw new Error('An investment is missing its month. Existing records have been kept.');
        const list=investments.get(month)||[];list.push(row);investments.set(month,list);
      }
    } else if(type==='moneyLent'||type==='moneyBorrowed') {
      const {entryId,month,...details}=rest;
      const row={position,value:{...details,id:entryId,kind:type==='moneyLent'?'lent':'borrowed',amount:fromRupees(fields.amountInRupees)}};
      if(legacy&&month===undefined)sharedEntries.push(row);
      else {
        checkMonth(month);
        if(!state.months[month])throw new Error('A lending or borrowing entry is missing its month. Existing records have been kept.');
        const list=entries.get(month)||[];list.push(row);entries.set(month,list);
      }
    } else if(['monthlyCategoryBudget','carryForwardEdit','transaction'].includes(type)) {
      const {month,categoryId,...details}=rest;
      if(!state.months[month])throw new Error('A Firebase record is missing its month. No changes have been saved.');
      if(type==='monthlyCategoryBudget') {
        const list=monthlyBudgets.get(month)||[];
        list.push({position,value:{...details,id:categoryId,amount:fromRupees(fields.amountInRupees)}});monthlyBudgets.set(month,list);
      } else if(type==='carryForwardEdit') {
        state.months[month].carryOverrides[categoryId]=fromRupees(fields.amountInRupees);
      } else {
        const {transactionId,account,includedInCalculations,...tx}=details;
        const list=transactions.get(month)||[];
        list.push({position,value:{...tx,id:transactionId,amount:fromRupees(fields.amountInRupees),wallet:account,category:categoryId,keep:includedInCalculations}});transactions.set(month,list);
      }
    } else throw new Error(`Unknown Firebase record type in ${documentId}. Existing data has been kept.`);
  }
  state.budgetReference=ordered(reference);
  for(const [key,m] of Object.entries(state.months)) {
    m.budgets=ordered(monthlyBudgets.get(key)||[]);m.transactions=ordered(transactions.get(key)||[]);
    m.investment=ordered(investments.get(key)||[]);m.moneyEntries=ordered(entries.get(key)||[]);
  }
  return legacy?migrateMonthlyRecords({...state,version:2,investment:ordered(sharedInvestments),moneyEntries:ordered(sharedEntries)}):state;
}
export function diffRecords(previous,next) {
  return [...new Set([...previous.keys(),...next.keys()])].filter(id=>stableJSON(previous.get(id))!==stableJSON(next.get(id))).map(id=>({documentId:id,fields:next.has(id)?clone(next.get(id)):null}));
}
// Old schema-2 documents used a single JSON string and integer paise. This
// reader is used only by the automatic one-time database migration.
export function decodeLegacyState(records) {
  const state={version:2,months:{},budgetReference:[],investment:[],moneyEntries:[]};
  const text=records.get('settings')?.data;
  if(!text)throw new Error('Old database settings are missing. No records have been overwritten.');
  const settings=JSON.parse(text);
  if(settings.version!==2||!Array.isArray(settings.budgetReference)||!Array.isArray(settings.investment))throw new Error('Old database records could not be read safely.');
  Object.assign(state,settings);
  for(const [id,fields] of records)if(id.startsWith('month~')) {
    const key=id.slice(6);checkMonth(key);state.months[key]={...JSON.parse(fields.data),transactions:[]};
  }
  for(const [id,fields] of [...records].sort(([a],[b])=>a.localeCompare(b))) {
    if(id.startsWith('money~'))state.moneyEntries.push(...JSON.parse(fields.data));
    else if(id.startsWith('tx~')) {
      const key=id.split('~')[1];
      if(!state.months[key])throw new Error('An old transaction is missing its month. No records have been overwritten.');
      state.months[key].transactions.push(...JSON.parse(fields.data));
    } else if(id!=='settings'&&!id.startsWith('month~'))throw new Error('Unknown old database document. Migration stopped without overwriting it.');
  }
  return state;
}
export function migrationTarget(records) {
  const old=records.has(INFORMATION_DOCUMENT)?decodeState(records):migrateMonthlyRecords(decodeLegacyState(records)),next=encodeState(old),roundTrip=decodeState(next);
  if(stableJSON(old)!==stableJSON(roundTrip))throw new Error('The database conversion could not preserve every field. Existing records have not been overwritten.');
  return next;
}
