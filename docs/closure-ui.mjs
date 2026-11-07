import { formatMoney as fmt, rupees, monthName } from './core.mjs?v=20261107-closure-balances-v2';
import { getClosure, componentValues, closureSummary, closureNeedsReview, closureComparison, adjustmentsNeedSync } from './closure.mjs?v=20261107-closure-balances-v2';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>value==null?'Not entered':fmt(value);
const signed=value=>value==null?'Not entered':`${value>0?'+':''}${fmt(value)}`;
const shortMonth=key=>new Date(key+'-01T12:00:00').toLocaleDateString('en-IN',{month:'short',year:'numeric'});
const input=(name,label,value,hint,{min='',readonly=false,required=true}={})=>`<label>${label}<div class="currency-input"><span>₹</span><input name="${name}" aria-label="${label}" type="number" step="0.01" ${min!==''?`min="${min}"`:''} inputmode="decimal" placeholder="${readonly?'Not entered':'Enter manually'}" value="${value==null?'':rupees(value)}" ${required?'required':''} ${readonly?'readonly':''}></div><small>${hint}</small></label>`;
const metric=(label,value,hint='',className='')=>`<section class="closure-metric ${className}"><h3>${label}</h3><strong>${value}</strong>${hint?`<p>${hint}</p>`:''}</section>`;
export const lateClosureGuidance=`<p>You can close a month after the next month has started. For example, if you complete <strong>October’s closure on 5 November</strong>, select <strong>October</strong> and enter the balances as they stood at the <strong>end of 31 October</strong>.</p>
  <p>If you only know your current balance, use:</p><p class="closure-late-formula"><strong>Month-End Balance = Today’s Balance − All Money Received Since Month-End + All Money Paid Out Since Month-End</strong></p>
  <p>Apply this separately to cash and bank. Include all subsequent movements, including income, spending, investment movements, lending repayments, borrowed money, new lending, borrowing repayments and transfers. Include movements up to the same date and time as the current balance being checked. All subsequent movements must be known for an accurate result.</p>`;
