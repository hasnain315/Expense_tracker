import { formatMoney as fmt, rupees, monthName } from './core.mjs?v=20261107-month-end-closure';
import { getClosure, closureSummary, closureNeedsReview, closureComparison, adjustmentsNeedSync } from './closure.mjs?v=20261107-month-end-closure';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>value===null?'Not entered':fmt(value);
const signed=value=>value===null?'Not entered':`${value>0?'+':''}${fmt(value)}`;
const shortMonth=key=>new Date(key+'-01T12:00:00').toLocaleDateString('en-IN',{month:'short',year:'numeric'});
const input=(name,label,value,hint,min='')=>`<label>${label}<div class="currency-input"><span>₹</span><input name="${name}" aria-label="${label}" type="number" step="0.01" ${min!==''?`min="${min}"`:''} inputmode="decimal" placeholder="Enter manually" value="${value===null?'':rupees(value)}" required></div><small>${hint}</small></label>`;
const metric=(label,value,hint='',className='')=>`<section class="closure-metric ${className}"><h3>${label}</h3><strong>${value}</strong>${hint?`<p>${hint}</p>`:''}</section>`;
export function renderClosure(state,key,selection) {
  const c=getClosure(state,key),s=closureSummary(state,key),closed=c.status==='closed',review=closureNeedsReview(state,key),sync=adjustmentsNeedSync(state,key);
  const result=closed&&c.snapshot?c.snapshot:s;
  const target=result.target==='not-set'?'Enter expected savings and actual balances':`Savings target ${result.target}`;
  const status=closed?(review?'Closed · needs review':'Month closed'):(c.snapshot?'Reopened for corrections':'Month open');
  const mismatch=s.unaccounted!==null&&(s.cashShortfall!==s.recordedCash||s.bankShortfall!==s.recordedBank);
  const reconRow=account=>{
    const cash=account==='cash',base=cash?s.calculatedCash:s.calculatedBank,actual=cash?s.actualCash:s.actualBank,posted=cash?s.recordedCash:s.recordedBank,shortfall=cash?s.cashShortfall:s.bankShortfall,excess=cash?s.cashExcess:s.bankExcess;
    return `<tr><th scope="row">${cash?'Cash':'Bank'}</th><td>${fmt(base)}</td><td>${amount(actual)}</td><td>${amount(shortfall)}</td><td>${fmt(posted)}</td><td>${amount(excess)}</td></tr>`;
  };
  return `<div class="closure-status ${review?'closure-warning':''}"><div><strong>${status}</strong><p>${closed?`Closed ${esc(new Date(c.closedAt).toLocaleString('en-IN'))}. ${review?'Transactions, balances or closing components changed. Reopen, review and close again.':'Saved results remain available when you switch months or devices.'}`:'Save your expectations at the start of the month, then reconcile and close at month-end.'}</p></div>${closed?'<button class="button secondary" id="reopen-month">Reopen Month</button>':''}</div>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">01 · START OF MONTH</span><h2>Set your expectations</h2><p>Enter both amounts yourself. They stay unchanged until you manually edit and save them.</p></div></div><form id="closure-expected-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
    ${input('expectedSavings','Expected Closing Savings',c.expectedSavings,'Your savings target for the end of this month. Negative savings are allowed.')}
    ${input('expectedExpenses','Expected Expenses',c.expectedExpenses,'Your independently entered expense estimate for this month.','0')}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Expected Figures</button><span>No amounts are copied from other screens.</span></div></fieldset></form></section>
  <section class="card closure-form-card"><div class="card-heading"><div><span class="closure-step">02 · END OF MONTH</span><h2>Enter actual closing balances</h2><p>Use the cash you actually have and the bank balance at the end of ${esc(monthName(key))}.</p></div></div><form id="closure-actual-form"><fieldset class="closure-fields" ${closed?'disabled':''}>
    ${input('actualCash','Actual Closing Cash Balance',c.actualCash,'Count your cash at month-end.','0')}
    ${input('actualBank','Actual Closing Bank Balance',c.actualBank,'Enter the actual bank balance; use a negative amount for an overdraft.')}
    <div class="closure-form-actions"><button class="button primary" type="submit">Save Actual Balances</button><span>Save these balances before reviewing the result below.</span></div></fieldset></form>
    <div class="closure-components"><h3>Review the closing values for this month</h3><p>Update these monthly records to their month-end values before closing.</p><dl><div><dt>Investments</dt><dd>${fmt(s.investment)} <a href="#investment">Review investments</a></dd></div><div><dt>Money lent to others</dt><dd>${fmt(s.lent)} <a href="#money">Review lending</a></dd></div><div><dt>Money borrowed or held for others</dt><dd>${fmt(s.held)} <a href="#money">Review borrowing</a></dd></div></dl><p class="closure-formula">Actual Closing Savings = Actual Closing Cash + Actual Closing Bank Balance + Closing Investments + Closing Money Lent − Closing Money Borrowed or Held. Tentative expenses are not subtracted.</p></div></section>
  <section class="card"><div class="card-heading"><div><span class="closure-step">03 · COMPARE YOUR RESULT</span><h2>${closed?'Saved month-end result':'Month-end result'}</h2><p>${closed?'The cards below show the saved closure snapshot. The reconciliation below uses current records.':'Based on the figures you have saved for this month.'}</p></div><span class="closure-target ${result.target}">${target}</span></div><div class="closure-metrics">
    ${metric('Expected Closing Savings',amount(result.expectedSavings),'Manually entered target')}
    ${metric('Actual Closing Savings',amount(result.actualSavings),'Uses actual closing balances and closing components','closure-featured')}
    ${metric('Savings Difference',signed(result.savingsDifference),'Actual − expected',result.savingsDifference<0?'closure-negative':'')}
    ${metric('Expected Expenses',amount(result.expectedExpenses),'Manually entered estimate')}
    ${metric('Actual Expenses',fmt(result.actualExpenses),'Retained expenses, including recorded unaccounted expense once')}
    ${metric('Unaccounted Amount',amount(result.unaccounted),`${fmt(result.recordedUnaccounted)} recorded as expense`,'closure-amber')}
    ${metric('Expense Difference',signed(result.expensesDifference),'Actual − expected; positive means higher spending')}
  </div></section>
  <section class="card"><div class="card-heading"><div><span class="closure-step">04 · RECONCILE YOUR ACCOUNTS</span><h2>Explain the account differences</h2><p>Only a shortfall in cash or bank becomes an unaccounted expense. A missed savings target by itself does not.</p></div></div>
    <div class="table-scroll"><table class="closure-reconciliation"><caption class="sr-only">Current cash and bank reconciliation for ${esc(monthName(key))}</caption><thead><tr><th>Account</th><th>Calculated from records<br>before closure adjustment</th><th>Actual closing balance</th><th>Unexplained shortfall</th><th>Adjustment already recorded</th><th>Unexplained excess</th></tr></thead><tbody>${reconRow('cash')}${reconRow('bank')}</tbody></table></div>
    <div class="closure-reconcile-help"><p>Calculated Closing Savings from ordinary records: <strong>${fmt(s.calculatedSavings)}</strong>. Recorded expenses before closure adjustments: <strong>${fmt(s.expensesBeforeAdjustment)}</strong>.</p>
      <p>${s.unaccounted===null?'Save both actual balances to calculate the shortfall.':mismatch?`The adjustment needs updating. Cash requires ${fmt(s.cashShortfall)} and bank requires ${fmt(s.bankShortfall)} in total. Existing linked adjustments will be replaced, so no expense is counted twice.`:`${fmt(s.recordedUnaccounted)} in unaccounted expenses is recorded. Both accounts’ shortfalls are fully reconciled.`}</p>
      ${s.cashExcess||s.bankExcess?'<p class="warning-text">An account has more money than its records explain. Review missing income or transfers. Excess amounts are shown separately and never turned into expenses or offset against another account’s shortfall.</p>':''}
      <p>Before recording an adjustment, review missing transactions, transfers between cash and bank, lending, borrowing and investment movements. Correct the underlying records first wherever possible.</p></div>
    <div class="closure-close-panel"><label class="closure-review-check"><input type="checkbox" id="closure-reviewed" ${closed?'disabled':''}><span>I have reviewed missing transactions, transfers, closing investments, lending and borrowing, and any account differences.</span></label><div class="button-group"><button class="button secondary" id="record-unaccounted" ${closed||s.unaccounted===null||!sync?'disabled':''}>Record Unaccounted Expense</button><button class="button primary" id="close-month" ${closed?'disabled':''}>Close Month</button></div><p>${closed?'Reopen this month to correct its saved figures or adjustments.':sync?'Record or update the adjustment after your review, then close the month.':'Close Month saves a snapshot of these figures and differences.'} Adjustments update transaction expenses; your entered actual closing balances stay unchanged.</p></div></section>
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
      <details class="closure-exact"><summary>View exact comparison amounts</summary><div class="table-scroll"><table><thead><tr><th>Month</th><th>Status</th><th>Expected savings</th><th>Actual savings</th><th>Expected expenses</th><th>Actual expenses</th><th>Unaccounted expense<br>included in actual</th></tr></thead><tbody>${rows.map(row=>`<tr><th>${shortMonth(row.month)}</th><td>${row.needsReview?'Needs review':row.status==='closed'?'Closed':'Draft'}</td><td>${amount(row.expectedSavings)}</td><td>${amount(row.actualSavings)}</td><td>${amount(row.expectedExpenses)}</td><td>${fmt(row.actualExpenses)}</td><td>${fmt(row.recordedUnaccounted)}</td></tr>`).join('')}</tbody></table></div></details>`:'<p class="closure-chart-empty">Select one or more months to display the graphs.</p>'}</div></section>`;
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
