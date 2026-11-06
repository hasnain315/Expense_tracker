import { uid, money, rupees, formatMoney as fmt, monthNow, monthName, createState, ensureMonth, getMonth, totals, loanTotals, budgetReferenceTotal, carryForward, carryHistory, resetYearCarryForward, resetMonthsCarryForward, validateTransaction, validateLoan, applyBudgetReference, migrateLegacy, hasRecords } from './core.mjs?v=20261107-tentative-budget';
import { readStatement } from './pdf-import.mjs?v=20261105-hdfc2';
import { createWorkbook } from './xlsx.mjs';
import { configured, connectCloud, friendlyError } from './cloud-store.mjs?v=20261106-monthly-guide';
const $ = (selector, root=document) => root.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  transactions:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  budget:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 2v4m8-4v4M4 10h16m-12 4h3m-3 3h8"/>',
  investment:'<path d="M4 19V5m0 14h16M7 14l4-4 4 2 5-7m-5 0h5v5"/>',
  downloads:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 8h.01M18 16h.01"/>',
  bank:'<path d="m3 9 9-6 9 6H3zm2 3v6m5-6v6m4-6v6m5-6v6M3 21h18"/>',
  lent:'<path d="M4 17h3l4 3h5l5-5c1-2-1-3-2-2l-3 2M3 12h4l4 3h4c2 0 2 3 0 3h-4M3 11v9m11-9V3m-3 3 3-3 3 3"/>',
  held:'<path d="M4 17h3l4 3h5l5-5c1-2-1-3-2-2l-3 2M3 12h4l4 3h4c2 0 2 3 0 3h-4M3 11v9m11-9V3m-3 5 3 3 3-3"/>',
  tentative:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6m-6 4h6m-6 4h3m2 3h.01"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18m-12 4h2m2 3h2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="m15 4 5 5M4 20l5-1L20 8a3 3 0 0 0-4-4L5 15z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
  upload:'<path d="M12 16V4m-4 4 4-4 4 4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8m-8 4h5"/>',
  gold:'<path d="m7 6-5 13h20L17 6H7zm0 0 4 13m6-13-4 13"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  wallet:'<path d="M20 8H5a2 2 0 0 1 0-4h13v4M4 6v13a2 2 0 0 0 2 2h14V8m0 4h-5v5h5"/>'
};
const icon = (name, className='') => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.file}</svg>`;
const screens = [
  {id:'overview',label:'Overview',short:'Overview',icon:'overview',eyebrow:'YOUR FINANCIAL PICTURE',subtitle:'Your savings, expected expenses and actual spending.'},
  {id:'transactions',label:'Transactions',short:'Transactions',icon:'transactions',eyebrow:'ONE MONTH AT A TIME',subtitle:'Your monthly balances, transactions and category carry-forward.'},
  {id:'budget',label:'Monthly Budget Reference',short:'Budget',icon:'budget',eyebrow:'A PLAN FOR EVERY RUPEE',subtitle:'One shared reference that changes only when you edit it.'},
  {id:'money',label:'Money Lent and Borrowed',short:'Lent & borrowed',icon:'lent',eyebrow:'KEEP TRACK OF EVERY RUPEE',subtitle:'Outstanding amounts you have lent and borrowed for the selected month.'},
  {id:'investment',label:'Investment',short:'Investment',icon:'investment',eyebrow:'YOUR MONEY, GROWING',subtitle:'Record investment values for the selected month.'},
  {id:'downloads',label:'Downloads',short:'Downloads',icon:'downloads',eyebrow:'YOUR RECORDS, READY TO GO',subtitle:'Download category carry-forward data as an Excel workbook.'},
  {id:'how-to-use',label:'How to Use',short:'Guide',icon:'file',eyebrow:'START EACH MONTH WITH CLARITY',subtitle:'A simple guide to entering and reviewing your monthly records.'}
];
const KEY='pocket-ledger:v1:'+new URL('.',location.href).pathname;
let legacy=null;
try {const raw=localStorage.getItem(KEY);if(raw){const saved=JSON.parse(raw);if(saved.version===1)legacy=saved;}}catch {/* Do not overwrite unreadable legacy data. */}
let state=createState(),month=monthNow(),screen='overview',cloud=null,phase=configured?'loading':'setup',session=null,revision=0,busy=false,pendingSnapshot=null,connectionError='';
let editingId=null,editingSnapshot=null,pendingAction=null,carryEdit=null,reviewRows=[],importName='',editingLoanId=null,loanSnapshot=null,loanKind='lent';
let resetYear=month.slice(0,4),resetMonths=new Set();
const current=()=>getMonth(state,month);
const categoryOptions=(selected='')=>`<option value="">Choose category</option>${current().budgets.map(b=>`<option value="${esc(b.id)}" ${b.id===selected?'selected':''}>${esc(b.name)}</option>`).join('')}`;
const empty=(title,description,iconName='file')=>`<div class="empty-state"><span class="empty-icon">${icon(iconName)}</span><h3>${title}</h3><p>${description}</p></div>`;
function toast(message) {const el=$('#toast');el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,6500);}
function storageStatus(message,error=false) {const el=$('#save-status');el.classList.toggle('error',error);el.textContent=message;el.title=message;}
function lockSaving(value) {
  busy=value;
  $('#screen').inert=value;$('#period-control').inert=value;$('#navigation').inert=value;
  for(const dialog of document.querySelectorAll('dialog'))dialog.inert=value;
  $('#account-button').disabled=value;
  document.body.classList.toggle('is-saving',value);
}
function acceptSnapshot(saved,version) {
  if(busy){pendingSnapshot={saved,version};return;}
  if(version<revision)return;
  state=saved;revision=version;phase='ready';connectionError='';render();
}
async function commit(change,notify='',resetAll=false) {
  if(phase!=='ready'||!cloud){toast('Connect Firebase and sign in before saving.');return false;}
  if(busy)return false;
  const next=resetAll?createState():structuredClone(state);
  try {
    change(next);lockSaving(true);storageStatus('Saving to Firebase…');
    const savedRevision=await (resetAll?cloud.resetAll(revision):cloud.save(next,revision));
    state=next;revision=savedRevision;storageStatus('Saved in Firebase');
    if(notify)toast(notify);return true;
  }catch(error){storageStatus('Change not saved',true);toast(friendlyError(error));return false;}
  finally {
    lockSaving(false);
    if(pendingSnapshot){const pending=pendingSnapshot;pendingSnapshot=null;if(pending.version>revision)acceptSnapshot(pending.saved,pending.version);}
  }
}
function renderGate() {
  if(phase==='setup')return `<section class="card connection-card"><span class="tile-icon">${icon('bank')}</span><h2>Connect your Firebase database</h2><p>Your website is ready for Firebase Spark. Complete the one-time setup in <strong>README.md</strong>, add your public web app settings to <strong>docs/firebase-config.mjs</strong>, and publish the supplied security rules.</p><p>After setup, sign in with the same account on your phone or computer to use the same records.</p><div class="inline-note">${icon('check')} No financial records are saved until your database is connected.</div></section>`;
  if(phase==='loading')return `<section class="card connection-card"><h2>${connectionError?'Connection needs attention':'Connecting to your ledger…'}</h2><p>${esc(connectionError||'Checking your sign-in and loading your records from Firebase.')}</p><button class="button secondary" id="retry-connection">Try again</button></section>`;
  return `<section class="card connection-card"><span class="tile-icon">${icon('wallet')}</span><h2>Sign in to Pocket Ledger</h2><p>Use the email and password you created in Firebase Authentication. Your records are available on every device where you sign in.</p><form id="sign-in-form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><p class="form-error" id="sign-in-error" role="alert"></p><div class="button-group"><button type="submit" class="button primary">Sign in</button><button type="button" class="button secondary" id="forgot-password">Reset password</button></div></form></section>`;
}
function renderOverview() {
  const t=totals(state,month);
  const components=[['cash','Total Cash','Cash balance at the start of the selected month, minus cash spent during that month.'],['bank','Total Bank Balance','Bank balance at the start of the selected month, minus payments made from the bank during that month.'],['lent','Total Money Lent to Others','Current outstanding total from Money Lent and Borrowed'],['investment','Total Investment','Current recorded value of all investments'],['held','Other People’s Money Held by Me','Current outstanding borrowing total · subtracted']];
  return `<section class="savings-hero"><div class="hero-content"><div class="hero-top"><span class="hero-label">TOTAL SAVINGS <span>INCLUDING INVESTMENTS</span></span><span class="hero-period">${icon('calendar')}${esc(monthName(month))}</span></div><div class="hero-amount">${fmt(t.savings)}</div><p>Includes cash, bank balance, investments and money lent to others, minus other people’s money held by me and this month’s tentative expenses.</p></div><div class="hero-art" aria-hidden="true"><div class="art-circle circle-one"></div><div class="art-circle circle-two"></div><div class="art-wallet">${icon('wallet')}</div></div></section>
  <div class="summary-pair"><section class="summary-card"><span class="summary-icon">${icon('lent')}</span><div><p>Savings Without Investment</p><strong>${fmt(t.withoutInvestment)}</strong><small>Calculated like Savings, but also excludes investment.</small></div></section><section class="summary-card"><span class="summary-icon blue">${icon('cash')}</span><div><p>Liquid Savings Without Investment</p><strong>${fmt(t.liquid)}</strong><small>Calculated like Savings Without Investment, but also excludes money lent to others.</small></div></section></div>
  <div class="expense-summary"><section class="card expense-card tentative-card"><span class="tile-icon sand">${icon('tentative')}</span><h2 id="tentative-heading">This Month’s Tentative Expenses</h2><strong>${fmt(t.tentative)}</strong><p>Uses the selected month’s manually saved tentative expenses from Monthly Budget Reference. If no manual amount is saved, it uses Total Monthly Budget Reference automatically.</p></section><section class="card expense-card"><span class="tile-icon">${icon('transactions')}</span><h2>Actual expenses already incurred during the selected month</h2><strong>${fmt(t.actual)}</strong><p>${esc(monthName(month))} · Sum of retained expense transactions from cash and bank.</p></section></div>
  <div class="section-heading"><div><h2>What makes up your savings</h2><p>Complete labels for every amount.</p></div><a class="text-link" href="#transactions">Update balances ${icon('arrow')}</a></div>
  <div class="balance-grid">${components.map(([key,label,hint])=>`<section class="balance-card"><div class="balance-top"><span class="tile-icon ${key==='held'||key==='tentative'?'sand':''}">${icon(key)}</span><span class="operator">${key==='held'||key==='tentative'?'−':'+'}</span></div><h3>${label}</h3><strong>${fmt(t[key])}</strong><p>${hint}</p></section>`).join('')}</div>`;
}
function renderTransactions() {
  const m=current(),t=totals(state,month),transactions=m.transactions,kept=transactions.filter(t=>t.keep!==false);
  const years=[...new Set([resetYear,month.slice(0,4),monthNow().slice(0,4),...Object.keys(state.months).map(k=>k.slice(0,4))])].sort().reverse();
  const monthOptions=Array.from({length:12},(_,index)=>({number:index+1,name:new Date(2000,index,1).toLocaleDateString('en-IN',{month:'long'})}));
  const inputs=[['cash','Opening cash balance','Leave blank to use the previous closing cash balance.'],['bank','Opening bank balance','Leave blank to use the previous closing bank balance.']];
  return `<section class="card opening-card"><div class="card-heading"><div><h2>Monthly financial details</h2><p>${esc(monthName(month))} · Each change saves to Firebase when you leave the field.</p></div><span class="subtle-tag">${icon('calendar')} Monthly</span></div><div class="monthly-fields">${inputs.map(([key,label,hint])=>`<label>${label}<div class="currency-input"><span>₹</span><input type="number" step="0.01" min="0" inputmode="decimal" placeholder="Use previous closing balance" data-month-field="${key}" aria-label="${label}" value="${m[key]==null?'':rupees(m[key])}"></div><small>${hint}</small></label>`).join('')}${[['lent','Money Lent to Others','Sum of lending entries saved for this month.'],['held','Other People’s Money Held by Me','Sum of borrowing entries saved for this month.']].map(([key,label,hint])=>`<label>${label}<div class="currency-input"><span>₹</span><input readonly aria-label="${label}" value="${rupees(t[key])}"></div><small>${hint} <a href="#money">Manage entries</a></small></label>`).join('')}</div></section>
  <section class="card transaction-card"><div class="card-heading transaction-heading"><div><h2>Transactions <span class="count">${kept.length}</span></h2><p>${esc(monthName(month))} · Actual retained expenses: <strong>${fmt(t.actual)}</strong></p></div><div class="button-group"><button class="button secondary" id="open-import">${icon('upload')} Upload PDF</button><button class="button primary" id="add-transaction">${icon('plus')} Add transaction</button></div></div>${transactions.length?`<div class="table-scroll"><table class="transaction-table"><thead><tr><th class="keep-column">Keep</th><th>Date / description</th><th>Category</th><th>Account</th><th class="right">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${[...transactions].sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<tr class="${t.keep===false?'excluded':''}"><td><input class="checkbox" type="checkbox" data-keep="${esc(t.id)}" aria-label="Keep ${esc(t.description||'transaction on '+t.date)}" ${t.keep!==false?'checked':''}></td><td><strong class="transaction-description">${esc(t.description||'No description')}</strong><small>${esc(t.date)}${t.source==='PDF'?' · PDF':''}${t.keep===false?' · Excluded from calculations':''}</small></td><td><span class="category-chip">${esc(t.categoryName||'Choose a category')}${t.type==='income'?' · Income':''}</span></td><td>${icon(t.wallet)}<span>${t.wallet==='cash'?'Cash':'Bank'}</span></td><td class="right amount ${t.type==='income'?'positive':''}">${t.type==='income'?'+':'−'}${fmt(t.amount)}</td><td><div class="row-actions"><button class="icon-button" data-edit-tx="${esc(t.id)}" aria-label="Edit ${esc(t.description||t.date)}">${icon('edit')}</button><button class="icon-button" data-remove-tx="${esc(t.id)}" aria-label="Remove ${esc(t.description||t.date)}">${icon('trash')}</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Your transactions for this month','Upload a PDF statement or add a transaction.','transactions')}</section>
  <section class="card"><div class="card-heading"><div><h2>Category carry-forward</h2><p>Balances continue across every month and year. They reset only when you choose.</p></div><button class="button secondary" id="reset-carry">Reset carry-forward</button></div><p class="carry-explanation">Previous carry-forward + this month’s category budget − actual retained category expenses = closing carry-forward. A saved edit or manual reset replaces the closing balance.</p>${renderCarry()}</section>
  <section class="card reset-card"><div><h2>Manual reset</h2><p>Switching months or years preserves your saved data. Nothing resets automatically.</p></div><label class="reset-year-control" for="reset-year">Year for carry-forward reset<select id="reset-year">${years.map(year=>`<option value="${year}" ${year===resetYear?'selected':''}>${year}</option>`).join('')}</select></label><div class="reset-options"><div class="reset-option"><button class="button secondary" id="reset-year-carry" aria-describedby="reset-year-description">Reset Selected Year Carry-Forward Data</button><p id="reset-year-description">Sets category closing carry-forward balances to zero for the selected year and recalculates all later months. Transactions, budgets and other financial records remain unchanged.</p></div><div class="reset-option"><fieldset class="reset-month-selection"><legend>Choose one or more months in ${resetYear}</legend><div class="reset-month-grid">${monthOptions.map(({number,name})=>`<label><input type="checkbox" data-reset-month="${number}" ${resetMonths.has(number)?'checked':''}><span>${name}</span></label>`).join('')}</div></fieldset><button class="button secondary" id="reset-months-carry" aria-describedby="reset-months-description" ${resetMonths.size?'':'disabled'}>Reset Selected Months Carry-Forward Data</button><p id="reset-months-description">Sets category closing carry-forward balances to zero for the selected months and recalculates all later months. Transactions, budgets and other financial records remain unchanged.</p></div><div class="reset-option"><button class="button danger-outline" id="reset-all" aria-describedby="reset-all-description">Reset All Data</button><p id="reset-all-description">Permanently deletes all saved data across every month and year. This action cannot be undone.</p></div></div>${m.carryReset?'<div class="button-group"><button class="button secondary" id="undo-carry-reset">Undo this month’s carry-forward reset</button></div>':''}</section>`;
}
function renderCarry() {
  const rows=carryForward(state,month);
  return rows.length?`<div class="table-scroll"><table class="carry-table"><thead><tr><th>Expense category</th><th class="right">Previous carry-forward</th><th class="right">Monthly budget</th><th class="right">Actual expenses</th><th class="right">Closing carry-forward</th><th><span class="sr-only">Edit</span></th></tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.name)}</strong>${r.edited?`<small class="edited-label">Manually edited · adjustment ${fmt(r.adjustment)}</small>`:r.reset?'<small class="edited-label">Manually reset to zero</small>':''}</td><td class="right">${fmt(r.opening)}</td><td class="right">${fmt(r.allowance)}</td><td class="right">${fmt(r.spent)}</td><td class="right ${r.balance<0?'negative':'positive'}">${carryEdit===r.id?`<form class="carry-edit-form" data-carry-form="${esc(r.id)}"><input type="number" inputmode="decimal" step="0.01" value="${rupees(r.balance)}" aria-label="Carry-forward for ${esc(r.name)}" required><button class="icon-button" type="submit" aria-label="Save carry-forward">${icon('check')}</button><button class="icon-button" type="button" data-cancel-carry aria-label="Cancel carry-forward edit">×</button>${r.edited?`<button type="button" class="text-link reset-carry" data-reset-carry="${esc(r.id)}">Undo edit</button>`:''}</form>`:`<strong>${fmt(r.balance)}</strong>`}</td><td>${carryEdit===r.id?'':`<button class="icon-button" data-edit-carry="${esc(r.id)}" aria-label="Edit carry-forward for ${esc(r.name)}">${icon('edit')}</button>`}</td></tr>`).join('')}</tbody></table></div>`:empty('No expense categories','Add a category in Monthly Budget Reference.','budget');
}
function renderBudget() {
  const budgets=state.budgetReference,sum=budgetReferenceTotal(state),manual=current().tentative;
  return `<section class="budget-summary"><div class="budget-summary-icon">${icon('budget')}</div><div><p>Total Monthly Budget Reference</p><strong>${fmt(sum)}</strong></div><span class="subtle-tag">${budgets.length} categories</span></section><section class="card expense-card tentative-budget-card"><span class="tile-icon sand">${icon('tentative')}</span><h2 id="tentative-heading">This Month’s Tentative Expenses</h2><p>${esc(monthName(month))} · Optional manual amount.</p><form id="tentative-expenses-form" aria-labelledby="tentative-heading"><label class="currency-input"><span aria-hidden="true">₹</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="${rupees(sum)}" value="${manual==null?'':rupees(manual)}" aria-label="This Month’s Tentative Expenses (manual, optional)" aria-describedby="tentative-help"></label><button type="submit" class="button primary">Save amount</button></form><p id="tentative-help">A manually saved amount overrides Total Monthly Budget Reference for the selected month. If no manual amount is saved, Total Monthly Budget Reference is used automatically.</p></section><section class="card"><div class="card-heading"><div><h2>Your shared expense categories</h2><p>This reference stays unchanged when you switch months. Saving an edit also applies the reference to ${esc(monthName(month))}; other saved months keep their own budgets.</p></div></div><div class="budget-list">${budgets.map((b,i)=>`<form class="budget-row" data-budget="${esc(b.id)}"><span class="category-number">${String(i+1).padStart(2,'0')}</span><label class="budget-name"><span class="sr-only">Category name</span><input name="name" value="${esc(b.name)}" maxlength="60" required aria-label="Category name ${i+1}"></label><label class="budget-amount"><span class="sr-only">Allowed monthly amount for ${esc(b.name)}</span><span>₹</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${rupees(b.amount)}" required></label><button class="button small secondary" type="submit">Save</button><button type="button" class="icon-button" data-remove-budget="${esc(b.id)}" aria-label="Remove category ${esc(b.name)}">${icon('trash')}</button></form>`).join('')}</div><form id="add-budget" class="add-category-form"><label><span>New category</span><input name="name" placeholder="e.g. Education" maxlength="60" required></label><label><span>Monthly budget (₹)</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required></label><button type="submit" class="button primary">${icon('plus')} Add category</button></form></section>`;
}
function renderLoans() {
  const totals=loanTotals(state,month);
  return `<div class="loan-grid">${[['lent','Money Lent to Others',totals.lent],['borrowed','Money Borrowed from Others',totals.held]].map(([kind,title,total])=>{
    const entries=current().moneyEntries.filter(e=>e.kind===kind);
    return `<section class="card loan-section"><div class="card-heading"><div><h2>${title}</h2><p>${entries.length} entr${entries.length===1?'y':'ies'} · ${esc(monthName(month))} outstanding total</p><strong class="loan-total">${fmt(total)}</strong></div><button class="button primary" data-add-loan="${kind}">${icon('plus')} Add entry</button></div>${entries.length?`<div class="loan-list">${entries.map(e=>`<article class="loan-entry"><div><h3>${esc(e.name)}</h3><p>${e.date?esc(e.date):'Date not provided'}</p>${e.description?`<p class="loan-description">${esc(e.description)}</p>`:''}</div><strong>${fmt(e.amount)}</strong><div class="row-actions"><button class="icon-button" data-edit-loan="${esc(e.id)}" aria-label="Edit entry for ${esc(e.name)}">${icon('edit')}</button><button class="icon-button" data-remove-loan="${esc(e.id)}" aria-label="Remove entry for ${esc(e.name)}">${icon('trash')}</button></div></article>`).join('')}</div>`:empty(kind==='lent'?'No lending entries yet':'No borrowing entries yet','Add a name and an outstanding amount.','lent')}</section>`;
  }).join('')}</div>`;
}
function renderInvestment() {
  const total=current().investment.reduce((s,i)=>s+i.amount,0);
  return `<section class="investment-total"><div><span class="eyebrow">TOTAL INVESTMENT</span><strong>${fmt(total)}</strong><p>${esc(monthName(month))} · Combined value of this month’s saved investments.</p></div><span class="investment-total-icon">${icon('investment')}</span></section><div class="investment-grid">${current().investment.map(i=>`<form class="card investment-card" data-investment="${esc(i.id)}"><span class="tile-icon ${i.id==='gold'?'gold':''}">${icon(i.id==='gold'?'gold':'investment')}</span><h2>${esc(i.name)}</h2><label>Recorded value<div class="currency-input"><span>₹</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${rupees(i.amount)}" aria-label="${esc(i.name)} value" required></div></label><div class="investment-actions"><button class="button secondary" type="submit">Save value</button>${['gold','mutual-funds'].includes(i.id)?'':`<button type="button" class="icon-button" data-remove-investment="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">${icon('trash')}</button>`}</div></form>`).join('')||empty('No investments saved for this month','Add an investment type and its present value.','investment')}</div><section class="card other-investment"><div><h2>Other investments</h2><p>Create an investment type and record its value.</p></div><form id="add-investment" class="add-category-form"><label><span>Investment type</span><input name="name" placeholder="e.g. Fixed deposit" maxlength="60" required></label><label><span>Recorded value (₹)</span><input name="amount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" required></label><button class="button primary" type="submit">${icon('plus')} Add investment</button></form></section>`;
}
function renderHowToUse() {
  return `<section class="card usage-guide"><div class="usage-guide-intro"><span class="usage-guide-icon" aria-hidden="true">${icon('calendar')}</span><div><h2>At the beginning of each month</h2><p>Choose the month and year using the selector on Overview, Transactions, Money Lent and Borrowed, or Investment. Then follow these steps.</p></div></div><ol>
    <li><h3>Enter money lent and borrowed</h3><p>In <a href="#money">Money Lent and Borrowed</a>, record the money you have lent to others and the money you have borrowed or are holding on behalf of others.</p></li>
    <li><h3>Enter your current investment values</h3><p>In <a href="#investment">Investment</a>, record the present value of all your investments, including money invested in a business or amounts you expect to recover from a business.</p></li>
    <li><h3>Review carry-forward balances and monthly budgets</h3><p>In <a href="#transactions">Transactions</a>, check whether you want to reset any category carry-forward balances. Review or update the <a href="#budget">Monthly Budget Reference</a> for the selected month.</p></li>
    <li><h3>Enter your starting financial details</h3><p>In <a href="#transactions">Transactions</a>, enter your bank balance, cash balance and other required financial details for the beginning of the selected month.</p></li>
    <li><h3>Record the month’s transactions</h3><p>Add transactions manually or upload a supported bank or GPay statement in <a href="#transactions">Transactions</a>. Review imported entries, choose a category for each entry you keep, and save. You can check each category’s remaining balance against its monthly budget reference at any time.</p></li>
  </ol></section><div class="inline-note usage-guide-reminder">${icon('check')} <p><strong>Switching months or years does not erase saved data.</strong> If a month already contains Transactions, Investment, or Money Lent and Borrowed records, you can review or update those records without entering everything again. A month with no saved investment or lending and borrowing data starts with empty records and zero totals. Returning to an earlier month shows that month’s saved records.</p></div>`;
}
function renderDownloads() {
  const keys=Object.keys(state.months),years=[...new Set([month.slice(0,4),...keys.map(k=>k.slice(0,4))])].sort().reverse();
  return `<div class="download-grid"><section class="card download-card"><span class="download-number">01</span><h2>Complete history</h2><p>Category carry-forward data across every saved month and year.</p><div class="download-scope">${keys.length} saved months</div><a class="button primary" data-download="all">${icon('downloads')} Download Excel</a></section><section class="card download-card"><span class="download-number">02</span><h2>Selected year</h2><p>Monthly category carry-forward data for one calendar year.</p><label>Year<select id="download-year">${years.map(y=>`<option value="${y}" ${y===month.slice(0,4)?'selected':''}>${y}</option>`).join('')}</select></label><a class="button primary" data-download="year">${icon('downloads')} Download Excel</a></section><section class="card download-card"><span class="download-number">03</span><h2>Selected month</h2><p>Category carry-forward data for one saved month.</p><label>Month and year<input id="download-month" type="month" value="${month}" min="2000-01" max="2100-12" required></label><a class="button primary" data-download="month">${icon('downloads')} Download Excel</a></section></div><div class="inline-note">${icon('file')} A selected-year or selected-month export still includes the opening balance carried from earlier periods. Exports are reports, not full database backups.</div>`;
}
function render() {
  screen=screens.some(s=>s.id===location.hash.slice(1))?location.hash.slice(1):'overview';
  const meta=screens.find(s=>s.id===screen);
  $('#navigation').innerHTML=screens.map(s=>`<a href="#${s.id}" class="nav-item ${s.id===screen?'active':''}" ${s.id===screen?'aria-current="page"':''} aria-label="${s.label}">${icon(s.icon)}<span class="nav-full">${s.label}</span><span class="nav-short">${s.short}</span>${s.id===screen?'<span class="nav-dot"></span>':''}</a>`).join('');
  $('#breadcrumb').textContent=meta.label;$('#page-title').textContent=meta.label;$('#eyebrow').textContent=meta.eyebrow;$('#page-subtitle').textContent=meta.subtitle;
  $('#selected-month').value=month;$('#period-control').hidden=phase!=='ready'||['downloads','how-to-use'].includes(screen);
  $('#account-button').hidden=!session;$('#account-button').textContent='Sign out';$('#account-button').title=session?.email||'';
  const legacyNotice=legacy&&!hasRecords(state)?`<div class="migration-note"><p>Records from the older version are saved in this browser. You can move them into this empty Firebase ledger.</p><button class="button secondary" id="import-legacy">Import existing records</button></div>`:'';
  $('#screen').innerHTML=phase==='ready'?legacyNotice+({overview:renderOverview,transactions:renderTransactions,budget:renderBudget,money:renderLoans,investment:renderInvestment,downloads:renderDownloads,'how-to-use':renderHowToUse})[screen]():renderGate();
  prepareDownloads();
  if(connectionError)storageStatus(connectionError,true);
  document.title=`${meta.label} · Pocket Ledger`;
}
function selectMonth(value) {
  if(!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(value)){toast('Choose a month between 2000 and 2100.');return;}
  if(busy)return;
  month=value;resetYear=value.slice(0,4);resetMonths.clear();carryEdit=null;render();
}
$('#calendar-icon').innerHTML=icon('calendar');$('#upload-icon').innerHTML=icon('upload');
$('#selected-month').addEventListener('change',event=>selectMonth(event.target.value));
for(const [id,delta] of [['previous-month',-1],['next-month',1]])$('#'+id).addEventListener('click',()=>{const d=new Date(month+'-01T12:00:00');d.setMonth(d.getMonth()+delta);selectMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);});
window.addEventListener('hashchange',()=>{carryEdit=null;render();window.scrollTo(0,0);});
function openTransaction(id=null) {
  editingId=id;
  const f=$('#transaction-form'),t=id?current().transactions.find(t=>t.id===id):null;
  editingSnapshot=t?JSON.stringify(t):null;
  f.reset();$('#transaction-title').textContent=t?'Edit transaction':'Add a transaction';$('#transaction-error').textContent='';
  f.elements.date.min=month+'-01';f.elements.date.max=month+'-'+new Date(+month.slice(0,4),+month.slice(5),0).getDate();
  f.elements.date.value=t?.date||`${month}-${String(month===monthNow()?new Date().getDate():1).padStart(2,'0')}`;
  f.elements.amount.value=t?rupees(t.amount):'';f.elements.description.value=t?.description||'';f.elements.type.value=t?.type||'expense';f.elements.wallet.value=t?.wallet||'bank';
  $('#transaction-category').innerHTML=categoryOptions(t?.category);$('#transaction-category').required=true;
  $('#transaction-dialog').showModal();
}
$('#transaction-form').addEventListener('submit',async event=>{
  event.preventDefault();const f=event.target;
  try {
    const prev=current().transactions.find(t=>t.id===editingId);
    if(editingId && JSON.stringify(prev)!==editingSnapshot)throw Error('This transaction changed on another device. Close and reopen it before editing.');
    const t=validateTransaction({id:editingId||uid(),date:f.elements.date.value,amount:money(f.elements.amount.value),description:f.elements.description.value,type:f.elements.type.value,wallet:f.elements.wallet.value,category:f.elements.category.value,keep:prev?.keep??true,source:prev?.source||'Manual'},month,current().budgets);
    if(await commit(s=>{const m=ensureMonth(s,month);if(editingId)m.transactions[m.transactions.findIndex(x=>x.id===editingId)]=t;else m.transactions.push(t);},'Transaction saved.')){$('#transaction-dialog').close();render();}
  }catch(error){$('#transaction-error').textContent=error.message;}
});
function openLoan(kind,id=null) {
  const entry=id?current().moneyEntries.find(e=>e.id===id):null;
  loanKind=entry?.kind||kind;editingLoanId=id;loanSnapshot=entry?JSON.stringify(entry):null;
  const f=$('#loan-form');f.reset();$('#loan-error').textContent='';
  $('#loan-title').textContent=`${entry?'Edit':'Add'} ${loanKind==='lent'?'lending':'borrowing'} entry`;
  for(const key of ['date','name','description'])f.elements[key].value=entry?.[key]||'';
  f.elements.amount.value=entry?rupees(entry.amount):'';$('#loan-dialog').showModal();
}
$('#loan-form').addEventListener('submit',async event=>{
  event.preventDefault();const f=event.target;
  try {
    if(editingLoanId && JSON.stringify(current().moneyEntries.find(e=>e.id===editingLoanId))!==loanSnapshot)throw Error('This entry changed on another device. Close and reopen it before editing.');
    const entry=validateLoan({id:editingLoanId||uid(),kind:loanKind,date:f.elements.date.value,name:f.elements.name.value,amount:money(f.elements.amount.value),description:f.elements.description.value});
    if(await commit(s=>{if(editingLoanId)ensureMonth(s,month).moneyEntries[ensureMonth(s,month).moneyEntries.findIndex(e=>e.id===editingLoanId)]=entry;else ensureMonth(s,month).moneyEntries.push(entry);},'Entry saved. Linked totals have been updated.')){$('#loan-dialog').close();render();}
  }catch(error){$('#loan-error').textContent=error.message;}
});
function confirmAction(action,title,description,label,requiresText=false) {
  pendingAction=action;$('#confirm-title').textContent=title;$('#confirm-description').textContent=description;$('#confirm-action').textContent=label;
  $('#reset-verification-label').hidden=!requiresText;$('#reset-verification').value='';$('#reset-verification').required=requiresText;
  $('#confirm-error').textContent='';$('#confirm-dialog').showModal();
}
function clearBrowserFinancialData() {
  legacy=null;reviewRows=[];importName='';editingId=null;editingSnapshot=null;editingLoanId=null;loanSnapshot=null;
  resetMonths.clear();resetYear=month.slice(0,4);
  try{localStorage.removeItem(KEY);}catch{/* Browser storage may be unavailable. */}
  for(const id of ['transaction-form','loan-form'])$('#'+id).reset();
  $('#import-review').innerHTML='';$('#pdf-file').value='';$('#pdf-password').value='';
}
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.id==='download-year'||el.id==='download-month')prepareDownloads();
  if(el.id==='reset-year'){resetYear=el.value;resetMonths.clear();render();}
  if(el.dataset.resetMonth) {
    const number=Number(el.dataset.resetMonth);
    if(el.checked)resetMonths.add(number);else resetMonths.delete(number);
    $('#reset-months-carry').disabled=!resetMonths.size;
  }
  if(['cash','bank'].includes(el.dataset.monthField)) {
    try {
      const amount=el.value===''?null:money(el.value);
      if(amount!==null&&amount<0)throw Error('Enter zero or a positive amount.');
      const saved=await commit(s=>{ensureMonth(s,month)[el.dataset.monthField]=amount;});
      if(!saved)el.value=current()[el.dataset.monthField]==null?'':rupees(current()[el.dataset.monthField]);
    }catch(error){toast(error.message);el.value=current()[el.dataset.monthField]==null?'':rupees(current()[el.dataset.monthField]);}
  }
  if(el.dataset.keep) {
    await commit(s=>{const tx=ensureMonth(s,month).transactions.find(t=>t.id===el.dataset.keep);if(!tx)throw Error('This entry no longer exists.');tx.keep=el.checked;});render();
  }
});
document.addEventListener('click',async event=>{
  const el=event.target.closest('button');if(!el)return;
  if(el.dataset.close){$('#'+el.dataset.close).close();return;}
  if(el.id==='retry-connection'){location.reload();return;}
  if(el.id==='account-button') {
    if(busy)return;
    try{await cloud.signOut();}catch(error){toast(friendlyError(error));}return;
  }
  if(el.id==='forgot-password') {
    const email=$('#sign-in-form').elements.email;
    if(!email.value || !email.reportValidity()){email.focus();return;}
    el.disabled=true;
    try{await cloud.resetPassword(email.value.trim());toast('If this email belongs to your account, a reset link will be sent.');}catch(error){toast(friendlyError(error));}finally{el.disabled=false;}return;
  }
  if(phase!=='ready'||busy)return;
  if(el.id==='add-transaction')openTransaction();
  if(el.dataset.editTx)openTransaction(el.dataset.editTx);
  if(el.dataset.removeTx)confirmAction({kind:'tx',id:el.dataset.removeTx,month},'Remove transaction?','This removes the transaction and updates balances and category spending.','Remove transaction');
  if(el.dataset.editCarry){carryEdit=el.dataset.editCarry;render();$('[data-carry-form] input')?.focus();}
  if(el.hasAttribute('data-cancel-carry')){carryEdit=null;render();}
  if(el.dataset.resetCarry && await commit(s=>{delete ensureMonth(s,month).carryOverrides[el.dataset.resetCarry];},'Manual edit removed.')){carryEdit=null;render();}
  if(el.id==='reset-carry')confirmAction({kind:'carry',month},'Reset category carry-forward?',`All category closing balances for ${monthName(month)} will become zero. Earlier records are kept. Later months will carry forward from zero, subject to any later saved edits or resets.`,'Reset carry-forward');
  if(el.id==='undo-carry-reset')confirmAction({kind:'undo-carry',month},'Undo this month’s reset?','Balances will be recalculated from the earlier months. Individual saved edits remain in place.','Undo reset');
  if(el.id==='reset-year-carry') {
    const year=$('#reset-year').value;
    confirmAction({kind:'year-carry',year},`Reset ${year} carry-forward data?`,`This sets every category’s closing carry-forward balance to zero for all 12 months of ${year} and clears that year’s manual carry-forward edits. All later months and years are recalculated from the updated closing balances. Later manual adjustment amounts and separate resets are preserved. Transactions, monthly category budgets, cash and bank inputs, lending, borrowing, investments and settings remain unchanged.`,'Reset year carry-forward');
  }
  if(el.id==='reset-months-carry') {
    const year=$('#reset-year').value,months=[...resetMonths].sort((a,b)=>a-b);
    if(!months.length){toast('Select one or more months to reset.');return;}
    const names=months.map(number=>monthName(`${year}-${String(number).padStart(2,'0')}`)).join(', ');
    confirmAction({kind:'months-carry',year,months},'Reset selected months’ carry-forward?',`This sets every category’s closing carry-forward balance to zero and clears manual carry-forward edits for: ${names}. Each succeeding month uses the preceding month’s updated closing balances, including across years. Later manual adjustment amounts and separate resets are preserved. Transactions, monthly category budgets and other financial records remain unchanged.`,'Reset selected months');
  }
  if(el.id==='reset-all')confirmAction({kind:'all'},'Permanently delete all saved data?','WARNING: This permanently deletes all saved application data across every month and year, including transactions, category carry-forward balances, monthly budget references, lending, borrowing, investments, financial records, saved financial settings and older records saved in this browser. This action cannot be undone. Your sign-in account remains. Type RESET and confirm to delete everything.','Permanently delete all data',true);
  if(el.id==='import-legacy')confirmAction({kind:'legacy'},'Import the older browser records?','Records saved on this browser will be copied to your empty Firebase ledger. Saved monthly lent and held totals stay in their own months. The older shared investments are preserved in the latest saved month. Review and assign the correct names afterwards.','Import records');
  if(el.id==='apply-budget' && await commit(s=>applyBudgetReference(s,month),'Reference applied to the selected month.'))render();
  if(el.dataset.removeBudget) {
    const id=el.dataset.removeBudget;
    if(await commit(s=>{s.budgetReference=s.budgetReference.filter(b=>b.id!==id);applyBudgetReference(s,month);},'Category removed from the reference and selected month.'))render();
  }
  if(el.dataset.removeInvestment && await commit(s=>{ensureMonth(s,month).investment=ensureMonth(s,month).investment.filter(i=>i.id!==el.dataset.removeInvestment);},'Investment type removed.'))render();
  if(el.dataset.addLoan)openLoan(el.dataset.addLoan);
  if(el.dataset.editLoan)openLoan(null,el.dataset.editLoan);
  if(el.dataset.removeLoan)confirmAction({kind:'loan',id:el.dataset.removeLoan,month},'Remove this entry?','The entry will be removed and the linked lending or borrowing total will decrease. Cash and bank transactions remain unchanged.','Remove entry');
  if(el.id==='open-import')openImport();
});
$('#confirm-form').addEventListener('submit',async event=>{
  event.preventDefault();if(!pendingAction)return;
  if(!$('#reset-verification-label').hidden && $('#reset-verification').value!=='RESET'){$('#confirm-error').textContent='Type RESET exactly to continue.';return;}
  const action=pendingAction;
  if(await commit(s=>{
    if(action.kind==='tx')s.months[action.month].transactions=s.months[action.month].transactions.filter(t=>t.id!==action.id);
    if(action.kind==='loan'){const m=ensureMonth(s,action.month);m.moneyEntries=m.moneyEntries.filter(e=>e.id!==action.id);}
    if(action.kind==='carry'){const m=ensureMonth(s,action.month);m.carryReset=true;m.carryOverrides={};}
    if(action.kind==='undo-carry')ensureMonth(s,action.month).carryReset=false;
    if(action.kind==='year-carry')resetYearCarryForward(s,action.year);
    if(action.kind==='months-carry')resetMonthsCarryForward(s,action.year,action.months);
    if(action.kind==='legacy'){if(hasRecords(s))throw Error('The cloud ledger already has data. The older records have not been imported.');Object.assign(s,migrateLegacy(legacy));}
  },action.kind==='legacy'?'Older records imported. Review your lending and borrowing entries.':action.kind==='year-carry'?`Closing carry-forward reset for ${action.year}. Later months recalculated; transactions and budgets preserved.`:action.kind==='months-carry'?`Closing carry-forward reset for ${action.months.length} selected month(s) in ${action.year}. Later months recalculated; transactions and budgets preserved.`:action.kind==='all'?'All saved application data has been permanently deleted.':'Your changes have been saved.',action.kind==='all')) {
    if(action.kind==='all')clearBrowserFinancialData();
    if(action.kind==='legacy')legacy=null;
    $('#confirm-dialog').close();pendingAction=null;carryEdit=null;render();
  }
});
document.addEventListener('submit',async event=>{
  const f=event.target;
  if(f.id==='sign-in-form') {
    event.preventDefault();const button=$('button[type=submit]',f);button.disabled=true;$('#sign-in-error').textContent='';
    try{await cloud.signIn(f.elements.email.value.trim(),f.elements.password.value);f.elements.password.value='';}catch(error){$('#sign-in-error').textContent=friendlyError(error);}finally{button.disabled=false;}return;
  }
  if(!f.matches('[data-budget],#add-budget,[data-investment],#add-investment,[data-carry-form],#tentative-expenses-form'))return;
  event.preventDefault();
  try {
    if(f.id==='tentative-expenses-form') {
      const amount=f.elements.amount.value===''?null:money(f.elements.amount.value);
      if(amount!==null&&amount<0)throw Error('Enter an amount of zero or greater.');
      if(await commit(s=>{ensureMonth(s,month).tentative=amount;},amount===null?'Tentative expenses now use Total Monthly Budget Reference.':'Tentative expenses saved for this month.'))render();
      return;
    }
    const amount=money(f.elements.amount?.value??f.querySelector('input[type=number]').value);
    if(!f.dataset.carryForm && amount<0)throw Error('Enter an amount of zero or greater.');
    if(f.dataset.carryForm) {
      if(await commit(s=>{ensureMonth(s,month).carryOverrides[f.dataset.carryForm]=amount;},'Carry-forward balance saved.')){carryEdit=null;render();}return;
    }
    const name=f.elements.name?.value.trim();
    if(f.elements.name&&!name)throw Error('Please enter a name.');
    if(f.dataset.budget||f.id==='add-budget') {
      if(state.budgetReference.some(b=>b.id!==f.dataset.budget&&b.name.toLowerCase()===name.toLowerCase()))throw Error('This category already exists.');
      if(await commit(s=>{if(f.dataset.budget)Object.assign(s.budgetReference.find(b=>b.id===f.dataset.budget),{name,amount});else s.budgetReference.push({id:uid(),name,amount});applyBudgetReference(s,month);},'Budget reference and selected month saved.'))render();
    } else {
      if(name&&current().investment.some(i=>i.name.toLowerCase()===name.toLowerCase()))throw Error('This investment type already exists.');
      if(await commit(s=>{if(f.dataset.investment)ensureMonth(s,month).investment.find(i=>i.id===f.dataset.investment).amount=amount;else ensureMonth(s,month).investment.push({id:uid(),name,amount});},'Investment saved.'))render();
    }
  }catch(error){toast(error.message);}
});
const exportUrls=[];
function prepareDownloads() {
  for(const url of exportUrls)URL.revokeObjectURL(url);
  exportUrls.length=0;
  for(const link of document.querySelectorAll('a[data-download]')) {
    const mode=link.dataset.download;
    const selected=mode==='year'?$('#download-year').value:mode==='month'?$('#download-month').value:'';
    const rows=carryHistory(state,mode,selected);
    link.dataset.rows=rows.length;
    link.tabIndex=0;
    if(!rows.length){link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.title='No saved category carry-forward data for this period.';continue;}
    const bytes=createWorkbook(rows);
    const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
    exportUrls.push(url);link.href=url;link.download=`Pocket-Ledger-Carry-Forward-${selected||'Complete-History'}.xlsx`;
    link.removeAttribute('aria-disabled');link.title='Download category carry-forward data';
  }
}
document.addEventListener('click',event=>{
  const link=event.target.closest('a[data-download]');if(!link)return;
  if(!link.hasAttribute('href')){event.preventDefault();toast('No saved category carry-forward data is available for this period.');return;}
  toast(`${link.dataset.rows} category carry-forward rows ready to download.`);
});
function openImport() {
  reviewRows=[];$('#pdf-file').value='';$('#pdf-password').value='';$('#import-error').textContent='';$('#read-pdf').disabled=true;$('#read-pdf').textContent='Read statement';$('#import-upload').hidden=false;$('#import-review').hidden=true;$('#import-dialog').showModal();
}
$('#pdf-file').addEventListener('change',()=>{const file=$('#pdf-file').files[0];$('#read-pdf').disabled=!file;$('#import-error').textContent=file?file.name:'';});
$('#read-pdf').addEventListener('click',async()=>{
  const file=$('#pdf-file').files[0];if(!file)return;
  const button=$('#read-pdf');button.disabled=true;button.textContent='Reading statement…';$('#import-error').textContent='';
  try{importName=file.name;reviewRows=(await readStatement(file,$('#pdf-password').value)).map(t=>({...t,id:uid(),source:'PDF',keep:t.date.slice(0,7)===month}));$('#pdf-password').value='';renderReview();}
  catch(error){$('#import-error').textContent=error.message;}
  finally{button.disabled=false;button.textContent='Read statement';}
});
function renderReview() {
  const outside=reviewRows.filter(t=>t.date.slice(0,7)!==month).length;
  $('#import-upload').hidden=true;$('#import-review').hidden=false;
  $('#import-review').innerHTML=`<div class="review-summary"><strong>${reviewRows.length} extracted transactions</strong><span>${esc(importName)}</span><p>Check entries to retain them. Every retained entry needs a category, including income. Descriptions are optional.</p>${outside?`<p class="warning-text">${outside} entries fall outside ${esc(monthName(month))} and are unchecked. Import them in their own month.</p>`:''}</div><div class="review-list">${reviewRows.map((t,i)=>`<div class="review-row ${!t.keep?'review-unchecked':''}" data-review-row="${i}"><label class="review-checkbox"><input type="checkbox" class="checkbox" data-review="keep" data-index="${i}" ${t.keep?'checked':''}><span>Retain</span></label><div class="review-fields"><label>Date<input type="date" value="${t.date}" data-review="date" data-index="${i}"></label><label class="review-desc">Description (optional)<input value="${esc(t.description)}" data-review="description" data-index="${i}" maxlength="300"></label><label>Amount (₹)<input type="number" min="0.01" step="0.01" inputmode="decimal" value="${rupees(t.amount)}" data-review="amount" data-index="${i}"></label><label>Type<select data-review="type" data-index="${i}"><option value="">Choose type</option><option value="expense" ${t.type==='expense'?'selected':''}>Expense</option><option value="income" ${t.type==='income'?'selected':''}>Income</option></select></label><label>Account<select data-review="wallet" data-index="${i}"><option value="bank" ${t.wallet==='bank'?'selected':''}>Bank</option><option value="cash" ${t.wallet==='cash'?'selected':''}>Cash</option></select></label><label class="review-category">Category (required)<select data-review="category" data-index="${i}" required>${categoryOptions(t.category)}</select></label></div></div>`).join('')}</div><p id="review-error" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="button secondary" id="back-import">Choose another PDF</button><button type="button" class="button primary" id="save-import">Import retained transactions</button></div>`;
}
function updateReview(event) {
  const el=event.target,key=el.dataset.review;if(!key)return;const tx=reviewRows[+el.dataset.index];
  // Invalid text is retained as NaN until validation, never silently replaced
  // with an earlier valid amount.
  try{tx[key]=key==='keep'?el.checked:key==='amount'?money(el.value):el.value;if(key==='keep')el.closest('.review-row').classList.toggle('review-unchecked',!el.checked);}
  catch(error){tx[key]=key==='amount'?NaN:el.value;$('#review-error').textContent=error.message;}
}
$('#import-review').addEventListener('change',updateReview);$('#import-review').addEventListener('input',updateReview);
$('#import-review').addEventListener('click',async event=>{
  const el=event.target.closest('button');if(!el)return;
  if(el.id==='back-import'){$('#import-upload').hidden=false;$('#import-review').hidden=true;return;}
  if(el.id==='save-import') {
    try {
      const kept=reviewRows.filter(t=>t.keep);if(!kept.length)throw Error('Retain at least one transaction to import.');
      const valid=kept.map((t,i)=>{try{return validateTransaction(t,month,current().budgets);}catch(error){throw Error(`Retained transaction ${i+1}: ${error.message}`);}});
      if(await commit(s=>{ensureMonth(s,month).transactions.push(...valid);},`${valid.length} transactions imported.`)){$('#import-dialog').close();reviewRows=[];render();}
    }catch(error){$('#review-error').textContent=error.message;}
  }
});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
window.addEventListener('online',()=>storageStatus(phase==='ready'?'Connection restored · checking Firebase':'Connecting to Firebase…'));
window.addEventListener('offline',()=>storageStatus('Offline · reconnect before saving',true));
render();storageStatus(configured?'Connecting to Firebase…':'Firebase setup required');
if(configured) {
  try {
    cloud=await connectCloud({
      onSession:user=>{session=user;state=createState();revision=0;pendingSnapshot=null;phase=user?'loading':'signed-out';connectionError='';for(const d of document.querySelectorAll('dialog[open]'))d.close();render();if(!user)storageStatus('Sign in to access your records');},
      onData:acceptSnapshot,
      onReset:clearBrowserFinancialData,
      onStatus:(message,error=false)=>{storageStatus(message,error);if(error){connectionError=message;phase='loading';render();}}
    });
  }catch(error){phase='loading';connectionError=friendlyError(error);storageStatus(connectionError,true);render();}
}