export const componentRows=[
  {id:'investment',opening:'openingInvestment',closing:'closingInvestment',difference:'investmentDifference',title:'Investments',openingLabel:'Investment Value at Start of Month',closingLabel:'Investment Value at End of Month',differenceLabel:'Change in Investment Value',openingHint:'Value of your investments at the beginning of the selected month.',closingHint:'Value of your investments at the end of the selected month.'},
  {id:'lent',opening:'openingLent',closing:'closingLent',difference:'lentDifference',title:'Money Lent to Others',openingLabel:'Money Lent Outstanding at Start of Month',closingLabel:'Money Lent Outstanding at End of Month',differenceLabel:'Change in Money Lent Outstanding',openingHint:'Amount others owed you at the beginning of the selected month.',closingHint:'Amount others still owed you at the end of the selected month.'},
  {id:'held',opening:'openingHeld',closing:'closingHeld',difference:'heldDifference',title:'Money Borrowed or Held for Others',openingLabel:'Money Borrowed or Held at Start of Month',closingLabel:'Money Borrowed or Held at End of Month',differenceLabel:'Change in Money Borrowed or Held',openingHint:'Amount you owed or held for others at the beginning of the selected month.',closingHint:'Amount you owed or held for others at the end of the selected month.'}
];
export function renderClosure(state,key,selection) {
  const c=getClosure(state,key),s=closureSummary(state,key),v=componentValues(state,key),closed=c.status==='closed',review=closureNeedsReview(state,key),sync=adjustmentsNeedSync(state,key);
  const result=closed&&c.snapshot?c.snapshot:s;
  const target=result.target==='not-set'?'Enter your target and complete closing figures':`Savings target ${result.target}`;
  const status=closed?(review?'Closed · needs review':'Month closed'):(c.snapshot?'Reopened for corrections':'Month open');
  return `<div class="closure-status ${review?'closure-warning':''}"><div><strong>${status}</strong><p>${closed?`Closed ${esc(new Date(c.closedAt).toLocaleString('en-IN'))}. ${review?'Relevant records changed. Reopen, review and close again.':'Your saved closure snapshot is preserved.'}`:'Save the opening figures at the start of the month, then complete the closing figures when ready.'}</p></div>${closed?'<button class="button secondary" id="reopen-month">Reopen Month</button>':''}</div>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">01 · PLAN THE MONTH</span><h2>Set your expectations</h2><p>Save your own savings target. Expected Expenses follows Overview automatically.</p></div></div><form id="closure-expected-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
    ${input('expectedSavings','Expected Closing Savings',c.expectedSavings,'Your manually entered target. It changes only when you edit and save it.')}
    ${input('expectedExpenses','Expected Expenses',s.expectedExpenses,'Automatically taken from “This Month’s Tentative Expenses” on the Overview screen for the selected month and year.',{readonly:true})}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Expected Closing Savings</button><span>${closed?'This field shows the current Overview value; saved results below retain the value recorded when you closed the month.':'Edit tentative expenses through Monthly Budget Reference to change the Overview value.'}</span></div></fieldset></form></section>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">02 · OPENING AND CLOSING FIGURES</span><h2>Investments, lending and borrowing</h2><p>Save opening values at the start of the month. Add closing values at month-end. Each change is closing minus opening.</p></div></div>
    <form id="closure-components-form"><fieldset class="closure-component-fields" ${closed?'disabled':''}>${componentRows.map(row=>`<section class="closure-component-row" data-component="${row.id}"><h3>${row.title}</h3><div class="closure-component-inputs">
      ${input(row.opening,row.openingLabel,v[row.opening],row.openingHint,{min:'0',required:false})}
      ${input(row.closing,row.closingLabel,v[row.closing],row.closingHint,{min:'0',required:false})}
      ${input(row.difference,row.differenceLabel,s[row.difference],'Closing − opening. Positive means an increase; negative means a decrease.',{readonly:true,required:false})}</div></section>`).join('')}
      <div class="closure-form-actions"><button class="button primary" type="submit">Save Component Figures</button><span>Leave closing fields blank until month-end. Enter zero where there is no balance.</span></div>
      <div class="closure-copy-actions"><button type="button" class="button secondary small" data-copy-components="opening">Use Monthly Records as Opening</button><button type="button" class="button secondary small" data-copy-components="closing">Use Monthly Records as Closing</button><p>Copies this month’s current Investment and Money Lent and Borrowed totals into only the chosen set of fields. <a href="#investment">Review investments</a> · <a href="#money">Review lending and borrowing</a></p></div>
    </fieldset></form><p class="closure-component-note">The three balance changes are for comparison. They do not automatically become expenses or cash adjustments. Changing closing figures leaves saved opening figures unchanged.</p></section>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">03 · ACTUAL MONTH-END BALANCES</span><h2>Enter actual closing balances</h2><p>Use the cash and bank balances at the end of ${esc(monthName(key))}, even if you complete the closure later.</p></div></div><form id="closure-actual-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
    ${input('actualCash','Actual Closing Cash Balance',c.actualCash,'Cash you actually held on the selected month’s last day.',{min:'0'})}
    ${input('actualBank','Actual Closing Bank Balance',c.actualBank,'Bank balance on the selected month’s last day. A negative value can represent an overdraft.')}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Actual Balances</button><span>These balances stay unchanged when you record an Unaccounted Expense.</span></div></fieldset></form>
    <aside class="closure-late-help"><h3>Closing a month later?</h3>${lateClosureGuidance}</aside>
    <p class="closure-savings-formula">Actual Closing Savings = Actual Closing Cash + Actual Closing Bank Balance + Investment Value at End of Month + Money Lent Outstanding at End of Month − Money Borrowed or Held at End of Month. Tentative expenses are not subtracted.</p></section>
  <section class="card"><div class="card-heading"><div><span class="closure-step">04 · COMPARE YOUR RESULT</span><h2>${closed?'Saved month-end result':'Month-end result'}</h2><p>${closed?'These cards and the graphs show your saved closure snapshot. Reopen the month to update it.':'Based on the figures you have saved for the selected month.'}</p></div><span class="closure-target ${result.target}">${target}</span></div><div class="closure-metrics">
    ${metric('Expected Closing Savings',amount(result.expectedSavings),'Manually entered target')}
    ${metric('Actual Closing Savings',amount(result.actualSavings),'Uses your actual balances and saved closing components','closure-featured')}
    ${metric('Savings Difference',signed(result.savingsDifference),'Actual − expected',result.savingsDifference<0?'closure-negative':'')}
    ${metric('Expected Expenses',amount(result.expectedExpenses),closed?'Overview value saved at closure':'From This Month’s Tentative Expenses on Overview')}
    ${metric('Actual Expenses',fmt(result.actualExpenses),'Retained expense transactions, including the recorded Unaccounted Amount once')}
    ${metric('Unaccounted Amount',amount(result.unaccounted),`${fmt(result.recordedUnaccounted)} recorded as expense`,'closure-amber')}
    ${metric('Expense Difference',signed(result.expensesDifference),'Actual − expected; positive means higher spending')}
  </div></section>
  <section class="card closure-actions-card"><div class="card-heading"><div><span class="closure-step">05 · RECORD AND CLOSE</span><h2>Save and close this month</h2><p>The unexplained shortfall between your calculated and actual closing cash and bank balances, after accounting for recorded spending and other financial movements. Review missing entries before recording it as an expense.</p></div></div>
    <div class="closure-adjustment-summary"><p><strong>Unaccounted Amount = Calculated Closing Cash and Bank Balance − Actual Closing Cash and Bank Balance − Net Investment, Lending and Borrowing Adjustment</strong></p><p>${fmt(s.calculatedAccounts)} − (${amount(s.actualAccounts)}) − (${fmt(s.netFinancialAdjustment)}) = <strong>${amount(s.unaccounted)}</strong>. Negative results are shown as ₹0.</p><p>Calculated balances come from Transactions, before existing Unaccounted Expense adjustments. Your savings target and the three component differences are not part of this calculation.</p></div>
    <details class="closure-financial-adjustment" ${s.netFinancialAdjustment!==0?'open':''}><summary>Net Investment, Lending and Borrowing Adjustment <strong>${fmt(s.netFinancialAdjustment)}</strong></summary><p>Enter only confirmed cash or bank movements missing from Transactions. Use a <strong>positive</strong> amount for net money paid out (investing, lending, or repaying borrowing) and a <strong>negative</strong> amount for net money received (investment withdrawals, lending repayments, or new borrowing). Net adjustment = these outflows − these inflows.</p><p>Leave zero when all movements are already recorded. Do not include investment market-value changes or movements already counted in Transactions. If you later add a previously missing movement to Transactions, remove it from this adjustment too.</p>
      <form id="closure-adjustment-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
        ${input('cashFinancialAdjustment','Cash Financial Movement Adjustment',s.cashFinancialAdjustment,'Net financial outflow missing from cash transactions. Use a negative amount for net inflow.')}
        ${input('bankFinancialAdjustment','Bank Financial Movement Adjustment',s.bankFinancialAdjustment,'Net financial outflow missing from bank transactions. Use a negative amount for net inflow.')}
        <div class="closure-form-actions"><button class="button secondary" type="submit">Save Financial Adjustment</button><span>Applies to this closure only; it does not create a spending transaction.</span></div></fieldset></form>
    </details>
    <div class="closure-close-panel"><label class="closure-review-check"><input type="checkbox" id="closure-reviewed" ${closed?'disabled':''}><span>I have reviewed the month-end figures, missing transactions and financial movements, and confirmed any remaining unaccounted spending.</span></label>
      <div class="button-group"><button class="button secondary" id="record-unaccounted" ${closed||s.unaccounted===null||!sync?'disabled':''}>Record Unaccounted Expense</button><button class="button primary" id="close-month" ${closed?'disabled':''}>Close Month</button></div>
      <p>${closed?'Reopen Month to correct the saved figures.':s.unaccounted===null?'Save both actual closing balances before recording an expense.':sync?'Record or update the Unaccounted Expense before closing.':`${fmt(s.recordedUnaccounted)} is recorded as Unaccounted Expense. You can close the month after your review.`} Re-recording replaces the existing linked expense instead of adding a duplicate. Your entered actual closing balances remain unchanged.</p></div></section>
  ${renderComparisons(state,selection)}`;
}
export function renderComparisons(state,selection) {
  const keys=Object.keys(state.months).filter(key=>state.months[key].closure).sort();
  if(!keys.length)return '<section class="card closure-comparisons"><h2>Compare multiple months and years</h2><p>Save expected figures for a month to add it to the comparison graphs.</p></section>';
  const years=[...new Set(keys.map(key=>key.slice(0,4)))].sort().reverse();
  const selected=keys.filter(key=>selection.has(key)),rows=selected.map(key=>closureComparison(state,key));
  return `<section class="card closure-comparisons"><div class="card-heading"><div><h2>Compare multiple months and years</h2><p>Select any saved months. Closed months use saved closure snapshots; open months use their saved draft figures.</p></div><div class="button-group"><button class="button secondary small" id="compare-all">Select all</button><button class="button secondary small" id="compare-none">Clear selection</button></div></div>
    <div class="closure-month-picker">${years.map(year=>`<fieldset><legend>${year}</legend><div>${keys.filter(key=>key.startsWith(year+'-')).map(key=>`<label><input type="checkbox" data-compare-month="${key}" ${selection.has(key)?'checked':''}><span>${shortMonth(key)}${closureNeedsReview(state,key)?' · Review':getClosure(state,key).status==='closed'?' · Closed':' · Draft'}</span></label>`).join('')}</div></fieldset>`).join('')}</div>
    <div class="closure-chart-area" aria-live="polite">${rows.length?`${barChart(rows,'savings')}${barChart(rows,'expenses')}
`:'<p class="closure-chart-empty">Select one or more months to display the graphs.</p>'}</div></section>`;
}
function barChart(rows,kind) {
  const savings=kind==='savings',title=savings?'Savings graph':'Expenses graph';
  const expected=savings?'expectedSavings':'expectedExpenses',actual=savings?'actualSavings':'actualExpenses';
  const values=rows.flatMap(row=>[row[expected],row[actual]]).filter(value=>value!==null);
  const min=Math.min(0,...values),max=Math.max(100,...values),span=max-min,low=min<0?min-span*.08:0,high=max+span*.13;
  const width=Math.max(600,rows.length*160+90),height=330,left=85,right=20,top=20,bottom=65,plotHeight=height-top-bottom;
  const y=value=>top+(high-value)/(high-low)*plotHeight,zero=y(0),groupWidth=(width-left-right)/rows.length,barWidth=Math.min(35,groupWidth*.25);
  let shapes='';
  for(let index=0;index<=4;index++) {
    const value=low+(high-low)*index/4,py=y(value),label=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',notation:'compact',maximumFractionDigits:1}).format(value/100);
    shapes+=`<line class="chart-grid-line" x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text class="chart-axis-text" x="${left-10}" y="${py+4}" text-anchor="end">${esc(label)}</text>`;
  }
  shapes+=`<line class="chart-zero-line" x1="${left}" x2="${width-right}" y1="${zero}" y2="${zero}"/>`;
  const rect=(x,value,css,detail,offset=0)=>{
    const y1=y(offset),y2=y(offset+value),h=Math.max(2,Math.abs(y2-y1));
    return `<rect class="chart-bar ${css}" x="${x}" y="${Math.min(y1,y2)-(value===0?2:0)}" width="${barWidth}" height="${h}" rx="3" tabindex="0" role="button" aria-label="${esc(detail)}" data-chart-detail="${esc(detail)}"><title>${esc(detail)}</title></rect>`;
  };
  rows.forEach((row,index)=>{
    const centre=left+groupWidth*(index+.5),label=shortMonth(row.month),status=row.needsReview?' · Needs review':row.status==='closed'?'':' · Draft';
    if(row[expected]!==null)shapes+=rect(centre-barWidth-5,row[expected],'chart-expected-'+kind,`${label} · ${savings?'Expected Closing Savings':'Expected Expenses'}: ${fmt(row[expected])}${status}`);
    else shapes+=`<text class="chart-missing" x="${centre-barWidth/2-5}" y="${zero-9}" text-anchor="middle">—</text>`;
    if(row[actual]!==null) {
      if(savings)shapes+=rect(centre+5,row[actual],'chart-actual-savings',`${label} · Actual Closing Savings: ${fmt(row[actual])}${status}`);
      else {
        const ordinary=row.actualExpenses-row.recordedUnaccounted;
        const detail=`${label} · Actual Expenses: ${fmt(row.actualExpenses)} · Recorded expenses: ${fmt(ordinary)} · Unaccounted Amount included: ${fmt(row.recordedUnaccounted)}${status}`;
        if(ordinary>0||row.actualExpenses===0)shapes+=rect(centre+5,ordinary,'chart-actual-expenses',detail);
        if(row.recordedUnaccounted>0)shapes+=rect(centre+5,row.recordedUnaccounted,'chart-unaccounted',detail,ordinary);
      }
    } else shapes+=`<text class="chart-missing" x="${centre+barWidth/2+5}" y="${zero-9}" text-anchor="middle">—</text>`;
    shapes+=`<text class="chart-axis-text chart-month-label" x="${centre}" y="${height-35}" text-anchor="middle">${label}</text><text class="chart-status-text" x="${centre}" y="${height-17}" text-anchor="middle">${row.needsReview?'Review needed':row.status==='closed'?'Closed':'Draft'}</text>`;
  });
  return `<figure class="closure-chart"><figcaption><h3>${title}</h3><p>${savings?'Expected Closing Savings versus Actual Closing Savings.':'The actual-expense bar stacks recorded spending and the recorded Unaccounted Amount, counted once.'} Hover, focus or tap a bar for exact rupee amounts. Swipe horizontally to see more months.</p></figcaption><div class="chart-legend"><span><i class="chart-expected-${kind}"></i>${savings?'Expected Closing Savings':'Expected Expenses'}</span><span><i class="chart-actual-${kind}"></i>${savings?'Actual Closing Savings':'Recorded Expenses'}</span>${savings?'':'<span><i class="chart-unaccounted"></i>Unaccounted Amount within Actual Expenses</span>'}</div><div class="closure-chart-scroll"><svg viewBox="0 0 ${width} ${height}" style="min-width:${width}px" role="group" aria-label="${title}">${shapes}</svg></div><p class="closure-chart-detail" data-chart-readout role="status">Select a bar to see its exact amount. A dash means a figure has not been entered.</p></figure>`;
}
